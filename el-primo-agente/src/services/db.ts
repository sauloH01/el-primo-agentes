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
    stage: (row.stage as Stage) ?? "nuevo",
    qualification: (row.qualification as Qualification) ?? "en_proceso",
    tiers: parseTiers(row.tiers_json),
    hubspotContactId: row.hubspot_contact_id ?? null,
    hubspotDealId: row.hubspot_deal_id ?? null,
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
   * Arregla el bug de descartar números desconocidos.
   */
  async upsertLeadByPhone(
    phone: string,
    seed: { name?: string; city?: string; budget?: number; agentId?: string } = {}
  ): Promise<Lead> {
    const p = normalizePhone(phone);
    const existing = await this.getLeadByPhone(p);
    if (existing) return existing;

    const id = uuid();
    await this.db
      .prepare(
        `INSERT INTO leads (id, agent_id, name, phone, city, budget, stage, qualification)
         VALUES (?, ?, ?, ?, ?, ?, 'nuevo', 'en_proceso')`
      )
      .bind(
        id,
        seed.agentId ?? this.defaultAgentId,
        seed.name ?? null,
        p,
        seed.city ?? null,
        Math.round(seed.budget ?? 0)
      )
      .run();

    const lead = await this.getLeadById(id);
    if (!lead) throw new Error("No se pudo crear el lead");
    return lead;
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
}
