// src/types.ts — tipos compartidos del Worker

export type Stage = "nuevo" | "en_proceso" | "calificado" | "cotizado" | "rechazado";
export type Qualification = "en_proceso" | "calificado";
export type Direction = "in" | "out";
export type MediaType = "audio" | "image" | "video" | "document" | "location";

/** Estimación de un tier de precio (COP). */
export interface Tier {
  tier: string;
  price: number;
}

/** Lead tal como vive en la base D1 (campos planos). */
export interface Lead {
  id: string;
  agentId: string;
  name: string | null;
  phone: string; // E.164, ej. +573001234567
  city: string | null;
  budget: number; // COP
  projectType: string | null; // tipo de mueble/proyecto
  source: "landing" | "organico"; // cómo llegó el lead
  stage: Stage;
  qualification: Qualification;
  tiers: Tier[];
  hubspotContactId: string | null;
  hubspotDealId: string | null;
  notas: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Un mensaje del historial de conversación. */
export interface ConversationMessage {
  direction: Direction;
  body: string;
  createdAt: string;
  mediaType?: MediaType;
  mediaUrl?: string;
  transcription?: string;
}

/** Datos que el modelo logra capturar de la conversación. */
export interface CapturedFields {
  name?: string;
  city?: string;
  budget?: number;
  projectType?: string;
  metros?: number;        // metros lineales o m² del proyecto
  urgencia?: string;      // cuándo lo quiere (ej: "este mes", "en 3 meses")
  colorPreferido?: string;
  configuracion?: string; // puertas, cajones, especificaciones especiales
}

/** Resultado estructurado que devuelve OpenAI tras procesar un turno. */
export interface AgentReply {
  reply: string;
  nextStage: Stage;
  isQualified: boolean;
  tiers: Tier[];
  capturedFields: CapturedFields;
}

/** Parámetros editables de una cotización (lo que Audenar puede ajustar en el panel). */
export interface QuoteParams {
  tiposMueble?: string[];
  metros?: number;
  material?: string;
  zona?: string;
  meson?: string;
  ledIntegrado?: boolean;
  colorPreferido?: string;
  configuracion?: string;
  descripcion?: string;
}

/** Borrador/cotización guardada en D1 para un lead. */
export interface QuoteRecord {
  id: string;
  leadId: string;
  status: "borrador" | "enviada";
  params: QuoteParams | null;
  pricing: Record<string, unknown> | null; // ResultadoCotizacion del cotizador
  prose: Record<string, unknown> | null;   // ContenidoIA editable
  renderKey: string | null;
  planKey: string | null;
  docxKey: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Variables de entorno del Worker. */
export interface Env {
  DB: D1Database;
  CURATOR_KV: KVNamespace;              // KV para few-shots en cache caliente
  OPENAI_API_KEY: string;
  OPENAI_MODEL?: string;                // Modelo de ejecución (default: gpt-4o-mini)
  JUDGE_MODEL?: string;                 // Modelo juez (default: gpt-4o)
  WHATSAPP_ACCOUNT_SID: string;
  WHATSAPP_AUTH_TOKEN: string;
  WHATSAPP_SENDER_NUMBER: string;
  AUDENAR_PHONE: string;
  AGENT_ID: string;
  ADMIN_API_TOKEN: string;
  HUBSPOT_ACCESS_TOKEN: string;
  HUBSPOT_PIPELINE_ID: string;
  HUBSPOT_DEALSTAGE_ID: string;
  COTIZADOR_URL?: string;
  COTIZADOR_SECRET?: string;
  RENDER_URL?: string;
  RENDER_SECRET?: string;
  ARTIFACTS?: R2Bucket; // bucket elprimo-artifacts (PNG, SVG, DOCX)
}

// ─── Tipos del sistema de curación autónoma ───────────────────────────────

export interface ConversationTrace {
  id: string;
  leadId: string;
  correlationId: string;
  inputRaw: string;
  outputRaw: string;
  stageBefore: Stage;
  stageAfter: Stage;
  isQualified: boolean;
  latencyMs: number;
  model: string;
  tokensUsed: number;
  createdAt: string;
}

export interface JudgeVerdict {
  /** 1–5: ¿El agente extrajo correctamente nombre/ciudad/presupuesto/tipo? */
  scoreMapping: number;
  /** 1–5: ¿Los tiers calculados son coherentes con el presupuesto y tipo de proyecto? */
  scoreExtraction: number;
  /** 1–5: ¿El agente manejó bien mensajes ambiguos, objeciones o cambios de tema? */
  scoreResilience: number;
  /** Promedio de los tres (1.0–5.0) */
  totalScore: number;
  /** Crítica estructurada para el log. */
  critique: string;
  /** Si totalScore >= 4.5, el agente recomienda promover a few-shot. */
  promoteFewShot: boolean;
}

export interface FewShotExample {
  id: string;
  traceId: string;
  projectType: string | null;
  budgetTier: "bajo" | "medio" | "alto" | "muy_alto";
  input: string;
  idealOutput: string;
  avgScore: number;
  isActive: boolean;
}
