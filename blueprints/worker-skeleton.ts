/**
 * Base para cualquier agente de Cloudflare Agents.
 *
 * Este archivo es plantilla — el skill genera versiones customizadas
 * para cada alumno con su lógica específica de pipeline.
 *
 * Lo que ya está armado:
 *  - Clase Agent extendida (Durable Object stateful)
 *  - Estado persistente con coberturas previas
 *  - Endpoint /run para trigger manual
 *  - Endpoint /state para inspeccionar estado
 *  - Scheduled handler para cron diario
 *  - Pipeline stub que el skill llena según las respuestas del alumno
 */
import { Agent, getAgentByName } from "agents";

// ====================================================================
// El tipo `Env` describe TODAS las llaves/configs que tu agente necesita.
// El skill agregará aquí dinámicamente las que tu agente use.
// ====================================================================
export type Env = {
  // Binding obligatorio del Durable Object (no tocar)
  MiAgente: DurableObjectNamespace<MiAgente>;

  // Configs no-secretas (se setean en wrangler.jsonc):
  OPENAI_MODEL: string;

  // Llaves secretas (se suben con `wrangler secret put`):
  OPENAI_API_KEY: string;
  // <SKILL_INSERT_SECRETS> — el skill agrega aquí: APIFY_TOKEN, NOTION_TOKEN, etc.
};

// ====================================================================
// Estado que el agente recuerda entre ejecuciones.
// Persiste en el SQLite del Durable Object.
// ====================================================================
type AgentState = {
  lastRunAt: string | null;
  totalRunsCompleted: number;
  recentRuns: Array<{
    runAt: string;
    durationMs: number;
    ok: boolean;
    error?: string;
    // <SKILL_INSERT_STATE_FIELDS> — el skill agrega aquí más métricas
  }>;
  // <SKILL_INSERT_HISTORY> — ej. coveredTopics si el agente debe evitar duplicados
};

const INITIAL_STATE: AgentState = {
  lastRunAt: null,
  totalRunsCompleted: 0,
  recentRuns: [],
};

// ====================================================================
// La clase principal del agente.
// El nombre `MiAgente` se reemplaza por el nombre que el alumno escoja.
// ====================================================================
export class MiAgente extends Agent<Env, AgentState> {
  initialState = INITIAL_STATE;

  // Endpoint HTTP (curl puede llamarlo)
  async onRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);

    // Trigger manual del pipeline
    if (url.pathname === "/run" && req.method === "POST") {
      const result = await this.runPipeline();
      return Response.json(result);
    }

    // Ver el estado actual del agente
    if (url.pathname === "/state") {
      return Response.json(this.state);
    }

    // Health check
    return new Response("ok — agente vivo 🤖", { status: 200 });
  }

  /**
   * El pipeline principal del agente.
   * Aquí es donde el skill insertará la lógica específica del alumno.
   */
  async runPipeline(): Promise<{
    ok: boolean;
    durationMs: number;
    error?: string;
    // <SKILL_INSERT_RESULT_FIELDS>
  }> {
    const t0 = Date.now();
    const runRecord: AgentState["recentRuns"][number] = {
      runAt: new Date().toISOString(),
      durationMs: 0,
      ok: false,
    };

    try {
      // ====================================================
      // PASO 1: Conseguir información
      // <SKILL_INSERT_STEP_1> — scrape de Twitter / RSS / web / etc
      // ====================================================

      // ====================================================
      // PASO 2: Procesar con IA
      // <SKILL_INSERT_STEP_2> — call a OpenAI para resumir/clasificar/generar
      // ====================================================

      // ====================================================
      // PASO 3: Guardar resultado
      // <SKILL_INSERT_STEP_3> — save a Notion / Sheets / etc
      // ====================================================

      // ====================================================
      // PASO 4: Notificar
      // <SKILL_INSERT_STEP_4> — push notification al alumno
      // ====================================================

      runRecord.ok = true;
    } catch (err) {
      runRecord.error = err instanceof Error ? err.message : String(err);
      runRecord.ok = false;
    } finally {
      runRecord.durationMs = Date.now() - t0;
    }

    // Actualizar estado (persistente)
    this.setState({
      ...this.state,
      lastRunAt: runRecord.runAt,
      totalRunsCompleted: this.state.totalRunsCompleted + (runRecord.ok ? 1 : 0),
      recentRuns: [runRecord, ...this.state.recentRuns].slice(0, 30),
    });

    return {
      ok: runRecord.ok,
      durationMs: runRecord.durationMs,
      ...(runRecord.error && { error: runRecord.error }),
    };
  }
}

// ====================================================================
// El "worker" raíz que Cloudflare ejecuta.
// Solo enruta peticiones al Durable Object del agente.
// ====================================================================
export default {
  // Llamadas HTTP normales (curl, browser, etc)
  async fetch(req: Request, env: Env): Promise<Response> {
    const agent = await getAgentByName(env.MiAgente, "default");
    return agent.fetch(req);
  },

  // Cron diario — definido en wrangler.jsonc en `triggers.crons`
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const agent = await getAgentByName(env.MiAgente, "default");
    const internalReq = new Request("https://agent.internal/run", { method: "POST" });
    ctx.waitUntil(agent.fetch(internalReq).then((r) => r.text()));
  },
};
