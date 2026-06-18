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
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
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
      if (pathname.startsWith("/api/admin/")) {
        return await handleAdmin(request, env, url);
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
  const payload = {
    nombre: cf.name ?? lead.name ?? "Cliente",
    telefono: from.replace(/[^0-9]/g, ""),
    zona: cf.city ?? lead.city ?? "Fusagasugá",
    tiposMueble: [mapTipoMueble(cf.projectType ?? lead.projectType)],
    descripcion: cf.projectType ?? lead.projectType ?? undefined,
    presupuestoCliente: budget ? `$${budget.toLocaleString("es-CO")}` : undefined,
    fuenteLead: "whatsapp-agente" as const,
    leadId: lead.id,
  };
  try {
    await fetch(`${env.COTIZADOR_URL}/notificar`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Secret": env.COTIZADOR_SECRET },
      body: JSON.stringify(payload),
    });
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
  const msg = [
    "🔥 *LEAD CALIFICADO*",
    `👤 ${lead.name ?? "Cliente"}`,
    `📍 ${lead.city ?? "Zona por confirmar"}`,
    lead.budget ? `💰 Presupuesto: $${lead.budget.toLocaleString("es-CO")}` : "",
    "",
    tiersResumen ? "📋 *Cotización estimada:*" : "",
    tiersResumen,
    "",
    `📞 Contactar: ${phone}`,
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

  return json({ error: "not_found" }, 404);
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
