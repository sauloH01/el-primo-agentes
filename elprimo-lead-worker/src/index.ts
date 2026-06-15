import {
  Env,
  LeadInput,
  HubSpotContactProperties,
  HubSpotDealProperties,
  SuccessResponse,
  ErrorResponse,
  FallbackLeadLog,
  validateLeadInput,
} from "./types";

// ─── CORS ────────────────────────────────────────────────────────────────────
// ⚠️  En producción reemplaza "*" por el dominio exacto de la landing page.
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

// ─── HELPERS GENERALES ───────────────────────────────────────────────────────

/**
 * Genera un ID de correlación único para vincular el lead en todos los sistemas.
 * Formato: YYYY-MM-DDThh:mm:ss_xxxxxxxx
 * Usado en: respuesta al frontend, log de failsafe, Ref-ID en mensaje WhatsApp.
 */
function generateCorrelationId(): string {
  const ts  = new Date().toISOString().split(".")[0];
  const hex = Math.random().toString(16).substring(2, 10).padEnd(8, "0");
  return `${ts}_${hex}`;
}

/**
 * Normaliza un número telefónico colombiano a formato E.164 (+57XXXXXXXXXX).
 * Casos soportados:
 *   573001234567  → +573001234567
 *   3001234567    → +573001234567
 *   +573001234567 → +573001234567
 */
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("57") && digits.length === 12) return `+${digits}`;
  if (digits.length === 10 && digits.startsWith("3"))  return `+57${digits}`;
  return digits ? `+${digits}` : "";
}

// ─── LÓGICA DE NEGOCIO ───────────────────────────────────────────────────────

/**
 * Mapea el rango de presupuesto del formulario a un valor numérico en COP
 * para el campo `amount` del Deal en HubSpot.
 *
 * Usa el punto medio de cada rango como valor representativo.
 * GARANTÍA: nunca retorna 0. Fallback conservador: 6 000 000 (rango $4M–$8M).
 */
function mapBudgetToAmount(presupuesto: string): number {
  // Lookup exacto (coincide con los option values del formulario Next.js)
  const exactMap: Record<string, number> = {
    "Menos de $4M":  2_000_000,
    "$4M - $8M":     6_000_000,
    "$8M - $15M":   11_500_000,
    "$15M - $30M":  22_500_000,
    "Más de $30M":  35_000_000,
    "Más de $60M":  35_000_000,  // rango extendido — mismo valor representativo
  };

  let result: number;

  if (presupuesto in exactMap) {
    result = exactMap[presupuesto];
  } else if (!presupuesto) {
    result = 6_000_000;                                   // campo vacío → default
  } else if (presupuesto.includes("Menos")) {
    result = 2_000_000;
  } else if (presupuesto.includes("4M")) {
    result = 6_000_000;
  } else if (presupuesto.includes("8M")) {
    result = 11_500_000;
  } else if (presupuesto.includes("15M")) {
    result = 22_500_000;
  } else if (
    presupuesto.includes("30M") ||
    presupuesto.includes("60M") ||
    presupuesto.includes("Más")
  ) {
    result = 35_000_000;
  } else {
    result = 6_000_000;                                   // valor desconocido → default
  }

  console.info(`[BUDGET_MAPPED] presupuesto: "${presupuesto}" → amount: ${result}`);
  return result;
}

/**
 * Construye las propiedades base del Contacto (campos custom de la cuenta EL PRIMO).
 * Estas propiedades son seguras y nunca causan errores 400 en HubSpot.
 */
function buildContactProperties(lead: LeadInput, normalizedPhone: string): HubSpotContactProperties {
  return {
    firstname:                    lead.nombre,
    phone:                        lead.telefono,
    telefono_whatsapp_normalizado: normalizedPhone,
    zona_proyecto:                lead.zona,
    tipo_proyecto:                lead.tipo,
    presupuesto_rango:            lead.presupuesto,
    mensaje_lead:                 lead.mensaje  || "",
    fuente_lead:                  lead.source   || "Meta Ads",
    // Atribución UTM en campos custom (_lead suffix para evitar colisión con analytics nativo)
    utm_source_lead:   lead.utm_source   || "",
    utm_medium_lead:   lead.utm_medium   || "",
    utm_campaign_lead: lead.utm_campaign || "",
    utm_content_lead:  lead.utm_content  || "",
    utm_term_lead:     lead.utm_term     || "",
  };
}

/**
 * Construye las propiedades nativas de HubSpot Analytics para atribución de marketing.
 * ADVERTENCIA: estas propiedades son de solo lectura en muchas cuentas de HubSpot y
 * pueden causar error 400. El worker hace retry automático sin ellas ([UTM_NATIVE_WARNING]).
 */
function buildNativeUTMProps(lead: LeadInput): Pick<
  HubSpotContactProperties,
  "hs_analytics_source" | "hs_analytics_source_data_1" | "hs_analytics_source_data_2" | "hs_analytics_source_data_3"
> {
  return {
    hs_analytics_source:        "PAID_SEARCH",
    hs_analytics_source_data_1: lead.utm_campaign || "Campaña Fusa MVP",
    hs_analytics_source_data_2: lead.utm_source   || "facebook_instagram",
    hs_analytics_source_data_3: lead.utm_medium   || "cpc",
  };
}

/**
 * Construye las propiedades del Deal.
 * dealname: "{tipo} | {zona} — {nombre}" con fallbacks y truncado a 255 chars.
 * amount: string numérico puro en COP (sin símbolos ni separadores).
 */
function buildDealProperties(lead: LeadInput, dealAmount: number, env: Env): HubSpotDealProperties {
  const tipo   = lead.tipo?.trim()   || "Proyecto";
  const zona   = lead.zona?.trim()   || "General";
  const nombre = lead.nombre?.trim() || "Lead Anónimo";

  const rawDealname = `${tipo} | ${zona} — ${nombre}`;
  const dealname    = rawDealname.substring(0, 255);   // límite de HubSpot para dealname

  console.info(`[DEAL_NAME_BUILT] dealname: "${dealname}" | amount: ${dealAmount}`);

  return {
    dealname,
    amount:                dealAmount.toString(),
    pipeline:              env.HUBSPOT_PIPELINE_ID,
    dealstage:             env.HUBSPOT_DEALSTAGE_ID,
    pipeline_currency_code: "COP",   // intento; si HubSpot lo rechaza → retry sin él
  };
}

// ─── FAILSAFE ────────────────────────────────────────────────────────────────

/**
 * Registra el payload completo del lead cuando HubSpot falla ([FAILSAFE_LEAD_LOG]).
 * Garantiza recuperación manual o async-retry posterior.
 *
 * Destinos de producción recomendados (descomentar según infraestructura):
 *   - Cloudflare Logpush → logs.cloudflare.com
 *   - Cloudflare R2 (bucket de leads fallidos)
 *   - Cloudflare Queue (reintentos automáticos)
 *   - Datadog / Sentry (alerta en tiempo real)
 */
async function logFallbackLead(
  lead: LeadInput,
  normalizedPhone: string,
  dealAmount: number,
  correlationId: string,
  hubspotError: { endpoint: string; status?: number; message: string }
): Promise<void> {
  const log: FallbackLeadLog = {
    timestamp:     new Date().toISOString(),
    correlationId,
    leadData:      lead,
    normalizedPhone,
    dealAmount,
    hubspotError,
    retryInfo: {
      shouldRetry: true,
      reason: `HubSpot API error at ${hubspotError.endpoint}: ${hubspotError.message}. Lead data preserved for manual recovery or async retry.`,
    },
  };

  // Sink 1 (siempre activo): Cloudflare Worker logs — visible en wrangler tail y Logpush
  console.error(`[FAILSAFE_LEAD_LOG] ${JSON.stringify(log)}`);

  // Sink 2 (opcional): servicio externo de logging
  // await fetch("https://your-logging-service.com/leads/failsafe", {
  //   method: "POST",
  //   headers: { "Content-Type": "application/json" },
  //   body: JSON.stringify(log),
  // }).catch(err => console.error("[FAILSAFE_SINK_ERROR]", err));

  // Sink 3 (opcional): Cloudflare KV — persistencia de 30 días
  // await env.FALLBACK_KV.put(`fallback_${correlationId}`, JSON.stringify(log), { expirationTtl: 86400 * 30 });
}

// ─── LLAMADAS A HUBSPOT API ──────────────────────────────────────────────────

/**
 * Busca un contacto existente por teléfono normalizado para evitar duplicados.
 */
async function findExistingContact(normalizedPhone: string, hsHeaders: HeadersInit): Promise<string | null> {
  if (!normalizedPhone) return null;

  try {
    const res = await fetch("https://api.hubapi.com/crm/v3/objects/contacts/search", {
      method: "POST",
      headers: hsHeaders,
      body: JSON.stringify({
        filterGroups: [{
          filters: [{
            propertyName: "telefono_whatsapp_normalizado",
            operator: "EQ",
            value: normalizedPhone,
          }],
        }],
        properties: ["firstname"],
        limit: 1,
      }),
    });

    if (res.ok) {
      const data = (await res.json()) as { total: number; results: Array<{ id: string }> };
      if (data.total > 0) return data.results[0].id;
    }
  } catch (err) {
    console.warn(`[CONTACT_SEARCH_ERROR] phone: ${normalizedPhone}`, err);
  }

  return null;
}

/**
 * Crea un Contacto en HubSpot con doble intento para UTMs nativos.
 *
 * Intento 1: propiedades base + hs_analytics_* (atribución nativa de HubSpot).
 * Intento 2 (si Intento 1 devuelve 400): solo propiedades base custom.
 *            → Registra [UTM_NATIVE_WARNING] para diagnóstico.
 *
 * Maneja 409 (conflicto de contacto existente) en ambos intentos.
 */
async function createOrGetContact(
  baseProps: HubSpotContactProperties,
  nativeUTMProps: Pick<
    HubSpotContactProperties,
    "hs_analytics_source" | "hs_analytics_source_data_1" | "hs_analytics_source_data_2" | "hs_analytics_source_data_3"
  >,
  hsHeaders: HeadersInit
): Promise<string> {
  /** Intenta crear el contacto con el conjunto de props dado. */
  const attempt = async (
    props: HubSpotContactProperties
  ): Promise<
    | { kind: "created"; id: string }
    | { kind: "exists";  id: string }
    | { kind: "error";   status: number; message: string }
  > => {
    const res = await fetch("https://api.hubapi.com/crm/v3/objects/contacts", {
      method: "POST",
      headers: hsHeaders,
      body: JSON.stringify({ properties: props }),
    });

    if (res.ok) {
      const data = (await res.json()) as { id: string };
      return { kind: "created", id: data.id };
    }

    const errBody  = (await res.json()) as { message?: string };
    const errMsg   = errBody.message ?? res.statusText;

    // 409 = colisión; HubSpot informa el ID existente en el mensaje
    if (res.status === 409) {
      const match = errMsg.match(/Existing ID:\s*(\d+)/);
      if (match) return { kind: "exists", id: match[1] };
    }

    return { kind: "error", status: res.status, message: errMsg };
  };

  // ── Intento 1: con propiedades nativas de analytics ──
  const propsWithNative: HubSpotContactProperties = { ...baseProps, ...nativeUTMProps };
  const result1 = await attempt(propsWithNative);

  if (result1.kind === "created") return result1.id;
  if (result1.kind === "exists") {
    console.info(`[CONTACT_EXISTS] Contacto recuperado: ${result1.id}`);
    return result1.id;
  }

  // ── Intento 2 (fallback): solo propiedades custom si Intento 1 devolvió 400 ──
  if (result1.status === 400) {
    console.warn(
      `[UTM_NATIVE_WARNING] hs_analytics_* rechazadas por HubSpot (400): ${result1.message}. ` +
      `Reintentando con UTMs custom únicamente. Las propiedades hs_analytics_* son de solo lectura ` +
      `en esta cuenta de HubSpot.`
    );

    const result2 = await attempt(baseProps);

    if (result2.kind === "created") return result2.id;
    if (result2.kind === "exists") {
      console.info(`[CONTACT_EXISTS] Contacto recuperado (retry): ${result2.id}`);
      return result2.id;
    }

    throw new Error(
      `Creación de contacto fallida (retry sin UTMs nativos): HTTP ${result2.status} — ${result2.message}`
    );
  }

  throw new Error(
    `Creación de contacto fallida: HTTP ${result1.status} — ${result1.message}`
  );
}

/**
 * Crea un Deal en HubSpot con control de divisa (COP).
 *
 * Intento 1: payload incluye `pipeline_currency_code: "COP"`.
 * Intento 2 (si Intento 1 falla): payload sin `pipeline_currency_code`.
 *            → Registra [CURRENCY_WARNING] para diagnóstico y acción manual.
 *
 * Devuelve null (en lugar de lanzar) para que el flujo del lead no se interrumpa
 * por un fallo en la creación del Deal.
 */
async function createDeal(baseProps: HubSpotDealProperties, hsHeaders: HeadersInit): Promise<string | null> {
  try {
    // ── Intento 1: con pipeline_currency_code = "COP" ──
    const res1 = await fetch("https://api.hubapi.com/crm/v3/objects/deals", {
      method: "POST",
      headers: hsHeaders,
      body: JSON.stringify({ properties: baseProps }),   // baseProps ya incluye pipeline_currency_code
    });

    if (res1.ok) {
      return ((await res1.json()) as { id: string }).id;
    }

    const err1    = (await res1.json()) as { message?: string };
    const errMsg1 = err1.message ?? res1.statusText;

    // Puede ser rechazado porque pipeline_currency_code no es una propiedad estándar del Deal
    console.warn(
      `[CURRENCY_WARNING] pipeline_currency_code rechazada o Deal no creado (HTTP ${res1.status}): ${errMsg1}. ` +
      `El Deal se creará con la divisa por defecto de la cuenta. ` +
      `Solución permanente: configura COP como moneda del pipeline en HubSpot → Settings → Currencies.`
    );

    // ── Intento 2: sin pipeline_currency_code ──
    const { pipeline_currency_code: _omit, ...propsWithoutCurrency } = baseProps;
    const res2 = await fetch("https://api.hubapi.com/crm/v3/objects/deals", {
      method: "POST",
      headers: hsHeaders,
      body: JSON.stringify({ properties: propsWithoutCurrency }),
    });

    if (res2.ok) {
      return ((await res2.json()) as { id: string }).id;
    }

    const err2 = (await res2.json()) as { message?: string };
    console.warn(`[DEAL_CREATE_ERROR] HTTP ${res2.status}: ${err2.message ?? res2.statusText}`);
    return null;

  } catch (err) {
    console.error("[DEAL_CREATE_EXCEPTION]", err);
    return null;
  }
}

/**
 * Asocia un Deal a un Contacto en HubSpot (relación bidireccional Deal ↔ Contact).
 */
async function associateDealToContact(
  dealId: string,
  contactId: string,
  hsHeaders: HeadersInit
): Promise<boolean> {
  try {
    const res = await fetch(
      `https://api.hubapi.com/crm/v3/objects/deals/${dealId}/associations/contact/${contactId}/deal_to_contact`,
      { method: "PUT", headers: hsHeaders }
    );

    if (!res.ok) {
      console.warn(`[ASSOCIATION_ERROR] Deal ${dealId} ↔ Contact ${contactId}: HTTP ${res.status}`);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[ASSOCIATION_EXCEPTION]", err);
    return false;
  }
}

// ─── HANDLER PRINCIPAL ───────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {

    // ── Preflight CORS ──
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // ── Ruta y método ──
    if (request.method !== "POST" || new URL(request.url).pathname !== "/lead") {
      return new Response("Not found", { status: 404, headers: corsHeaders });
    }

    const correlationId = generateCorrelationId();

    // Variables hoisted para el bloque catch (failsafe necesita datos del lead)
    let capturedLead:        LeadInput | null = null;
    let capturedPhone                         = "";
    let capturedDealAmount                    = 6_000_000;

    try {

      // ── 1. Parseo del body ──
      let rawBody: unknown;
      try {
        rawBody = await request.json();
      } catch {
        return new Response(
          JSON.stringify({
            success: false,
            error: "El cuerpo de la solicitud no es JSON válido",
            fallbackLogged: false,
            timestamp: new Date().toISOString(),
          } satisfies ErrorResponse),
          { status: 200, headers: corsHeaders }
        );
      }

      // ── 2. Validación de campos ──
      const validation = validateLeadInput(rawBody);
      if (!validation.valid) {
        return new Response(
          JSON.stringify({
            success: false,
            error: validation.error,
            fallbackLogged: false,
            timestamp: new Date().toISOString(),
          } satisfies ErrorResponse),
          { status: 200, headers: corsHeaders }
        );
      }

      const lead = validation.data;
      capturedLead = lead;

      // ── 3. Honeypot anti-spam ──
      if (lead.website?.trim()) {
        console.info(`[HONEYPOT_HIT] ${correlationId} — request descartado silenciosamente`);
        // Retornamos éxito falso para no revelar el mecanismo al bot
        return new Response(
          JSON.stringify({
            success: true,
            contactId: "spam",
            dealId: null,
            dealAmount: 0,
            correlationId,
            message: "Request processed",
          } as unknown as SuccessResponse),
          { status: 200, headers: corsHeaders }
        );
      }

      // ── 4. Normalización y mapeo ──
      const normalizedPhone = normalizePhone(lead.telefono);
      capturedPhone         = normalizedPhone;

      const dealAmount    = mapBudgetToAmount(lead.presupuesto ?? "");
      capturedDealAmount  = dealAmount;

      const hsHeaders: HeadersInit = {
        "Content-Type":  "application/json",
        Authorization:   `Bearer ${env.HUBSPOT_ACCESS_TOKEN}`,
      };

      console.info(
        `[LEAD_INGESTION_START] ${correlationId} | ` +
        `phone: ${normalizedPhone} | presupuesto: ${lead.presupuesto} | ` +
        `campaign: ${lead.utm_campaign ?? "—"}`
      );

      // ── PASO 1: Buscar contacto existente por teléfono ──
      let contactId: string | null = await findExistingContact(normalizedPhone, hsHeaders);

      // ── PASO 2: Crear o recuperar contacto ──
      if (!contactId) {
        const baseProps      = buildContactProperties(lead, normalizedPhone);
        const nativeUTMProps = buildNativeUTMProps(lead);
        contactId = await createOrGetContact(baseProps, nativeUTMProps, hsHeaders);
        console.info(`[CONTACT_CREATED] ${correlationId} | contactId: ${contactId}`);
      } else {
        console.info(`[CONTACT_FOUND] ${correlationId} | contactId: ${contactId}`);
      }

      // ── PASO 3: Crear Deal ──
      const dealProps = buildDealProperties(lead, dealAmount, env);
      const dealId: string | null = await createDeal(dealProps, hsHeaders);
      if (dealId) {
        console.info(`[DEAL_CREATED] ${correlationId} | dealId: ${dealId} | amount: ${dealAmount}`);
      } else {
        console.warn(`[DEAL_SKIPPED] ${correlationId} | El Deal no fue creado; el contacto sí existe.`);
      }

      // ── PASO 4: Asociar Deal ↔ Contacto ──
      if (dealId && contactId) {
        const assocOk = await associateDealToContact(dealId, contactId, hsHeaders);
        if (assocOk) {
          console.info(`[DEAL_CONTACT_ASSOCIATED] ${correlationId} | ${dealId} ↔ ${contactId}`);
        }
      }

      // ── Respuesta exitosa ──
      const response: SuccessResponse = {
        success:       true,
        contactId,
        dealId,
        dealAmount,
        correlationId,
        message:
          "Lead registrado en HubSpot. " +
          "Usa correlationId como [Ref-ID] en el mensaje de WhatsApp para cerrar el círculo de auditoría. " +
          "contactId y dealId permiten vincular el lead con el CRM en seguimientos manuales.",
      };

      console.info(`[LEAD_INGESTION_SUCCESS] ${correlationId}`);
      return new Response(JSON.stringify(response), { status: 200, headers: corsHeaders });

    } catch (error: unknown) {

      // ── Error no capturado en pasos individuales (ej: token expirado, red caída) ──
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[WORKER_ERROR] ${correlationId}:`, errorMsg);

      // Failsafe: persistir datos del lead para recuperación manual
      if (capturedLead) {
        await logFallbackLead(capturedLead, capturedPhone, capturedDealAmount, correlationId, {
          endpoint: "hubspot_api",
          message:  errorMsg,
        });
      }

      // HTTP 200 siempre — el frontend redirige al usuario a WhatsApp de todos modos
      return new Response(
        JSON.stringify({
          success:        false,
          error:          errorMsg,
          fallbackLogged: !!capturedLead,
          timestamp:      new Date().toISOString(),
        } satisfies ErrorResponse),
        { status: 200, headers: corsHeaders }
      );
    }
  },
};
