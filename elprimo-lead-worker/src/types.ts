/**
 * Tipos y esquemas para el Lead Worker
 * Validación de entrada y respuestas type-safe
 */

export interface Env {
  HUBSPOT_ACCESS_TOKEN: string;
  HUBSPOT_PIPELINE_ID: string;
  HUBSPOT_DEALSTAGE_ID: string;
}

/**
 * Payload esperado desde el frontend/formulario
 * Incluye campos estándar + UTMs para atribución
 */
export interface LeadInput {
  nombre: string;
  telefono: string;
  zona?: string;
  tipo?: string;
  presupuesto?: string;
  mensaje?: string;
  source?: string;
  // UTM parameters para atribución en HubSpot
  utm_campaign?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_content?: string;
  utm_term?: string;
  // Honeypot (spam detection)
  website?: string;
}

/**
 * Propiedades que enviamos a HubSpot (Contact)
 * Incluye campos personalizados + propiedades nativas de analytics
 */
export interface HubSpotContactProperties {
  // Propiedades estándar
  firstname: string;
  phone?: string;
  // Propiedades personalizadas (custom fields en HubSpot)
  telefono_whatsapp_normalizado?: string;
  zona_proyecto?: string;
  tipo_proyecto?: string;
  presupuesto_rango?: string;
  mensaje_lead?: string;
  // PROPIEDADES NATIVAS DE HUBSPOT PARA ANALÍTICA
  // Estos campos son reconocidos nativamente por HubSpot
  fuente_lead?: string; // Canal de origen (Meta Ads, WhatsApp directo, etc.)
  // Atribución UTM — campos custom (_lead suffix para no colisionar con analytics interno)
  utm_source_lead?: string;   // ej: facebook, instagram, google
  utm_medium_lead?: string;   // ej: cpc, paid_social, email
  utm_campaign_lead?: string; // ej: fusa-mvp-cocinas-jun26
  utm_content_lead?: string;  // ej: carrusel-antes-despues, video-testimonial
  utm_term_lead?: string;     // ej: cocinas-fusagasuga, closets-chinauta
}

/**
 * Payload del Deal que enviamos a HubSpot
 */
export interface HubSpotDealProperties {
  dealname: string;
  amount: string;
  pipeline: string;
  dealstage: string;
  // Opcional: rastreo de atribución en el Deal
  hs_analytics_source?: string;
  hs_analytics_source_data_1?: string;
}

/**
 * Respuesta exitosa del worker
 * Contiene IDs de correlación para cerrar el círculo auditable
 */
export interface SuccessResponse {
  success: true;
  contactId: string;
  dealId: string | null;
  dealAmount: number; // Valor numérico mapeado desde el rango de presupuesto
  correlationId: string; // Token único para vincular WhatsApp ↔ CRM ↔ Analítica
  message: string;
}

/**
 * Respuesta en caso de error
 */
export interface ErrorResponse {
  success: false;
  error: string;
  fallbackLogged: boolean; // Si el error fue guardado en un fallback
  timestamp: string;
}

/**
 * Log enriquecido cuando HubSpot falla
 * Se enviaría a KV o a un servicio externo de logging
 */
export interface FallbackLeadLog {
  timestamp: string;
  correlationId: string;
  leadData: LeadInput;
  normalizedPhone: string;
  dealAmount: number;
  hubspotError: {
    endpoint: string;
    status?: number;
    message: string;
  };
  retryInfo: {
    shouldRetry: boolean;
    reason: string;
  };
}

/**
 * Validación y normalización de entrada
 */
export function validateLeadInput(body: unknown): { valid: true; data: LeadInput } | { valid: false; error: string } {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Body must be a JSON object" };
  }

  const data = body as Record<string, unknown>;

  // Validar campos requeridos
  if (!data.nombre || typeof data.nombre !== "string" || !data.nombre.trim()) {
    return { valid: false, error: "Campo 'nombre' es requerido y debe ser texto" };
  }

  if (!data.telefono || typeof data.telefono !== "string" || !data.telefono.trim()) {
    return { valid: false, error: "Campo 'telefono' es requerido y debe ser texto" };
  }

  // Validar campos opcionales (si vienen, deben ser string)
  const optionalStringFields = ["zona", "tipo", "presupuesto", "mensaje", "source", "utm_campaign", "utm_source", "utm_medium", "utm_content", "utm_term", "website"];
  for (const field of optionalStringFields) {
    if (data[field] !== undefined && typeof data[field] !== "string") {
      return { valid: false, error: `Campo '${field}' debe ser texto si se proporciona` };
    }
  }

  return {
    valid: true,
    data: {
      nombre: (data.nombre as string).trim(),
      telefono: (data.telefono as string).trim(),
      zona: (data.zona as string)?.trim(),
      tipo: (data.tipo as string)?.trim(),
      presupuesto: (data.presupuesto as string)?.trim(),
      mensaje: (data.mensaje as string)?.trim(),
      source: (data.source as string)?.trim(),
      utm_campaign: (data.utm_campaign as string)?.trim(),
      utm_source: (data.utm_source as string)?.trim(),
      utm_medium: (data.utm_medium as string)?.trim(),
      utm_content: (data.utm_content as string)?.trim(),
      utm_term: (data.utm_term as string)?.trim(),
      website: (data.website as string)?.trim(),
    },
  };
}
