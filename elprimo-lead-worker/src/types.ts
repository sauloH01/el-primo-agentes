/**
 * Tipos y esquemas para el Lead Worker — EL PRIMO Carpintería
 * Validación de entrada y respuestas type-safe
 */

export interface Env {
  HUBSPOT_ACCESS_TOKEN: string;
  HUBSPOT_PIPELINE_ID: string;
  HUBSPOT_DEALSTAGE_ID: string;
}

/**
 * Payload esperado desde el frontend/formulario.
 * Incluye campos estándar + UTMs para atribución de marketing.
 */
export interface LeadInput {
  nombre: string;
  telefono: string;
  zona?: string;
  tipo?: string;           // tipo de proyecto (ej: "Cocina Integral", "Closet")
  presupuesto?: string;    // rango de presupuesto como string del formulario
  mensaje?: string;
  source?: string;
  // UTM parameters para atribución en HubSpot
  utm_campaign?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_content?: string;
  utm_term?: string;
  // Honeypot anti-spam (campo oculto; si viene relleno, es bot)
  website?: string;
}

/**
 * Propiedades que enviamos a HubSpot para crear/actualizar un Contacto.
 * Incluye campos personalizados (suffix _lead) y propiedades nativas de analytics.
 * NOTA: los campos hs_analytics_* son de solo lectura en muchas cuentas de HubSpot;
 * el worker los intenta inyectar y hace fallback automático si son rechazados (400).
 */
export interface HubSpotContactProperties {
  // Propiedades estándar de HubSpot
  firstname: string;
  phone?: string;
  // Propiedades personalizadas (custom fields configurados en la cuenta EL PRIMO)
  telefono_whatsapp_normalizado?: string;
  zona_proyecto?: string;
  tipo_proyecto?: string;
  presupuesto_rango?: string;
  mensaje_lead?: string;
  fuente_lead?: string;         // Canal de origen (Meta Ads, WhatsApp directo, etc.)
  // Atribución UTM — campos custom con suffix _lead para no colisionar con analytics nativo
  utm_source_lead?: string;     // ej: facebook, instagram, google
  utm_medium_lead?: string;     // ej: cpc, paid_social, email
  utm_campaign_lead?: string;   // ej: fusa-mvp-cocinas-jun26
  utm_content_lead?: string;    // ej: carrusel-antes-despues, video-testimonial
  utm_term_lead?: string;       // ej: cocinas-fusagasuga, closets-chinauta
  // Propiedades nativas de HubSpot Analytics (intentadas; pueden ser rechazadas por la API)
  // Ref: https://knowledge.hubspot.com/articles/kcs_article/crm_setup/hubspots-default-contact-properties
  hs_analytics_source?: string;          // Categoría de origen (ej: "PAID_SEARCH")
  hs_analytics_source_data_1?: string;   // Primer punto de datos (ej: nombre de campaña)
  hs_analytics_source_data_2?: string;   // Segundo punto de datos (ej: fuente UTM)
  hs_analytics_source_data_3?: string;   // Tercer punto de datos (ej: medio UTM)
}

/**
 * Propiedades que enviamos a HubSpot para crear un Deal.
 * NOTA: pipeline_currency_code es experimental — HubSpot puede rechazarlo si la cuenta
 * no soporta múltiples monedas. El worker hace retry automático sin él ([CURRENCY_WARNING]).
 */
export interface HubSpotDealProperties {
  dealname: string;
  amount: string;                    // Valor numérico como string puro (sin símbolos)
  pipeline: string;
  dealstage: string;
  pipeline_currency_code?: string;   // "COP" — intento de fijar divisa; puede ser ignorado
}

/**
 * Respuesta exitosa del worker.
 * Contiene IDs de correlación para cerrar el círculo auditable
 * (frontend ↔ HubSpot CRM ↔ WhatsApp).
 */
export interface SuccessResponse {
  success: true;
  contactId: string;
  dealId: string | null;
  dealAmount: number;      // Valor numérico mapeado desde el rango de presupuesto (en COP)
  correlationId: string;   // Token único: YYYY-MM-DDThh:mm:ss_xxxxxxxx
  message: string;
}

/**
 * Respuesta cuando el worker detecta un error procesable.
 * SIEMPRE retorna HTTP 200 para no romper la experiencia del frontend.
 */
export interface ErrorResponse {
  success: false;
  error: string;
  fallbackLogged: boolean;  // true si los datos del lead fueron guardados para recuperación
  timestamp: string;
}

/**
 * Log estructurado enriquecido cuando HubSpot falla ([FAILSAFE_LEAD_LOG]).
 * En producción este log puede enrutarse a: Datadog, Sentry, R2, KV, o una queue de reintentos.
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
 * Valida y normaliza el payload de entrada del formulario.
 * Retorna los datos tipados o un mensaje de error descriptivo.
 */
export function validateLeadInput(body: unknown): { valid: true; data: LeadInput } | { valid: false; error: string } {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "El body debe ser un objeto JSON" };
  }

  const data = body as Record<string, unknown>;

  if (!data.nombre || typeof data.nombre !== "string" || !data.nombre.trim()) {
    return { valid: false, error: "Campo 'nombre' es requerido y debe ser texto" };
  }

  if (!data.telefono || typeof data.telefono !== "string" || !data.telefono.trim()) {
    return { valid: false, error: "Campo 'telefono' es requerido y debe ser texto" };
  }

  const optionalStringFields = [
    "zona", "tipo", "presupuesto", "mensaje", "source",
    "utm_campaign", "utm_source", "utm_medium", "utm_content", "utm_term", "website",
  ];
  for (const field of optionalStringFields) {
    if (data[field] !== undefined && typeof data[field] !== "string") {
      return { valid: false, error: `Campo '${field}' debe ser texto si se proporciona` };
    }
  }

  return {
    valid: true,
    data: {
      nombre:       (data.nombre   as string).trim(),
      telefono:     (data.telefono as string).trim(),
      zona:         (data.zona         as string | undefined)?.trim(),
      tipo:         (data.tipo         as string | undefined)?.trim(),
      presupuesto:  (data.presupuesto  as string | undefined)?.trim(),
      mensaje:      (data.mensaje      as string | undefined)?.trim(),
      source:       (data.source       as string | undefined)?.trim(),
      utm_campaign: (data.utm_campaign as string | undefined)?.trim(),
      utm_source:   (data.utm_source   as string | undefined)?.trim(),
      utm_medium:   (data.utm_medium   as string | undefined)?.trim(),
      utm_content:  (data.utm_content  as string | undefined)?.trim(),
      utm_term:     (data.utm_term     as string | undefined)?.trim(),
      website:      (data.website      as string | undefined)?.trim(),
    },
  };
}
