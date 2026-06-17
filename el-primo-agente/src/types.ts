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
  stage: Stage;
  qualification: Qualification;
  tiers: Tier[];
  hubspotContactId: string | null;
  hubspotDealId: string | null;
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
}

/** Resultado estructurado que devuelve OpenAI tras procesar un turno. */
export interface AgentReply {
  reply: string;
  nextStage: Stage;
  isQualified: boolean;
  tiers: Tier[];
  capturedFields: CapturedFields;
}

/** Variables de entorno del Worker. */
export interface Env {
  DB: D1Database;
  OPENAI_API_KEY: string;
  WHATSAPP_ACCOUNT_SID: string;
  WHATSAPP_AUTH_TOKEN: string;
  WHATSAPP_SENDER_NUMBER: string;
  AUDENAR_PHONE: string;
  AGENT_ID: string;
  ADMIN_API_TOKEN: string;
  // HubSpot (espejo de leads). Si HUBSPOT_ACCESS_TOKEN está vacío, el espejo se omite.
  HUBSPOT_ACCESS_TOKEN: string;
  HUBSPOT_PIPELINE_ID: string;
  HUBSPOT_DEALSTAGE_ID: string;
  // Cotizador (propuesta formal). Si COTIZADOR_URL está vacío, no se notifica.
  COTIZADOR_URL?: string;
  COTIZADOR_SECRET?: string;
}
