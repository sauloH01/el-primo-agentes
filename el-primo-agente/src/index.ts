// src/index.ts — Worker del agente EL PRIMO
// Rutas:
//   POST /whatsapp/webhook              → mensajes entrantes de WhatsApp (Twilio)
//   GET  /api/admin/stats               → métricas para el dashboard
//   GET  /api/admin/leads               → lista de leads (?stage=&q=)
//   GET  /api/admin/leads/:id           → detalle + conversación
//   POST /api/admin/leads/:id/stage     → cambiar etapa manualmente
//   POST /api/admin/leads/:id/reply     → responder manualmente por WhatsApp
//   POST /api/admin/leads/:id/cotizar   → generar y enviar cotización formal
//   GET  /api/admin/agents              → lista de agentes
import type { Env, Stage } from "./types";
import { DB, normalizePhone } from "./services/db";
import { OpenAIClient } from "./services/openai";
import { WhatsAppClient } from "./services/whatsapp";
import { isValidTwilioSignature } from "./services/twilio-verify";
import { HubSpotClient, leadToContactProps, leadToDealProps } from "./services/hubspot";
import { processMedia, extractLocation } from "./services/transcription";
import { generateQuoteMessage, buildFallbackQuote } from "./services/cotizacion";
import { califica, consolida, poda } from "./services/curator";

const VALID_STAGES: Stage[] = ["nuevo", "en_proceso", "calificado", "cotizado", "rechazado"];

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    try {
      if (request.method === "POST" && pathname === "/whatsapp/webhook") {
        return await handleWhatsAppWebhook(request, env, ctx);
      }
      if (request.method === "OPTIONS" && pathname === "/landing-lead") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }
      if (request.method === "POST" && pathname === "/landing-lead") {
        return await handleLandingLead(request, env);
      }
      if (request.method === "POST" && pathname === "/api/closer-event") {
        return await handleCloserEvent(request, env);
      }
      if (pathname.startsWith("/api/admin/")) {
        if (request.method === "OPTIONS") {
          return new Response(null, { status: 204, headers: CORS_HEADERS });
        }
        const adminRes = await handleAdmin(request, env, url);
        const res = new Response(adminRes.body, adminRes);
        Object.entries(CORS_HEADERS).forEach(([k, v]) => res.headers.set(k, v));
        return res;
      }
      if (pathname === "/" || pathname === "/health") {
        return json({ ok: true, service: "el-primo-agente" });
      }
      return new Response("Ruta no encontrada", { status: 404 });
    } catch (err: any) {
      console.error("[Worker Error]:", err?.message ?? err);
      return json({ error: "internal_error" }, 500);
    }
  },

  async scheduled(_ctrl: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      (async () => {
        try {
          const r1 = await califica(env);
          console.log("[Cron/Curador] califica:", r1);
          const r2 = await consolida(env);
          console.log("[Cron/Curador] consolida:", r2);
          const r3 = await poda(env);
          console.log("[Cron/Curador] poda:", r3);
        } catch (err) {
          console.error("[Cron/Curador] error en ciclo de curación:", err);
        }
        // Retención R2: borrar artefactos de borradores no enviados >30 días
        if (env.ARTIFACTS) {
          try {
            await limpiarArtefactosViejos(env);
          } catch (err) {
            console.error("[Cron/R2] error en retención de artefactos:", err);
          }
        }
      })()
    );
  },
} satisfies ExportedHandler<Env>;

/* ------------------------------------------------------------------ */
/*  HELPERS ENDPOINT PÚBLICO /landing-lead                            */
/* ------------------------------------------------------------------ */

function mapBudgetToAmount(presupuesto: string): number {
  const exactMap: Record<string, number> = {
    "Menos de $4M":  2_000_000,
    "$4M - $8M":     6_000_000,
    "$8M - $15M":   11_500_000,
    "$15M - $30M":  22_500_000,
    "Más de $30M":  35_000_000,
    "Más de $60M":  35_000_000,
  };
  if (presupuesto in exactMap) return exactMap[presupuesto];
  if (!presupuesto) return 0;
  if (presupuesto.includes("Menos")) return 2_000_000;
  if (presupuesto.includes("4M"))    return 6_000_000;
  if (presupuesto.includes("8M"))    return 11_500_000;
  if (presupuesto.includes("15M"))   return 22_500_000;
  return 35_000_000;
}

// Rate limiting simple vía KV (5 req/IP/hora · 3 req/teléfono/día).
async function checkRateLimit(env: Env, ip: string, phone: string): Promise<boolean> {
  const ipKey    = `ratelimit:landing:ip:${ip}`;
  const phoneKey = `ratelimit:landing:phone:${phone}`;
  const [ipRaw, phoneRaw] = await Promise.all([
    env.CURATOR_KV.get(ipKey),
    env.CURATOR_KV.get(phoneKey),
  ]);
  const ipCount    = Number(ipRaw    ?? 0);
  const phoneCount = Number(phoneRaw ?? 0);
  if (ipCount >= 5 || phoneCount >= 3) return false;
  await Promise.all([
    env.CURATOR_KV.put(ipKey,    String(ipCount + 1),    { expirationTtl: 3600  }),
    env.CURATOR_KV.put(phoneKey, String(phoneCount + 1), { expirationTtl: 86400 }),
  ]);
  return true;
}

async function handleLandingLead(request: Request, env: Env): Promise<Response> {
  const ip = request.headers.get("CF-Connecting-IP") ?? request.headers.get("X-Real-IP") ?? "unknown";

  let body: Record<string, string>;
  try {
    body = (await request.json()) as Record<string, string>;
  } catch {
    return jsonCors({ error: "invalid_json" }, 400);
  }

  // Honeypot (campo website oculto en el formulario)
  if ((body.website ?? "").trim()) return jsonCors({ ok: true }, 200);

  // Sin teléfono no hay match posible con el flujo de WhatsApp
  const rawPhone = (body.telefono ?? "").trim();
  if (!rawPhone) return jsonCors({ ok: true }, 200);

  const phone = normalizePhone(rawPhone);

  const allowed = await checkRateLimit(env, ip, phone);
  if (!allowed) return jsonCors({ error: "rate_limit" }, 429);

  const db      = new DB(env.DB, env.AGENT_ID);
  const budget  = mapBudgetToAmount(body.presupuesto ?? "");
  const existing = await db.getLeadByPhone(phone);

  let leadId: string;
  if (existing) {
    // El lead ya existe (llegó por WhatsApp primero) → solo enriquece campos vacíos
    leadId = existing.id;
    await db.enrichFromLanding(existing.id, {
      name:        body.nombre?.trim()    || undefined,
      city:        body.zona?.trim()      || undefined,
      budget:      budget > 0 ? budget   : undefined,
      projectType: body.tipo?.trim()      || undefined,
    });
  } else {
    // Lead nuevo → créalo con source="landing"
    const lead = await db.upsertLeadByPhone(phone, {
      name:        body.nombre?.trim()    || undefined,
      city:        body.zona?.trim()      || undefined,
      budget:      budget > 0 ? budget   : undefined,
      projectType: body.tipo?.trim()      || undefined,
      source:      "landing",
      agentId:     env.AGENT_ID,
    });
    leadId = lead.id;
  }

  // Guarda el mensaje del formulario como nota
  if (body.mensaje?.trim()) {
    await db.addNote(leadId, `[landing] ${body.mensaje.trim()}`);
  }

  await db.logEvent("landing_form", leadId, {
    nombre:       body.nombre,
    zona:         body.zona,
    tipo:         body.tipo,
    presupuesto:  body.presupuesto,
    utm_source:   body.utm_source,
    utm_medium:   body.utm_medium,
    utm_campaign: body.utm_campaign,
    ip,
  });

  return jsonCors({ ok: true, leadId }, 200);
}

/* ------------------------------------------------------------------ */
/*  WEBHOOK DE WHATSAPP (Twilio)                                       */
/* ------------------------------------------------------------------ */
async function handleWhatsAppWebhook(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const form = await request.formData();
  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) params[k] = v.toString();

  // 1) Validar firma de Twilio (salvo bypass explícito para pruebas locales)
  const skip = (env as any).SKIP_TWILIO_VALIDATION === "1";
  if (!skip) {
    const signature = request.headers.get("X-Twilio-Signature");
    const valid = await isValidTwilioSignature(
      request.url,
      params,
      signature,
      env.WHATSAPP_AUTH_TOKEN
    );
    if (!valid) {
      console.warn("[Webhook] Firma de Twilio inválida");
      return new Response("Firma inválida", { status: 403 });
    }
  }

  const from = normalizePhone(params["From"] ?? "");
  const profileName = params["ProfileName"]?.trim();
  if (!from) return twiml();

  const db = new DB(env.DB, env.AGENT_ID);
  const openai = new OpenAIClient(env);
  const whatsapp = new WhatsAppClient(env);

  // 2) Crear el lead si es primer contacto
  const lead = await db.upsertLeadByPhone(from, {
    name: profileName,
    agentId: env.AGENT_ID,
  });

  // 3) Detectar ubicación (Twilio la envía como params Latitude/Longitude)
  const location = extractLocation(params);
  if (location?.city) {
    await db.updateLead(lead.id, { city: location.city });
  }

  // 4) Procesar media (audio, imagen, video, documento)
  //    Si hay media, el body del mensaje es el resultado de la transcripción/descripción.
  //    Si además hay texto del usuario, se combina.
  const textBody = (params["Body"] ?? "").trim();
  let messageBody = textBody;
  let mediaData:
    | { type: "audio" | "image" | "video" | "document" | "location"; url: string; transcription: string }
    | undefined;

  const mediaResult = await processMedia(params, env).catch(() => null);
  if (mediaResult) {
    mediaData = { type: mediaResult.mediaType, url: mediaResult.mediaUrl, transcription: mediaResult.transcription };
    // Combinar: si el usuario también envió texto, lo ponemos después
    messageBody = textBody ? `${mediaResult.body}\n${textBody}` : mediaResult.body;
  } else if (location) {
    // Solo ubicación, sin otro media
    messageBody = location.body;
    mediaData = { type: "location", url: "", transcription: location.body };
  }

  if (!messageBody) return twiml();

  // 5) Guardar el mensaje entrante con datos de media
  await db.appendMessage(
    lead.id,
    "in",
    messageBody,
    mediaData ? { type: mediaData.type, url: mediaData.url, transcription: mediaData.transcription } : undefined
  );

  // 6) Generar respuesta con memoria (historial completo)
  const conversation = await db.getConversation(lead.id, 20);
  const t0 = Date.now();
  const result = await openai.generateReply(conversation, lead);
  const latencyMs = Date.now() - t0;

  // 7) Responder por WhatsApp y guardar el saliente
  await whatsapp.sendMessage(from, result.reply);
  await db.appendMessage(lead.id, "out", result.reply);

  // 8) Actualizar el lead
  const cf = result.capturedFields ?? {};
  await db.updateLead(lead.id, {
    stage: result.nextStage,
    qualification: result.isQualified ? "calificado" : "en_proceso",
    tiers: result.tiers,
    name: cf.name ?? undefined,
    city: cf.city ?? (location?.city ?? undefined),
    budget: typeof cf.budget === "number" && cf.budget > 0 ? cf.budget : undefined,
    projectType: cf.projectType ?? undefined,
  });

  // 8b) Guardar traza para el sistema de curación (fire-and-forget)
  ctx.waitUntil(
    db.saveTrace({
      leadId: lead.id,
      correlationId: crypto.randomUUID(),
      inputRaw: messageBody,
      outputRaw: result.reply,
      stageBefore: lead.stage,
      stageAfter: result.nextStage,
      isQualified: result.isQualified,
      latencyMs,
      model: env.OPENAI_MODEL ?? "gpt-4o-mini",
      tokensUsed: 0,
    }).catch((e) => console.error("[Trace] error guardando traza:", e))
  );

  // 9) Tareas en segundo plano
  //    - avisar a Audenar si califica
  //    - notificar al cotizador SOLO al transicionar a calificado (no spamear)
  //    - espejar el lead a HubSpot
  if (result.isQualified) {
    ctx.waitUntil(notifyOwner(env, db, whatsapp, lead.id, from, result));
    const yaEstaba = lead.stage === "calificado" || lead.stage === "cotizado";
    if (!yaEstaba) {
      ctx.waitUntil(notificarCotizador(env, lead, from, result));
    }
  }
  ctx.waitUntil(mirrorToHubSpot(env, db, lead.id));

  return twiml();
}

/* ------------------------------------------------------------------ */
/*  NOTIFICAR AL COTIZADOR (propuesta formal cuando el lead califica)  */
/* ------------------------------------------------------------------ */
// Mapea el tipo de proyecto libre a las claves que entiende el cotizador.
function mapTipoMueble(projectType?: string | null): string {
  const t = (projectType ?? "").toLowerCase();
  if (t.includes("cocina")) return "cocina";
  if (t.includes("clos") || t.includes("vestier")) return "closet";
  if (t.includes("baño") || t.includes("bano")) return "bano";
  if (t.includes("entreten") || t.includes("tv")) return "entretenimiento";
  if (t.includes("estudio") || t.includes("escritorio") || t.includes("office")) return "estudio";
  if (t.includes("puerta")) return "puerta";
  if (t.includes("lavadero")) return "lavadero";
  if (t.includes("alacena") || t.includes("alcena") || t.includes("despensa")) return "alacena";
  return "otro";
}

async function notificarCotizador(
  env: Env,
  lead: { id: string; name: string | null; phone: string; city: string | null; projectType: string | null; budget: number },
  from: string,
  result: { capturedFields?: any }
): Promise<void> {
  if (!env.COTIZADOR_URL || !env.COTIZADOR_SECRET) return;
  const cf = result.capturedFields ?? {};
  const budget = cf.budget ?? lead.budget;

  // Fase 2d: usar /preview (sin email, sin render) y guardar borrador en D1.
  // Audenar revisa y ajusta en el panel antes de enviar al cliente.
  const payload = buildCotizadorPayload(lead, {
    ...cf,
    leadId: lead.id,
    presupuestoCliente: budget ? `$${budget.toLocaleString("es-CO")}` : undefined,
  });

  try {
    const res = await svcFetch(env.COTIZADOR_SVC, env.COTIZADOR_URL, "/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Secret": env.COTIZADOR_SECRET ?? "" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return;
    const data = await res.json() as { ok: boolean; pricing: unknown; contenido: unknown };
    if (!data.ok) return;

    const db = new DB(env.DB, env.AGENT_ID);
    await db.upsertQuote(lead.id, {
      params: {
        tiposMueble: [mapTipoMueble(cf.projectType ?? lead.projectType)],
        metros:          cf.metros         ?? undefined,
        zona:            cf.city           ?? lead.city            ?? undefined,
        colorPreferido:  cf.colorPreferido ?? undefined,
        configuracion:   cf.configuracion  ?? undefined,
        descripcion:     cf.projectType    ?? lead.projectType     ?? undefined,
      },
      pricing: data.pricing as Record<string, unknown>,
      prose:   data.contenido as Record<string, unknown>,
      status:  "borrador",
    });
    await db.logEvent("quote_draft_created", lead.id, { source: "auto_qualify" });
  } catch {
    /* silencioso — nunca rompe el flujo del webhook */
  }
}

/* ------------------------------------------------------------------ */
/*  ESPEJO A HUBSPOT                                                   */
/* ------------------------------------------------------------------ */
async function mirrorToHubSpot(env: Env, db: DB, leadId: string): Promise<void> {
  if (!env.HUBSPOT_ACCESS_TOKEN) return;
  const lead = await db.getLeadById(leadId);
  if (!lead) return;

  const hs = new HubSpotClient(env);
  try {
    let contactId = lead.hubspotContactId;
    const props = leadToContactProps(lead);
    if (!contactId) {
      contactId = await hs.upsertContactByPhone(lead.phone, props);
      await db.setHubspotIds(lead.id, { contactId });
    } else {
      await hs.updateContact(contactId, props);
    }
    if (lead.stage === "calificado" && !lead.hubspotDealId && contactId) {
      const dealId = await hs.createDeal(leadToDealProps(lead, env));
      if (dealId) {
        await hs.associateDealToContact(dealId, contactId);
        await db.setHubspotIds(lead.id, { dealId });
      }
    }
    await db.logEvent("hubspot_synced", lead.id, { contactId });
  } catch (err: any) {
    await db.logEvent("error", lead.id, { where: "hubspot", message: err?.message });
  }
}

async function notifyOwner(
  env: Env,
  db: DB,
  whatsapp: WhatsAppClient,
  leadId: string,
  phone: string,
  result: { tiers: { tier: string; price: number }[]; capturedFields: any }
): Promise<void> {
  const lead = await db.getLeadById(leadId);
  if (!lead) return;
  const tiersResumen = result.tiers
    .map((t) => `• ${t.tier}: $${t.price.toLocaleString("es-CO")}`)
    .join("\n");
  const panelLink = env.PANEL_URL
    ? `\n🔗 *Revisar en el panel:* ${env.PANEL_URL}/admin/leads/${leadId}`
    : "";
  const msg = [
    "🔥 *LEAD CALIFICADO*",
    `👤 ${lead.name ?? "Cliente"}`,
    `📍 ${lead.city ?? "Zona por confirmar"}`,
    lead.budget ? `💰 Presupuesto: $${lead.budget.toLocaleString("es-CO")}` : "",
    "",
    tiersResumen ? "📋 *Cotización estimada (interna):*" : "",
    tiersResumen,
    "",
    `📞 Contactar: ${phone}`,
    "✅ Borrador de cotización listo en el panel.",
    panelLink,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    await whatsapp.sendMessage(env.AUDENAR_PHONE, msg);
    await db.logEvent("owner_notified", leadId, { phone });
  } catch (err: any) {
    await db.logEvent("error", leadId, { where: "notifyOwner", message: err?.message });
  }
}

/* ------------------------------------------------------------------ */
/*  SERVICE-BINDING FETCH — Worker-a-Worker sin internet público      */
/* ------------------------------------------------------------------ */

// Usa el Service Binding cuando está disponible; si no, cae en fetch HTTP.
// Los bindings evitan el error 1042 que ocurre al llamar workers.dev desde Workers.
function svcFetch(
  svc: Fetcher | undefined,
  baseUrl: string | undefined,
  path: string,
  init?: RequestInit
): Promise<Response> {
  if (svc) {
    // AbortSignal en new Request() interfiere con el body via service binding
    // (el Worker runtime no lo soporta igual que fetch()). Se descarta aquí.
    const { signal: _s, ...safeInit } = init ?? {};
    return svc.fetch(new Request(`https://svc${path}`, safeInit));
  }
  return fetch(`${baseUrl}${path}`, init);
}

/* ------------------------------------------------------------------ */
/*  HELPERS DE COTIZACIÓN                                             */
/* ------------------------------------------------------------------ */

function buildCotizadorPayload(lead: { name: string | null; phone: string; city: string | null; budget: number; projectType: string | null }, params: Record<string, unknown> = {}) {
  const nombre = (((params.nombre as string) ?? lead.name ?? "").trim()) || "Cliente";
  const telefono = (lead.phone ?? "").replace(/\D/g, "") || "0";
  return {
    nombre,
    telefono,
    zona: (params.zona as string) ?? lead.city ?? "Fusagasugá",
    tiposMueble: Array.isArray(params.tiposMueble) && (params.tiposMueble as string[]).length
      ? params.tiposMueble
      : [mapTipoMueble(lead.projectType)],
    metros:         params.metros         ?? undefined,
    configuracion:  params.configuracion  ?? undefined,
    material:       params.material       ?? undefined,
    meson:          params.meson          ?? undefined,
    ledIntegrado:   params.ledIntegrado   ?? undefined,
    colorPreferido: params.colorPreferido ?? undefined,
    descripcion:    (params.descripcion as string) ?? lead.projectType ?? undefined,
    presupuestoCliente: lead.budget ? `$${lead.budget.toLocaleString("es-CO")}` : undefined,
    fuenteLead: "whatsapp-agente",
    leadId: (params.leadId as string) ?? "",
  };
}

/* ------------------------------------------------------------------ */
/*  API ADMIN (dashboard)                                              */
/* ------------------------------------------------------------------ */
async function handleAdmin(request: Request, env: Env, url: URL): Promise<Response> {
  const auth = request.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!env.ADMIN_API_TOKEN || token !== env.ADMIN_API_TOKEN) {
    return json({ error: "unauthorized" }, 401);
  }

  const db = new DB(env.DB, env.AGENT_ID);
  const parts = url.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  const sub = parts.slice(2); // ["leads","<id>","accion"] etc.

  // GET /api/admin/closer-alerts — leads con alertas de cierre/transferir/frío
  if (request.method === "GET" && sub[0] === "closer-alerts") {
    return json({ alerts: await db.getCloserAlerts() });
  }

  // GET /api/admin/stats
  if (request.method === "GET" && sub[0] === "stats" && sub.length === 1) {
    return json(await db.getStats());
  }

  // GET /api/admin/stats/extended  — revenue, funnel, stale leads
  if (request.method === "GET" && sub[0] === "stats" && sub[1] === "extended") {
    return json(await db.getExtendedStats());
  }

  // GET /api/admin/agents
  if (request.method === "GET" && sub[0] === "agents" && sub.length === 1) {
    return json({ agents: await db.listAgents() });
  }

  // GET /api/admin/leads  (?stage=&q=)
  if (request.method === "GET" && sub[0] === "leads" && sub.length === 1) {
    const stage = url.searchParams.get("stage") ?? undefined;
    const q = url.searchParams.get("q") ?? undefined;
    return json({ leads: await db.listLeads({ stage, q }) });
  }

  // GET /api/admin/leads/:id
  if (request.method === "GET" && sub[0] === "leads" && sub.length === 2) {
    const data = await db.getLeadWithConversation(sub[1]);
    if (!data) return json({ error: "not_found" }, 404);
    return json(data);
  }

  // POST /api/admin/leads/:id/stage   body: { stage }
  if (request.method === "POST" && sub[0] === "leads" && sub[2] === "stage") {
    const { stage } = (await request.json().catch(() => ({}))) as { stage?: string };
    if (!stage || !VALID_STAGES.includes(stage as Stage)) {
      return json({ error: "invalid_stage" }, 400);
    }
    await db.updateLead(sub[1], {
      stage: stage as Stage,
      qualification: stage === "calificado" || stage === "cotizado" ? "calificado" : "en_proceso",
    });
    await db.logEvent("stage_change", sub[1], { stage });
    return json({ ok: true });
  }

  // POST /api/admin/leads/:id/reply   body: { body }
  if (request.method === "POST" && sub[0] === "leads" && sub[2] === "reply") {
    const { body } = (await request.json().catch(() => ({}))) as { body?: string };
    if (!body || !body.trim()) return json({ error: "empty_body" }, 400);
    const lead = await db.getLeadById(sub[1]);
    if (!lead) return json({ error: "not_found" }, 404);
    const whatsapp = new WhatsAppClient(env);
    await whatsapp.sendMessage(lead.phone, body.trim());
    await db.appendMessage(lead.id, "out", body.trim());
    await db.logEvent("manual_reply", lead.id, { preview: body.trim().substring(0, 100) });
    return json({ ok: true });
  }

  // GET /api/admin/leads/:id/events  — timeline de actividad
  if (request.method === "GET" && sub[0] === "leads" && sub[2] === "events") {
    return json({ events: await db.getLeadEvents(sub[1]) });
  }

  // POST /api/admin/leads/:id/note  — nota de Audenar
  if (request.method === "POST" && sub[0] === "leads" && sub[2] === "note") {
    const { nota } = (await request.json().catch(() => ({}))) as { nota?: string };
    if (!nota || !nota.trim()) return json({ error: "nota vacía" }, 400);
    await db.addNote(sub[1], nota);
    await db.logEvent("note_added", sub[1], { preview: nota.substring(0, 100) });
    return json({ ok: true });
  }

  // GET /api/admin/leads/:id/quote  — borrador actual (o 404 si no hay)
  if (request.method === "GET" && sub[0] === "leads" && sub[2] === "quote" && !sub[3]) {
    const quote = await db.getQuoteByLeadId(sub[1]);
    if (!quote) return json({ error: "not_found" }, 404);
    return json(quote);
  }

  // PUT /api/admin/leads/:id/quote  — guarda params/prose y recalcula si cambian los params
  // Body: { params?: QuoteParams, prose?: ContenidoIA }
  if (request.method === "PUT" && sub[0] === "leads" && sub[2] === "quote" && !sub[3]) {
    const lead = await db.getLeadById(sub[1]);
    if (!lead) return json({ error: "not_found" }, 404);
    if (!env.COTIZADOR_URL || !env.COTIZADOR_SECRET) {
      return json({ error: "cotizador_not_configured" }, 500);
    }

    const body = await request.json().catch(() => ({})) as {
      params?: Record<string, unknown>;
      prose?: Record<string, unknown>;
    };

    let updatedPricing: Record<string, unknown> | undefined;
    let updatedProse: Record<string, unknown> | undefined;

    // Si vienen params nuevos → recalcular vía cotizador /preview
    if (body.params) {
      const payload = buildCotizadorPayload(lead, { ...body.params, leadId: lead.id });
      const res = await svcFetch(env.COTIZADOR_SVC, env.COTIZADOR_URL, "/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Secret": env.COTIZADOR_SECRET ?? "" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) return json({ error: "cotizador_error", status: res.status }, 502);
      const result = await res.json() as { ok: boolean; pricing: unknown; contenido: unknown };
      if (!result.ok) return json({ error: "cotizador_error" }, 502);
      updatedPricing = result.pricing as Record<string, unknown>;
      updatedProse   = result.contenido as Record<string, unknown>; // prosa recién generada
    }

    // Si viene prose editada explícitamente → sobrescribe la generada por cotizador
    if (body.prose) updatedProse = body.prose;

    const quote = await db.upsertQuote(sub[1], {
      params:  body.params  as Record<string, unknown> | undefined,
      pricing: updatedPricing,
      prose:   updatedProse,
    });
    return json(quote);
  }

  // POST /api/admin/leads/:id/quote/render/prompt-preview — preview del prompt sin generar imagen
  if (request.method === "POST" && sub[0] === "leads" && sub[2] === "quote" && sub[3] === "render" && sub[4] === "prompt-preview") {
    const lead = await db.getLeadById(sub[1]);
    if (!lead) return json({ error: "not_found" }, 404);
    if (!env.RENDER_URL || !env.RENDER_SECRET) return json({ error: "render_not_configured" }, 500);

    const bodyRaw2 = await request.json().catch(() => ({})) as Record<string, unknown>;
    const cp2 = (bodyRaw2.renderParams ?? {}) as Record<string, unknown>;
    const quote2 = await db.getQuoteByLeadId(sub[1]);
    const qp2 = (quote2?.params ?? {}) as Record<string, unknown>;

    const previewPayload = {
      nombre:         lead.name ?? "Cliente",
      tipoMueble:    (cp2.tipoMueble as string) ?? mapTipoMueble(lead.projectType),
      metros:         (cp2.metros as number)     ?? qp2.metros      ?? undefined,
      configuracion:  (cp2.configuracion as string) ?? qp2.configuracion ?? undefined,
      colorPreferido: (cp2.colorPreferido as string) ?? qp2.colorPreferido ?? undefined,
      ledIntegrado:   (cp2.ledIntegrado as boolean) ?? qp2.ledIntegrado ?? undefined,
      meson:          (cp2.meson as string)   ?? qp2.meson  ?? undefined,
      descripcion:    (cp2.descripcion as string) ?? qp2.descripcion ?? lead.projectType ?? undefined,
      material:       (cp2.material as string)  ?? qp2.material ?? undefined,
      ambiente:       (cp2.ambiente as string)  ?? undefined,
      estilo:         (cp2.estilo as string)    ?? undefined,
      anguloCamara:   (cp2.anguloCamara as string) ?? undefined,
      iluminacion:    (cp2.iluminacion as string)  ?? undefined,
      colorPared:     (cp2.colorPared as string)   ?? undefined,
      tipoPiso:       (cp2.tipoPiso as string)     ?? undefined,
      sizeAmbiente:   (cp2.sizeAmbiente as string) ?? undefined,
      elementosExtra: (cp2.elementosExtra as string[]) ?? undefined,
      noIncluir:      (cp2.noIncluir as string)    ?? undefined,
      promptExtra:    (cp2.promptExtra as string)  ?? undefined,
    };

    const ppRes = await svcFetch(env.RENDER_SVC, env.RENDER_URL, "/prompt-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Secret": env.RENDER_SECRET ?? "" },
      body: JSON.stringify(previewPayload),
      signal: AbortSignal.timeout(5000),
    }).catch(() => null);

    if (!ppRes || !ppRes.ok) return json({ error: "render_service_error" }, 502);
    const ppData = await ppRes.json() as { ok: boolean; prompt: string };
    return json(ppData);
  }

  // POST /api/admin/leads/:id/quote/render  — genera render+plano, guarda en R2
  if (request.method === "POST" && sub[0] === "leads" && sub[2] === "quote" && sub[3] === "render") {
    const lead = await db.getLeadById(sub[1]);
    if (!lead) return json({ error: "not_found" }, 404);
    if (!env.RENDER_URL || !env.RENDER_SECRET) {
      return json({ error: "render_not_configured" }, 500);
    }
    if (!env.ARTIFACTS) {
      return json({ error: "r2_not_configured" }, 500);
    }

    const leadId = sub[1];
    const quote = await db.getQuoteByLeadId(leadId);
    const params = (quote?.params ?? {}) as Record<string, unknown>;

    // Leer body — puede traer renderParams custom del Render Studio
    const bodyRaw = await request.json().catch(() => ({})) as Record<string, unknown>;
    const cp = (bodyRaw.renderParams ?? {}) as Record<string, unknown>;

    const renderPayload = {
      nombre:          lead.name ?? "Cliente",
      tipoMueble:     (cp.tipoMueble as string) ?? mapTipoMueble(lead.projectType),
      metros:          (cp.metros as number)    ?? params.metros          ?? undefined,
      configuracion:   (cp.configuracion as string) ?? params.configuracion   ?? undefined,
      colorPreferido:  (cp.colorPreferido as string)  ?? params.colorPreferido  ?? undefined,
      ledIntegrado:    (cp.ledIntegrado  as boolean)  ?? params.ledIntegrado    ?? undefined,
      meson:           (cp.meson as string)  ?? params.meson           ?? undefined,
      descripcion:     (cp.descripcion as string) ?? params.descripcion  ?? lead.projectType ?? undefined,
      material:        (cp.material as string) ?? params.material        ?? undefined,
      // Render Studio fields
      ambiente:        (cp.ambiente as string)        ?? undefined,
      estilo:          (cp.estilo as string)          ?? undefined,
      anguloCamara:    (cp.anguloCamara as string)    ?? undefined,
      iluminacion:     (cp.iluminacion as string)     ?? undefined,
      colorPared:      (cp.colorPared as string)      ?? undefined,
      tipoPiso:        (cp.tipoPiso as string)        ?? undefined,
      sizeAmbiente:    (cp.sizeAmbiente as string)    ?? undefined,
      elementosExtra:  (cp.elementosExtra as string[]) ?? undefined,
      noIncluir:       (cp.noIncluir as string)       ?? undefined,
      promptExtra:     (cp.promptExtra as string)     ?? undefined,
    };

    const renderRes = await svcFetch(env.RENDER_SVC, env.RENDER_URL, "/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Secret": env.RENDER_SECRET ?? "" },
      body: JSON.stringify(renderPayload),
      signal: AbortSignal.timeout(30000),
    }).catch((err) => {
      // Timeout o error en render — gpt-image-1 puede tardar >30s
      console.error(`[render-timeout] Lead ${leadId}: ${err.message}`);
      return null;
    });
    if (!renderRes) {
      return json({
        ok: true,
        quote,
        renderError: "⏱ Timeout generando imagen — gpt-image-1 está saturado. Intenta de nuevo en 1-2 minutos.",
      });
    }
    if (!renderRes.ok) return json({ error: "render_error", status: renderRes.status }, 502);
    const renderData = await renderRes.json() as { ok: boolean; renderPng?: string | null; planoSvg: string; renderError?: string };

    const renderKey = `renders/${leadId}/render.png`;
    const planKey   = `renders/${leadId}/plan.svg`;

    // Subir SVG siempre (plano no tiene costo)
    await env.ARTIFACTS.put(planKey, renderData.planoSvg, {
      httpMetadata: { contentType: "image/svg+xml" },
    });

    // Subir PNG solo si el render tuvo éxito
    if (renderData.renderPng) {
      const pngBytes = Uint8Array.from(atob(renderData.renderPng), c => c.charCodeAt(0));
      await env.ARTIFACTS.put(renderKey, pngBytes, {
        httpMetadata: { contentType: "image/png" },
      });
    }

    const updatedQuote = await db.upsertQuote(leadId, {
      renderKey: renderData.renderPng ? renderKey : undefined,
      planKey,
    });

    await db.logEvent("render_generated", leadId, {
      renderKey: renderData.renderPng ? renderKey : null,
      planKey,
      renderError: renderData.renderError ?? null,
    });

    return json({ ok: true, quote: updatedQuote, renderError: renderData.renderError ?? null });
  }

  // GET /api/admin/leads/:id/quote/asset?type=docx|render|plan — stream autenticado desde R2
  if (request.method === "GET" && sub[0] === "leads" && sub[2] === "quote" && sub[3] === "asset") {
    const type = url.searchParams.get("type") ?? "docx";

    // render y plan: servir desde R2
    if (type === "render" || type === "plan") {
      if (!env.ARTIFACTS) return json({ error: "r2_not_configured" }, 500);
      const leadId = sub[1];
      const quote = await db.getQuoteByLeadId(leadId);
      const key = type === "render" ? quote?.renderKey : quote?.planKey;
      if (!key) return json({ error: "not_generated_yet" }, 404);
      const obj = await env.ARTIFACTS.get(key);
      if (!obj) return json({ error: "artifact_not_found" }, 404);
      const contentType = type === "render" ? "image/png" : "image/svg+xml";
      return new Response(obj.body, { headers: { "Content-Type": contentType, "Cache-Control": "no-store" } });
    }

    if (type !== "docx") return json({ error: "type_invalid" }, 400);

    const lead = await db.getLeadById(sub[1]);
    if (!lead) return json({ error: "not_found" }, 404);
    if (!env.COTIZADOR_URL || !env.COTIZADOR_SECRET) {
      return json({ error: "cotizador_not_configured" }, 500);
    }

    const quote = await db.getQuoteByLeadId(sub[1]);
    const params = (quote?.params ?? {}) as Record<string, unknown>;
    const prose  = quote?.prose ?? null;

    const cotLead = buildCotizadorPayload(lead, { ...params, leadId: lead.id });

    let cotProse = prose;
    if (!cotProse) {
      // Si no hay prosa guardada, generamos con /preview primero
      const previewRes = await svcFetch(env.COTIZADOR_SVC, env.COTIZADOR_URL, "/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Secret": env.COTIZADOR_SECRET ?? "" },
        body: JSON.stringify(cotLead),
        signal: AbortSignal.timeout(12000),
      });
      if (previewRes.ok) {
        const pr = await previewRes.json() as { ok: boolean; contenido: unknown };
        if (pr.ok) cotProse = pr.contenido as Record<string, unknown>;
      }
    }

    const docxRes = await svcFetch(env.COTIZADOR_SVC, env.COTIZADOR_URL, "/docx", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Secret": env.COTIZADOR_SECRET ?? "" },
      body: JSON.stringify({ lead: cotLead, contenido: cotProse }),
      signal: AbortSignal.timeout(12000),
    });
    if (!docxRes.ok) return json({ error: "docx_error", status: docxRes.status }, 502);
    const docxResult = await docxRes.json() as { ok: boolean; docx: string };
    if (!docxResult.ok) return json({ error: "docx_error" }, 502);

    return json({ docx: docxResult.docx }); // base64 DOCX
  }

  // GET /api/admin/leads/:id/draft-quote
  // Genera el borrador de cotización con IA pero NO lo envía.
  if (request.method === "GET" && sub[0] === "leads" && sub[2] === "draft-quote") {
    const lead = await db.getLeadById(sub[1]);
    if (!lead) return json({ error: "not_found" }, 404);
    let draft: string;
    try {
      draft = await generateQuoteMessage(lead, env);
    } catch (e: any) {
      draft = buildFallbackQuote(lead);
    }
    return json({ draft });
  }

  // POST /api/admin/leads/:id/cotizar
  // Envía una cotización por WhatsApp al lead.
  // Body: {} → genera con IA | { customMessage: "..." } → usa el texto personalizado de Audenar.
  if (request.method === "POST" && sub[0] === "leads" && sub[2] === "cotizar") {
    const lead = await db.getLeadById(sub[1]);
    if (!lead) return json({ error: "not_found" }, 404);
    if (lead.stage === "rechazado") {
      return json({ error: "El lead está rechazado y no puede recibir cotización." }, 400);
    }

    const body = await request.json().catch(() => ({})) as { customMessage?: string };
    let quoteText: string;

    if (body.customMessage && body.customMessage.trim()) {
      quoteText = body.customMessage.trim();
    } else {
      try {
        quoteText = await generateQuoteMessage(lead, env);
      } catch (e: any) {
        console.warn("[Cotización] Error con IA, usando fallback:", e?.message);
        quoteText = buildFallbackQuote(lead);
      }
    }

    const whatsapp = new WhatsAppClient(env);
    await whatsapp.sendMessage(lead.phone, quoteText);
    await db.appendMessage(lead.id, "out", quoteText);
    await db.updateLead(sub[1], { stage: "cotizado", qualification: "calificado" });
    await db.logEvent("cotizacion_sent", lead.id, { preview: quoteText.substring(0, 100) });

    return json({ ok: true, preview: quoteText.substring(0, 200) });
  }

  // GET /api/admin/leads/:id/followup  — estado del closer para este lead
  if (request.method === "GET" && sub[0] === "leads" && sub[2] === "followup") {
    if (!env.CLOSER_URL && !env.CLOSER_SVC) return json({ error: "closer_not_configured" }, 500);
    const lead = await db.getLeadById(sub[1]);
    if (!lead) return json({ error: "not_found" }, 404);
    const phoneClean = lead.phone.replace(/[^0-9+]/g, "");
    const closerRes = await svcFetch(
      env.CLOSER_SVC, env.CLOSER_URL,
      `/estado/${encodeURIComponent(phoneClean)}`,
      { signal: AbortSignal.timeout(5000) }
    ).catch(() => null);
    if (!closerRes || !closerRes.ok) return json({ error: "closer_unavailable" }, 502);
    return json(await closerRes.json());
  }

  // POST /api/admin/leads/:id/followup  — pausar/reanudar/toque-manual/editar-toques
  if (request.method === "POST" && sub[0] === "leads" && sub[2] === "followup") {
    if ((!env.CLOSER_URL && !env.CLOSER_SVC) || !env.CLOSER_SECRET) return json({ error: "closer_not_configured" }, 500);
    const lead = await db.getLeadById(sub[1]);
    if (!lead) return json({ error: "not_found" }, 404);

    const body = await request.json().catch(() => ({})) as { accion: string; toques?: string[] };
    const accion = body.accion;
    const allowed = ["pausar", "reanudar", "toque-manual", "editar-toques"];
    if (!accion || !allowed.includes(accion)) {
      return json({ error: "accion_invalid", allowed }, 400);
    }

    const payload: Record<string, unknown> = { phone: lead.phone };
    if (accion === "editar-toques" && body.toques) payload.toques = body.toques;

    const closerRes = await svcFetch(env.CLOSER_SVC, env.CLOSER_URL, `/admin/${accion}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Secret": env.CLOSER_SECRET },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    }).catch(() => null);
    if (!closerRes || !closerRes.ok) return json({ error: "closer_error" }, 502);

    await db.logEvent(`followup_${accion}`, sub[1], { accion });
    return json(await closerRes.json());
  }

  return json({ error: "not_found" }, 404);
}

/* ------------------------------------------------------------------ */
/*  PUSH DESDE EL CLOSER — event log + actualización de etapa          */
/* ------------------------------------------------------------------ */
async function handleCloserEvent(request: Request, env: Env): Promise<Response> {
  const secret = request.headers.get("X-Secret") ?? "";
  if (!env.CLOSER_SECRET || secret !== env.CLOSER_SECRET) {
    return json({ error: "unauthorized" }, 401);
  }

  const body = await request.json().catch(() => null) as {
    phone?: string;
    tipo?: string;
    leadName?: string;
    closed?: boolean;
    paused?: boolean;
    followUpStep?: number;
    coldNotified?: boolean;
    lastOutboundAt?: string;
  } | null;

  if (!body?.phone || !body?.tipo) {
    return json({ error: "phone y tipo requeridos" }, 400);
  }

  const db = new DB(env.DB, env.AGENT_ID);
  const lead = await db.getLeadByPhone(normalizePhone(body.phone));
  if (!lead) return json({ ok: true, note: "lead_not_found" });

  await db.logEvent(`closer_${body.tipo}`, lead.id, {
    tipo: body.tipo,
    followUpStep: body.followUpStep ?? null,
    closed: body.closed ?? false,
    paused: body.paused ?? false,
  });

  if (body.tipo === "cierre" && lead.stage !== "cotizado") {
    await db.updateLead(lead.id, { stage: "cotizado", qualification: "calificado" });
  }

  return json({ ok: true });
}

/* ------------------------------------------------------------------ */
/*  R2 RETENCIÓN — borra artefactos de borradores > 30 días           */
/* ------------------------------------------------------------------ */
async function limpiarArtefactosViejos(env: Env): Promise<void> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const result = await env.DB.prepare(
    `SELECT id, render_key, plan_key FROM quotes
     WHERE status = 'borrador'
       AND (render_key IS NOT NULL OR plan_key IS NOT NULL)
       AND updated_at < ?`
  ).bind(cutoff).all<{ id: string; render_key: string | null; plan_key: string | null }>();

  if (!result.results?.length) return;

  for (const row of result.results) {
    const deletes: Promise<void>[] = [];
    if (row.render_key) deletes.push(env.ARTIFACTS!.delete(row.render_key));
    if (row.plan_key)   deletes.push(env.ARTIFACTS!.delete(row.plan_key));
    await Promise.all(deletes);
    await env.DB.prepare(
      `UPDATE quotes SET render_key = NULL, plan_key = NULL, updated_at = ? WHERE id = ?`
    ).bind(new Date().toISOString(), row.id).run();
    console.log(`[R2/Retención] artefactos borrados para borrador ${row.id}`);
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function jsonCors(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function twiml(): Response {
  return new Response("<Response></Response>", {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}
