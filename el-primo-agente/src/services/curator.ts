/**
 * curator.ts — Capa de Curación Autónoma (Self-Improving Agent)
 *
 * Tres etapas que corren en el Cron Trigger (cada 4h):
 *
 *   CALIFICA  → Toma trazas sin juzgar, las envía al LLM-Juez, guarda el veredicto.
 *   CONSOLIDA → Trazas con score >= 4.5 se formatean como few-shots y se guardan en D1 + KV.
 *   PODA      → Trazas/few-shots con score bajo o inactivos se flagan para deshabilitar.
 */

import type { Env, ConversationTrace, JudgeVerdict, FewShotExample } from "../types";

const BATCH_SIZE       = 20;   // trazas por ciclo de juicio
const PROMOTE_THRESHOLD = 4.5; // score mínimo para few-shot
const PRUNE_THRESHOLD   = 2.0; // score máximo para marcar como malo
const PRUNE_AFTER_DAYS  = 30;  // few-shots sin uso por X días → candidatos a podar
const FEW_SHOT_KV_KEY   = "few_shots_active";

// ─── CALIFICA ─────────────────────────────────────────────────────────────────

export async function califica(env: Env): Promise<{ evaluated: number; errors: number }> {
  const db = env.DB;
  const res = await db
    .prepare(
      `SELECT id, lead_id, correlation_id, input_raw, output_raw,
              stage_before, stage_after, is_qualified, latency_ms, model, tokens_used, created_at
       FROM conversation_traces
       WHERE judge_score IS NULL
       ORDER BY created_at ASC
       LIMIT ?`
    )
    .bind(BATCH_SIZE)
    .all();

  const traces = (res.results ?? []) as any[];
  let evaluated = 0;
  let errors = 0;

  for (const row of traces) {
    try {
      const trace: ConversationTrace = {
        id: row.id,
        leadId: row.lead_id,
        correlationId: row.correlation_id,
        inputRaw: row.input_raw,
        outputRaw: row.output_raw,
        stageBefore: row.stage_before,
        stageAfter: row.stage_after,
        isQualified: Number(row.is_qualified) === 1,
        latencyMs: Number(row.latency_ms),
        model: row.model,
        tokensUsed: Number(row.tokens_used) || 0,
        createdAt: row.created_at,
      };

      const verdict = await judgeTrace(trace, env);

      await db
        .prepare(
          `UPDATE conversation_traces
           SET judge_score = ?, judge_feedback = ?, flagged_pruning = ?
           WHERE id = ?`
        )
        .bind(
          verdict.totalScore,
          JSON.stringify(verdict),
          verdict.totalScore <= PRUNE_THRESHOLD ? 1 : 0,
          trace.id
        )
        .run();

      evaluated++;
    } catch (err) {
      console.error("[Curator/Califica] error en traza", row.id, err);
      errors++;
    }
  }

  console.log(`[Curator/Califica] evaluadas=${evaluated} errores=${errors}`);
  return { evaluated, errors };
}

// ─── CONSOLIDA ────────────────────────────────────────────────────────────────

export async function consolida(env: Env): Promise<{ promoted: number }> {
  const db = env.DB;
  const res = await db
    .prepare(
      `SELECT t.id, t.lead_id, t.input_raw, t.output_raw, t.judge_feedback, t.stage_after,
              l.project_type, l.budget
       FROM conversation_traces t
       LEFT JOIN leads l ON l.id = t.lead_id
       WHERE t.judge_score >= ? AND t.promoted = 0
       ORDER BY t.judge_score DESC
       LIMIT 10`
    )
    .bind(PROMOTE_THRESHOLD)
    .all();

  const rows = (res.results ?? []) as any[];
  let promoted = 0;

  for (const row of rows) {
    const budgetTier = classifyBudget(Number(row.budget) || 0);
    const id = crypto.randomUUID();

    await db
      .prepare(
        `INSERT OR IGNORE INTO few_shots
         (id, trace_id, project_type, budget_tier, input, ideal_output, avg_score, is_active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))`
      )
      .bind(
        id,
        row.id,
        row.project_type ?? null,
        budgetTier,
        row.input_raw,
        row.output_raw,
        PROMOTE_THRESHOLD
      )
      .run();

    await db
      .prepare("UPDATE conversation_traces SET promoted = 1 WHERE id = ?")
      .bind(row.id)
      .run();

    promoted++;
  }

  // Actualizar cache KV con los few-shots activos más recientes
  if (promoted > 0) {
    await refreshKvCache(env);
  }

  console.log(`[Curator/Consolida] promovidos=${promoted}`);
  return { promoted };
}

// ─── PODA ─────────────────────────────────────────────────────────────────────

export async function poda(env: Env): Promise<{ pruned: number; alerts: string[] }> {
  const db = env.DB;
  const alerts: string[] = [];

  // Podar few-shots sin uso en X días
  const staleRes = await db
    .prepare(
      `SELECT id, project_type, created_at, last_used_at
       FROM few_shots
       WHERE is_active = 1
         AND (last_used_at IS NULL OR last_used_at < datetime('now', ?))
       ORDER BY created_at ASC
       LIMIT 20`
    )
    .bind(`-${PRUNE_AFTER_DAYS} days`)
    .all();

  const stale = (staleRes.results ?? []) as any[];
  let pruned = 0;

  for (const row of stale) {
    await db
      .prepare("UPDATE few_shots SET is_active = 0 WHERE id = ?")
      .bind(row.id)
      .run();

    alerts.push(`[PODA] few_shot ${row.id} (${row.project_type}) deshabilitado por inactividad.`);
    pruned++;
  }

  // Detectar instrucciones con baja recurrencia (flag para revisión manual)
  const lowScoreCount = await db
    .prepare(
      `SELECT COUNT(*) AS c FROM conversation_traces
       WHERE judge_score IS NOT NULL AND judge_score < ? AND created_at > datetime('now', '-7 days')`
    )
    .bind(PRUNE_THRESHOLD)
    .first<{ c: number }>();

  const badCount = Number(lowScoreCount?.c ?? 0);
  if (badCount >= 5) {
    alerts.push(`[ALERTA] ${badCount} interacciones con score bajo esta semana. Revisar knowledge.ts o few-shots activos.`);
  }

  if (pruned > 0) {
    await refreshKvCache(env);
  }

  console.log(`[Curator/Poda] podados=${pruned} alertas=${alerts.length}`);
  alerts.forEach((a) => console.warn(a));
  return { pruned, alerts };
}

// ─── LLM-AS-A-JUDGE ──────────────────────────────────────────────────────────

async function judgeTrace(trace: ConversationTrace, env: Env): Promise<JudgeVerdict> {
  const model = env.JUDGE_MODEL ?? "gpt-4o";

  const systemPrompt = `Eres un evaluador experto de agentes de ventas conversacionales de WhatsApp.
Tu trabajo es calificar cada interacción del agente en TRES dimensiones del 1 al 5:

1. MAPEO (scoreMapping): ¿El agente capturó correctamente los datos del lead (nombre, ciudad, presupuesto, tipo de proyecto)?
   5 = todos los datos disponibles capturados | 3 = algunos capturados | 1 = ninguno capturado o ignorados

2. EXTRACCIÓN (scoreExtraction): ¿Los tiers estimados y la calificación (isQualified) son coherentes con el presupuesto y tipo de proyecto informados?
   5 = coherente y proporcional | 3 = aproximadamente correcto | 1 = incoherente (ej: tiers de $4M para presupuesto $100M)

3. RESILIENCIA (scoreResilience): ¿El agente manejó bien mensajes ambiguos, cambios de tema o información incompleta?
   5 = excelente recuperación y redirección | 3 = correcto pero sin elegancia | 1 = confundido o atascado

Devuelve SOLO este JSON:
{
  "scoreMapping": NUMBER_1_5,
  "scoreExtraction": NUMBER_1_5,
  "scoreResilience": NUMBER_1_5,
  "totalScore": PROMEDIO_FLOAT,
  "critique": "Crítica constructiva en 1-2 oraciones.",
  "promoteFewShot": BOOLEAN
}`;

  const userMsg = `TRAZA A EVALUAR:
- Etapa antes: ${trace.stageBefore} → después: ${trace.stageAfter}
- Lead calificado: ${trace.isQualified}
- Latencia: ${trace.latencyMs}ms

MENSAJE DEL USUARIO:
${trace.inputRaw}

RESPUESTA DEL AGENTE:
${trace.outputRaw}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMsg },
      ],
    }),
  });

  if (!res.ok) throw new Error(`Judge API error: ${res.status}`);
  const json: any = await res.json();
  const parsed: Partial<JudgeVerdict> = JSON.parse(json.choices?.[0]?.message?.content ?? "{}");

  const m = Number(parsed.scoreMapping ?? 3);
  const e = Number(parsed.scoreExtraction ?? 3);
  const r = Number(parsed.scoreResilience ?? 3);
  const total = Math.round(((m + e + r) / 3) * 10) / 10;

  return {
    scoreMapping: m,
    scoreExtraction: e,
    scoreResilience: r,
    totalScore: total,
    critique: parsed.critique ?? "",
    promoteFewShot: total >= PROMOTE_THRESHOLD,
  };
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function classifyBudget(budget: number): FewShotExample["budgetTier"] {
  if (budget >= 50_000_000) return "muy_alto";
  if (budget >= 20_000_000) return "alto";
  if (budget >= 5_000_000)  return "medio";
  return "bajo";
}

async function refreshKvCache(env: Env): Promise<void> {
  try {
    const res = await env.DB
      .prepare(
        `SELECT id, project_type, budget_tier, input, ideal_output, avg_score
         FROM few_shots WHERE is_active = 1
         ORDER BY avg_score DESC, use_count DESC
         LIMIT 10`
      )
      .all();

    const examples = (res.results ?? []).map((r: any) => ({
      projectType: r.project_type,
      budgetTier: r.budget_tier,
      input: r.input,
      idealOutput: r.ideal_output,
    }));

    await env.CURATOR_KV.put(FEW_SHOT_KV_KEY, JSON.stringify(examples), {
      expirationTtl: 60 * 60 * 6, // 6 horas
    });
  } catch (err) {
    console.error("[Curator] Error actualizando KV cache:", err);
  }
}

/** Carga los few-shots activos desde KV (cache caliente). */
export async function loadFewShots(env: Env): Promise<
  { projectType: string | null; budgetTier: string; input: string; idealOutput: string }[]
> {
  try {
    const raw = await env.CURATOR_KV.get(FEW_SHOT_KV_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // Si KV no disponible, retorna vacío — el agente funciona sin few-shots
  }
  return [];
}
