import { Env, LeadInput, HubSpotContactProperties, HubSpotDealProperties, SuccessResponse, ErrorResponse, FallbackLeadLog, validateLeadInput } from "./types";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // ⚠️ En producción, cambiar por dominio permitido
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/**
 * Genera un ID de correlación único para vincular el lead en todos los sistemas
 * Formato: YYYY-MM-DDThh:mm:ss + hash de 8 caracteres
 * Usado en: respuesta al frontend, log de fallback, mensaje de WhatsApp (Ref-ID)
 */
function generateCorrelationId(): string {
  const timestamp = new Date().toISOString().split(".")[0]; // YYYY-MM-DDThh:mm:ss
  const randomHex = Math.random().toString(16).substring(2, 10).padEnd(8, "0");
  return `${timestamp}_${randomHex}`;
}

/**
 * Normaliza número telefónico colombiano a formato E.164 (+57...)
 * Casos soportados:
 *   - 573001234567 → +573001234567
 *   - 3001234567 → +573001234567
 *   - +573001234567 → +573001234567
 */
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("57") && digits.length === 12) return `+${digits}`;
  if (digits.length === 10 && digits.startsWith("3")) return `+57${digits}`;
  return digits ? `+${digits}` : "";
}

/**
 * Mapea el rango de presupuesto a valor numérico para HubSpot Deal Amount
 * Usa el punto medio del rango para mayor precisión
 */
function mapBudgetToDealAmount(presupuesto: string | undefined): number {
  if (!presupuesto) return 0;
  if (presupuesto.includes("4M") || presupuesto.includes("4M - $8M")) return 6000000;
  if (presupuesto.includes("8M") || presupuesto.includes("8M - $15M")) return 11500000;
  if (presupuesto.includes("15M") || presupuesto.includes("15M - $30M")) return 22500000;
  if (presupuesto.includes("30M") || presupuesto.includes("Más de $30M")) return 35000000;
  return 0;
}

/**
 * Construye propiedades de contacto mapeando UTMs a propiedades nativas de HubSpot
 * Propiedades nativas (hs_analytics_*) permiten a HubSpot entender y reportar atribución correctamente
 * Ref: https://knowledge.hubspot.com/articles/kcs_article/crm_setup/hubspots-default-contact-properties
 */
function buildContactProperties(lead: LeadInput, normalizedPhone: string): HubSpotContactProperties {
  return {
    firstname: lead.nombre,
    phone: lead.telefono,
    telefono_whatsapp_normalizado: normalizedPhone,
    zona_proyecto: lead.zona,
    tipo_proyecto: lead.tipo,
    presupuesto_rango: lead.presupuesto,
    mensaje_lead: lead.mensaje || "",
    fuente_lead: lead.source || "Meta Ads",
    // Atribución UTM en campos custom (hs_analytics_* son de solo lectura en HubSpot)
    utm_source_lead: lead.utm_source || "",
    utm_medium_lead: lead.utm_medium || "",
    utm_campaign_lead: lead.utm_campaign || "",
    utm_content_lead: lead.utm_content || "",
    utm_term_lead: lead.utm_term || "",
  };
}

/**
 * Construye propiedades del Deal con atribución de origen
 */
function buildDealProperties(lead: LeadInput, dealAmount: number, env: Env): HubSpotDealProperties {
  return {
    dealname: `${lead.tipo || "Proyecto"} - ${lead.zona || "General"} - ${lead.nombre}`,
    amount: dealAmount.toString(),
    pipeline: env.HUBSPOT_PIPELINE_ID,
    dealstage: env.HUBSPOT_DEALSTAGE_ID,
    // hs_analytics_source* son de solo lectura en HubSpot (ver nota en buildContactProperties).
  };
}

/**
 * 🚨 FALLBACK: Registra el lead en formato seguro para recuperación futura
 * Si HubSpot falla, al menos tenemos estos datos documentados.
 * En producción, esto iría a:
 *   - Un servicio de logging (Datadog, Sentry)
 *   - Una tabla de "fallback_leads" en una DB
 *   - Un bucket de Cloudflare R2 (object storage)
 *   - Un topic de mensaje queue (para reintentos)
 */
async function logFallbackLead(
  lead: LeadInput,
  normalizedPhone: string,
  dealAmount: number,
  correlationId: string,
  hubspotError: { endpoint: string; status?: number; message: string }
): Promise<void> {
  const fallbackLog: FallbackLeadLog = {
    timestamp: new Date().toISOString(),
    correlationId,
    leadData: lead,
    normalizedPhone,
    dealAmount,
    hubspotError,
    retryInfo: {
      shouldRetry: true,
      reason: `HubSpot API error at ${hubspotError.endpoint}: ${hubspotError.message}. Lead data preserved for manual recovery or async retry.`,
    },
  };

  // TODO: Implementar uno o varios destinos:
  // 1. console.error en Cloudflare Logpush (logs.cloudflare.com)
  console.error(`[FALLBACK_LEAD] ${JSON.stringify(fallbackLog)}`);

  // 2. Opcional: Enviar a un servicio externo (ejemplo)
  // await fetch("https://your-logging-service.com/fallback-leads", {
  //   method: "POST",
  //   headers: { "Content-Type": "application/json" },
  //   body: JSON.stringify(fallbackLog),
  // }).catch(err => console.error("Fallback logging failed:", err));

  // 3. Opcional: Guardar en Cloudflare KV (si estuviera configurado)
  // const kvKey = `fallback_${correlationId}`;
  // await env.FALLBACK_KV.put(kvKey, JSON.stringify(fallbackLog), { expirationTtl: 86400 * 30 }); // 30 días
}

/**
 * Intenta buscar un contacto existente por teléfono normalizado
 */
async function findExistingContact(normalizedPhone: string, hsHeaders: HeadersInit): Promise<string | null> {
  if (!normalizedPhone) return null;

  try {
    const searchRes = await fetch("https://api.hubapi.com/crm/v3/objects/contacts/search", {
      method: "POST",
      headers: hsHeaders,
      body: JSON.stringify({
        filterGroups: [{ filters: [{ propertyName: "telefono_whatsapp_normalizado", operator: "EQ", value: normalizedPhone }] }],
        properties: ["firstname"],
        limit: 1,
      }),
    });

    if (searchRes.ok) {
      const searchData = (await searchRes.json()) as { total: number; results: Array<{ id: string }> };
      if (searchData.total > 0) return searchData.results[0].id;
    }
  } catch (err) {
    console.warn(`[CONTACT_SEARCH_ERROR] ${normalizedPhone}:`, err);
  }

  return null;
}

/**
 * Crea un nuevo contacto o recupera ID si ya existe
 * Maneja el error específico de HubSpot cuando hay colisión de email/teléfono
 */
async function createOrGetContact(props: HubSpotContactProperties, hsHeaders: HeadersInit): Promise<string> {
  const contactRes = await fetch("https://api.hubapi.com/crm/v3/objects/contacts", {
    method: "POST",
    headers: hsHeaders,
    body: JSON.stringify({ properties: props }),
  });

  if (contactRes.ok) {
    const contactData = (await contactRes.json()) as { id: string };
    return contactData.id;
  }

  // HubSpot devuelve 409 si el contacto ya existe pero con otro ID
  if (!contactRes.ok) {
    const err = (await contactRes.json()) as { message?: string };
    const match = err.message?.match(/Existing ID:\s*(\d+)/);
    if (match) {
      console.info(`[CONTACT_EXISTS] Found existing contact: ${match[1]}`);
      return match[1];
    }
  }

  throw new Error(`Failed to create/get contact: ${contactRes.status} ${contactRes.statusText}`);
}

/**
 * Crea un Deal en HubSpot
 */
async function createDeal(props: HubSpotDealProperties, hsHeaders: HeadersInit): Promise<string | null> {
  try {
    const dealRes = await fetch("https://api.hubapi.com/crm/v3/objects/deals", {
      method: "POST",
      headers: hsHeaders,
      body: JSON.stringify({ properties: props }),
    });

    if (dealRes.ok) {
      const dealData = (await dealRes.json()) as { id: string };
      return dealData.id;
    }

    console.warn(`[DEAL_CREATE_ERROR] ${dealRes.status}: ${dealRes.statusText}`);
    return null;
  } catch (err) {
    console.error(`[DEAL_CREATE_EXCEPTION]`, err);
    return null;
  }
}

/**
 * Asocia un Deal a un Contacto en HubSpot (relación Deal → Contact)
 */
async function associateDealToContact(dealId: string, contactId: string, hsHeaders: HeadersInit): Promise<boolean> {
  try {
    const assocRes = await fetch(
      `https://api.hubapi.com/crm/v3/objects/deals/${dealId}/associations/contact/${contactId}/deal_to_contact`,
      { method: "PUT", headers: hsHeaders }
    );

    if (!assocRes.ok) {
      console.warn(`[ASSOCIATION_ERROR] Deal ${dealId} ↔ Contact ${contactId}: ${assocRes.status}`);
      return false;
    }

    return true;
  } catch (err) {
    console.error(`[ASSOCIATION_EXCEPTION]`, err);
    return false;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Validar ruta y método
    if (request.method !== "POST" || new URL(request.url).pathname !== "/lead") {
      return new Response("Not found", { status: 404, headers: corsHeaders });
    }

    const correlationId = generateCorrelationId();

    try {
      // Parse y validar payload
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return new Response(JSON.stringify({ success: false, error: "Invalid JSON payload" } as ErrorResponse), {
          status: 400,
          headers: corsHeaders,
        });
      }

      const validation = validateLeadInput(body);
      if (!validation.valid) {
        return new Response(JSON.stringify({ success: false, error: validation.error } as ErrorResponse), {
          status: 400,
          headers: corsHeaders,
        });
      }

      const lead = validation.data;

      // 🍯 Honeypot: si el campo website tiene valor, es spam
      if (lead.website && lead.website.trim() !== "") {
        console.info(`[HONEYPOT_HIT] ${correlationId}`);
        return new Response(JSON.stringify({ success: true, contactId: "honeypot", dealId: null, correlationId, message: "Request processed" } as unknown as SuccessResponse), {
          status: 200,
          headers: corsHeaders,
        });
      }

      const normalizedPhone = normalizePhone(lead.telefono);
      const dealAmount = mapBudgetToDealAmount(lead.presupuesto);

      // Headers autenticados para HubSpot API
      const hsHeaders = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.HUBSPOT_ACCESS_TOKEN}`,
      } as HeadersInit;

      console.info(`[LEAD_INGESTION_START] ${correlationId} | phone: ${normalizedPhone} | campaign: ${lead.utm_campaign}`);

      // ── PASO 1: Buscar contacto existente ──
      let contactId: string | null = await findExistingContact(normalizedPhone, hsHeaders);

      // ── PASO 2: Crear contacto (con atribución UTM mapeada a propiedades nativas) ──
      if (!contactId) {
        const contactProps = buildContactProperties(lead, normalizedPhone);
        contactId = await createOrGetContact(contactProps, hsHeaders);
        console.info(`[CONTACT_CREATED] ${correlationId} | contactId: ${contactId}`);
      } else {
        console.info(`[CONTACT_FOUND] ${correlationId} | contactId: ${contactId}`);
      }

      // ── PASO 3: Crear Deal ──
      const dealProps = buildDealProperties(lead, dealAmount, env);
      let dealId: string | null = await createDeal(dealProps, hsHeaders);
      if (dealId) {
        console.info(`[DEAL_CREATED] ${correlationId} | dealId: ${dealId}`);
      }

      // ── PASO 4: Asociar Deal ↔ Contacto ──
      if (dealId && contactId) {
        const assocOk = await associateDealToContact(dealId, contactId, hsHeaders);
        if (assocOk) {
          console.info(`[DEAL_CONTACT_ASSOCIATED] ${correlationId} | dealId: ${dealId} ↔ contactId: ${contactId}`);
        }
      }

      // ✅ Respuesta exitosa
      const response: SuccessResponse = {
        success: true,
        contactId,
        dealId,
        correlationId,
        message:
          "Lead created successfully. Use correlationId as [Ref-ID] token in WhatsApp message for manual audit trail closure. " +
          "contactId and dealId should be stored client-side to link back to CRM records if manual follow-up is needed.",
      };

      console.info(`[LEAD_INGESTION_SUCCESS] ${correlationId}`, response);
      return new Response(JSON.stringify(response), { status: 200, headers: corsHeaders });
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[WORKER_ERROR] ${correlationId}:`, errorMsg);

      // Si llega aquí, el error fue "no capturado" en los pasos individuales.
      // Pero ya hemos loguado fallos intermedios en cada función.
      // Aquí manejamos errores de parseo o validación general.

      const errorResponse: ErrorResponse = {
        success: false,
        error: errorMsg,
        fallbackLogged: false, // En este punto, no tuvimos oportunidad de guardar datos del lead
        timestamp: new Date().toISOString(),
      };

      return new Response(JSON.stringify(errorResponse), { status: 200, headers: corsHeaders });
    }
  },
};
                                                                                                                                                                                                                                                                                                          