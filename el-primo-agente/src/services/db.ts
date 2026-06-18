// src/services/db.ts
// Capa de datos sobre Cloudflare D1. Única fuente de verdad del CRM.
// Reemplaza al antiguo NotionClient.

import type {
  Lead,
  Tier,
  Stage,
  Qualification,
  ConversationMessage,
  Direction,
  MediaType,
  QuoteRecord,
  QuoteParams,
} from "../types";

/** Normaliza un teléfono a E.164 colombiano (+57...). */
export function normalizePhone(raw: string): string {
  let p = (raw || "").replace("whatsapp:", "").trim();
  p = p.replace(/[\s\-()]/g, "");
  if (p.startsWith("+")) return p;
  // Colombia: 10 dígitos locales (móvil empieza por 3) → anteponer +57
  if (/^3\d{9}$/.test(p)) return `+57${p}`;
  if (p.startsWith("57")) return `+${p}`;
  return `+${p}`;
}

function uuid(): string {
  return crypto.randomUUID();
}

function parseTiers(json: string | null): Tier[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Convierte una fila cruda de D1 al tipo Lead. */
function rowToLead(row: any): Lead {
  return {
    id: row.id,
    agentId: row.agent_id,
    name: row.name ?? null,
    phone: row.phone,
    city: row.city ?? null,
    budget: Number(row.budget) || 0,
    projectType: row.project_type ?? null,
    source: (row.source as "landing" | "organico") ?? "organico",
    stage: (row.stage as Stage) ?? "nuevo",
    qualification: (row.qualification as Qualification) ?? "en_proceso",
    tiers: parseTiers(row.tiers_json),
    hubspotContactId: row.hubspot_contact_id ?? null,
    hubspotDealId: row.hubspot_deal_id ?? null,
    notas: row.notas ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class DB {
  constructor(private db: D1Database, private defaultAgentId = "el-primo-agente") {}

  /** Busca un lead por teléfono (lo normaliza primero). */
  async getLeadByPhone(phone: string): Promise<Lead | null> {
    const p = normalizePhone(phone);
    const row = await this.db
      .prepare("SELECT * FROM leads WHERE phone = ?")
      .bind(p)
      .first();
    return row ? rowToLead(row) : null;
  }

  async getLeadById(id: string): Promise<Lead | null> {
    const row = await this.db.prepare("SELECT * FROM leads WHERE id = ?").bind(id).first();
    return row ? rowToLead(row) : null;
  }

  /**
   * Crea el lead si no existe (primer contacto entrante) y lo devuelve.
   * Si ya existe, devuelve el existente sin sobrescribir datos.
   */
  async upsertLeadByPhone(
    phone: string,
    seed: {
      name?: string;
      city?: string;
      budget?: number;
      agentId?: string;
      projectType?: string;
      source?: "landing" | "organico";
    } = {}
  ): Promise<Lead> {
    const p = normalizePhone(phone);
    const existing = await this.getLeadByPhone(p);
    if (existing) return existing;

    const id = uuid();
    await this.db
      .prepare(
        `INSERT INTO leads (id, agent_id, name, phone, city, budget, project_type, source, stage, qualification)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'nuevo', 'en_proceso')`
      )
      .bind(
        id,
        seed.agentId ?? this.defaultAgentId,
        seed.name ?? null,
        p,
        seed.city ?? null,
        Math.round(seed.budget ?? 0),
        seed.projectType ?? null,
        seed.source ?? "organico"
      )
      .run();

    const lead = await this.getLeadById(id);
    if (!lead) throw new Error("No se pudo crear el lead");
    return lead;
  }

  /** Enriquece un lead existente con datos de la landing (solo rellena campos vacíos). */
  async enrichFromLanding(
    id: string,
    data: { name?: string; city?: string; budget?: number; projectType?: string }
  ): Promise<void> {
    const lead = await this.getLeadById(id);
    if (!lead) return;
    await this.updateLead(id, {
      name:        !lead.name && data.name ? data.name : undefined,
      city:        !lead.city && data.city ? data.city : undefined,
      budget:      lead.budget === 0 && data.budget ? data.budget : undefined,
      projectType: !lead.projectType && data.projectType ? data.projectType : undefined,
    });
  }

  /** Añade un mensaje al historial. Soporta medios (audio, imagen, etc.). */
  async appendMessage(
    leadId: string,
    direction: Direction,
    body: string,
    media?: { type: MediaType; url?: string; transcription?: string }
  ): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO messages (lead_id, direction, body, media_type, media_url, transcription)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(leadId, direction, body, media?.type ?? null, media?.url ?? null, media?.transcription ?? null)
      .run();
  }

  /** Devuelve los últimos N mensajes en orden cronológico (para la memoria del agente). */
  async getConversation(leadId: string, limit = 20): Promise<ConversationMessage[]> {
    const res = await this.db
      .prepare(
        `SELECT direction, body, created_at, media_type, media_url, transcription
         FROM messages WHERE lead_id = ? ORDER BY id DESC LIMIT ?`
      )
      .bind(leadId, limit)
      .all();
    const rows = (res.results ?? []) as any[];
    return rows.reverse().map((r) => ({
      direction: r.direction as Direction,
      body: r.body,
      createdAt: r.created_at,
      mediaType: r.media_type ?? undefined,
      mediaUrl: r.media_url ?? undefined,
      transcription: r.transcription ?? undefined,
    }));
  }

  /** Actualiza etapa/calificación/tiers/datos de un lead. */
  async updateLead(
    id: string,
    updates: {
      stage?: Stage;
      qualification?: Qualification;
      tiers?: Tier[];
      name?: string;
      city?: string;
      budget?: number;
      projectType?: string;
    }
  ): Promise<void> {
    const sets: string[] = [];
    const vals: any[] = [];
    if (updates.stage !== undefined) {
      sets.push("stage = ?");
      vals.push(updates.stage);
    }
    if (updates.projectType !== undefined) {
      sets.push("project_type = ?");
      vals.push(updates.projectType);
    }
    if (updates.qualification !== undefined) {
      sets.push("qualification = ?");
      vals.push(updates.qualification);
    }
    if (updates.tiers !== undefined) {
      sets.push("tiers_json = ?");
      vals.push(JSON.stringify(updates.tiers));
    }
    if (updates.name !== undefined) {
      sets.push("name = ?");
      vals.push(updates.name);
    }
    if (updates.city !== undefined) {
      sets.push("city = ?");
      vals.push(updates.city);
    }
    if (updates.budget !== undefined) {
      sets.push("budget = ?");
      vals.push(Math.round(updates.budget));
    }
    if (sets.length === 0) return;
    sets.push("updated_at = datetime('now')");
    vals.push(id);
    await this.db.prepare(`UPDATE leads SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
  }

  /** Guarda los ids de HubSpot espejados en el lead. */
  async setHubspotIds(
    id: string,
    ids: { contactId?: string; dealId?: string }
  ): Promise<void> {
    const sets: string[] = [];
    const vals: any[] = [];
    if (ids.contactId !== undefined) {
      sets.push("hubspot_contact_id = ?");
      vals.push(ids.contactId);
    }
    if (ids.dealId !== undefined) {
      sets.push("hubspot_deal_id = ?");
      vals.push(ids.dealId);
    }
    if (sets.length === 0) return;
    vals.push(id);
    await this.db.prepare(`UPDATE leads SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
  }

  /** Registra un evento de auditoría/analítica. */
  async logEvent(type: string, leadId: string | null, payload?: unknown): Promise<void> {
    await this.db
      .prepare("INSERT INTO events (lead_id, type, payload_json) VALUES (?, ?, ?)")
      .bind(leadId, type, payload ? JSON.stringify(payload) : null)
      .run();
  }

  /* ------------------------- Consultas del dashboard ------------------------- */

  /** Lista leads con filtros opcionales (etapa, búsqueda por nombre/teléfono). */
  async listLeads(opts: { stage?: string; q?: string; limit?: number } = {}): Promise<Lead[]> {
    const where: string[] = [];
    const vals: any[] = [];
    if (opts.stage && opts.stage !== "todos") {
      where.push("stage = ?");
      vals.push(opts.stage);
    }
    if (opts.q) {
      where.push("(name LIKE ? OR phone LIKE ?)");
      vals.push(`%${opts.q}%`, `%${opts.q}%`);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    vals.push(opts.limit ?? 200);
    const res = await this.db
      .prepare(`SELECT * FROM leads ${whereSql} ORDER BY updated_at DESC LIMIT ?`)
      .bind(...vals)
      .all();
    return ((res.results ?? []) as any[]).map(rowToLead);
  }

  /** Detalle de un lead + su conversación completa. */
  async getLeadWithConversation(
    id: string,
    limit = 200
  ): Promise<{ lead: Lead; messages: ConversationMessage[] } | null> {
    const lead = await this.getLeadById(id);
    if (!lead) return null;
    const messages = await this.getConversation(id, limit);
    return { lead, messages };
  }

  /** Métricas para el overview: conteo por etapa, totales y serie diaria (14 días). */
  async getStats(): Promise<{
    total: number;
    byStage: Record<string, number>;
    newToday: number;
    daily: { date: string; count: number }[];
  }> {
    const stageRes = await this.db
      .prepare("SELECT stage, COUNT(*) AS c FROM leads GROUP BY stage")
      .all();
    const byStage: Record<string, number> = {};
    let total = 0;
    for (const r of (stageRes.results ?? []) as any[]) {
      byStage[r.stage] = Number(r.c);
      total += Number(r.c);
    }

    const todayRes = await this.db
      .prepare("SELECT COUNT(*) AS c FROM leads WHERE date(created_at) = date('now')")
      .first();
    const newToday = Number((todayRes as any)?.c ?? 0);

    const dailyRes = await this.db
      .prepare(
        `SELECT date(created_at) AS d, COUNT(*) AS c FROM leads
         WHERE created_at >= datetime('now', '-14 days')
         GROUP BY date(created_at) ORDER BY d ASC`
      )
      .all();
    const daily = ((dailyRes.results ?? []) as any[]).map((r) => ({
      date: r.d,
      count: Number(r.c),
    }));

    return { total, byStage, newToday, daily };
  }

  /** Guarda una nota de Audenar en el lead. */
  async addNote(id: string, nota: string): Promise<void> {
    await this.db
      .prepare("UPDATE leads SET notas = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(nota.trim(), id)
      .run();
  }

  /** Historial de eventos de un lead para la línea de tiempo de actividad. */
  async getLeadEvents(
    leadId: string,
    limit = 50
  ): Promise<{ type: string; payload: unknown; createdAt: string }[]> {
    const res = await this.db
      .prepare(
        "SELECT type, payload_json, created_at FROM events WHERE lead_id = ? ORDER BY created_at DESC LIMIT ?"
      )
      .bind(leadId, limit)
      .all();
    return ((res.results ?? []) as any[]).map((r) => ({
      type: r.type,
      payload: r.payload_json ? JSON.parse(r.payload_json) : null,
      createdAt: r.created_at,
    }));
  }

  /** Métricas extendidas de revenue, funnel y leads estancados. */
  async getExtendedStats(): Promise<{
    revenueByStage: Record<string, number>;
    revenueTotal: number;
    avgDealSize: number;
    byCity: { city: string; count: number; revenue: number }[];
    byProjectType: { type: string; count: number; revenue: number }[];
    staleLeads: { id: string; name: string | null; phone: string; daysStale: number }[];
    conversionRates: { nuevoCal: number; calCot: number };
  }> {
    // Revenue por etapa (excluye rechazados)
    const revStageRes = await this.db
      .prepare(
        "SELECT stage, SUM(budget) AS rev FROM leads WHERE stage != 'rechazado' GROUP BY stage"
      )
      .all();
    const revenueByStage: Record<string, number> = {};
    let revenueTotal = 0;
    for (const r of (revStageRes.results ?? []) as any[]) {
      const v = Number(r.rev) || 0;
      revenueByStage[r.stage] = v;
      revenueTotal += v;
    }

    // Deal size promedio (leads con budget > 0)
    const avgRes = await this.db
      .prepare("SELECT AVG(budget) AS avg FROM leads WHERE budget > 0 AND stage != 'rechazado'")
      .first();
    const avgDealSize = Math.round(Number((avgRes as any)?.avg ?? 0));

    // Revenue y conteo por ciudad (top 8)
    const cityRes = await this.db
      .prepare(
        `SELECT COALESCE(city, 'Sin zona') AS city, COUNT(*) AS cnt, SUM(budget) AS rev
         FROM leads WHERE stage != 'rechazado' GROUP BY city ORDER BY rev DESC LIMIT 8`
      )
      .all();
    const byCity = ((cityRes.results ?? []) as any[]).map((r) => ({
      city: r.city as string,
      count: Number(r.cnt),
      revenue: Number(r.rev) || 0,
    }));

    // Revenue y conteo por tipo de proyecto (top 8)
    const typeRes = await this.db
      .prepare(
        `SELECT COALESCE(project_type, 'Sin definir') AS tipo, COUNT(*) AS cnt, SUM(budget) AS rev
         FROM leads WHERE stage != 'rechazado' GROUP BY project_type ORDER BY rev DESC LIMIT 8`
      )
      .all();
    const byProjectType = ((typeRes.results ?? []) as any[]).map((r) => ({
      type: r.tipo as string,
      count: Number(r.cnt),
      revenue: Number(r.rev) || 0,
    }));

    // Leads sin actividad > 3 días (no rechazados, no cotizados)
    const staleRes = await this.db
      .prepare(
        `SELECT id, name, phone,
                CAST((julianday('now') - julianday(updated_at)) AS INTEGER) AS days_stale
         FROM leads
         WHERE stage NOT IN ('rechazado','cotizado')
           AND updated_at < datetime('now', '-3 days')
         ORDER BY days_stale DESC LIMIT 10`
      )
      .all();
    const staleLeads = ((staleRes.results ?? []) as any[]).map((r) => ({
      id: r.id as string,
      name: r.name ?? null,
      phone: r.phone as string,
      daysStale: Number(r.days_stale),
    }));

    // Tasas de conversión
    const stageCountRes = await this.db
      .prepare("SELECT stage, COUNT(*) AS c FROM leads GROUP BY stage")
      .all();
    const sc: Record<string, number> = {};
    for (const r of (stageCountRes.results ?? []) as any[]) sc[r.stage] = Number(r.c);
    const totalActivos = (sc.nuevo ?? 0) + (sc.en_proceso ?? 0) + (sc.calificado ?? 0) + (sc.cotizado ?? 0);
    const nuevoCal = totalActivos > 0 ? ((sc.calificado ?? 0) + (sc.cotizado ?? 0)) / totalActivos : 0;
    const calCot = ((sc.calificado ?? 0) + (sc.cotizado ?? 0)) > 0
      ? (sc.cotizado ?? 0) / ((sc.calificado ?? 0) + (sc.cotizado ?? 0))
      : 0;

    return {
      revenueByStage,
      revenueTotal,
      avgDealSize,
      byCity,
      byProjectType,
      staleLeads,
      conversionRates: {
        nuevoCal: Math.round(nuevoCal * 100) / 100,
        calCot: Math.round(calCot * 100) / 100,
      },
    };
  }

  /** Lista de agentes registrados (panel multi-agente). */
  async listAgents(): Promise<
    { id: string; name: string; twilioNumber: string | null; active: boolean; leadCount: number }[]
  > {
    const res = await this.db
      .prepare(
        `SELECT a.id, a.name, a.twilio_number, a.active,
                (SELECT COUNT(*) FROM leads l WHERE l.agent_id = a.id) AS lead_count
         FROM agents a ORDER BY a.created_at ASC`
      )
      .all();
    return ((res.results ?? []) as any[]).map((r) => ({
      id: r.id,
      name: r.name,
      twilioNumber: r.twilio_number ?? null,
      active: Number(r.active) === 1,
      leadCount: Number(r.lead_count) || 0,
    }));
  }

  /* ─── Cotizaciones (Fase 2a) ──────────────────────────────────────── */

  private rowToQuote(row: any): QuoteRecord {
    return {
      id:        row.id,
      leadId:    row.lead_id,
      status:    row.status as "borrador" | "enviada",
      params:    row.params_json   ? JSON.parse(row.params_json)  : null,
      pricing:   row.pricing_json  ? JSON.parse(row.pricing_json) : null,
      prose:     row.prose_json    ? JSON.parse(row.prose_json)   : null,
      renderKey: row.render_key    ?? null,
      planKey:   row.plan_key      ?? null,
      docxKey:   row.docx_key      ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async getQuoteByLeadId(leadId: string): Promise<QuoteRecord | null> {
    const row = await this.db
      .prepare("SELECT * FROM quotes WHERE lead_id = ? ORDER BY created_at DESC LIMIT 1")
      .bind(leadId)
      .first();
    return row ? this.rowToQuote(row) : null;
  }

  async upsertQuote(
    leadId: string,
    data: {
      params?: QuoteParams;
      pricing?: Record<string, unknown>;
      prose?: Record<string, unknown>;
      status?: "borrador" | "enviada";
      renderKey?: string;
      planKey?: string;
      docxKey?: string;
    }
  ): Promise<QuoteRecord> {
    const existing = await this.getQuoteByLeadId(leadId);
    if (existing) {
      const sets: string[] = [];
      const vals: unknown[] = [];
      if (data.params   !== undefined) { sets.push("params_json = ?");  vals.push(JSON.stringify(data.params));   }
      if (data.pricing  !== undefined) { sets.push("pricing_json = ?"); vals.push(JSON.stringify(data.pricing));  }
      if (data.prose    !== undefined) { sets.push("prose_json = ?");   vals.push(JSON.stringify(data.prose));    }
      if (data.status   !== undefined) { sets.push("status = ?");       vals.push(data.status);                  }
      if (data.renderKey !== undefined){ sets.push("render_key = ?");   vals.push(data.renderKey);               }
      if (data.planKey  !== undefined) { sets.push("plan_key = ?");     vals.push(data.planKey);                 }
      if (data.docxKey  !== undefined) { sets.push("docx_key = ?");     vals.push(data.docxKey);                 }
      if (sets.length > 0) {
        sets.push("updated_at = datetime('now')");
        vals.push(existing.id);
        await this.db.prepare(`UPDATE quotes SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
      }
      const updated = await this.db.prepare("SELECT * FROM quotes WHERE id = ?").bind(existing.id).first();
      return this.rowToQuote(updated!);
    }

    const id = uuid();
    await this.db
      .prepare(
        `INSERT INTO quotes (id, lead_id, status, params_json, pricing_json, prose_json, render_key, plan_key, docx_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        leadId,
        data.status ?? "borrador",
        data.params  ? JSON.stringify(data.params)  : null,
        data.pricing ? JSON.stringify(data.pricing) : null,
        data.prose   ? JSON.stringify(data.prose)   : null,
        data.renderKey ?? null,
        data.planKey   ?? null,
        data.docxKey   ?? null,
      )
      .run();

    const created = await this.db.prepare("SELECT * FROM quotes WHERE id = ?").bind(id).first();
    return this.rowToQuote(created!);
  }

  /* ─── Sistema de curación autónoma (traza + few-shots) ─────────────── */

  async saveTrace(data: {
    leadId: string;
    correlationId: string;
    inputRaw: string;
    outputRaw: string;
    stageBefore: string;
    stageAfter: string;
    isQualified: boolean;
    latencyMs: number;
    model: string;
    tokensUsed: number;
  }): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO conversation_traces
         (id, lead_id, correlation_id, input_raw, output_raw,
          stage_before, stage_after, is_qualified, latency_ms, model, tokens_used)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        uuid(),
        data.leadId,
        data.correlationId,
        data.inputRaw,
        data.outputRaw,
        data.stageBefore,
        data.stageAfter,
        data.isQualified ? 1 : 0,
        data.latencyMs,
        data.model,
        data.tokensUsed
      )
      .run();
  }
}
