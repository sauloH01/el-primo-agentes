/**
 * index.ts — Worker principal del closer de EL PRIMO.
 *
 * Rutas:
 *   POST /webhook/message   → Twilio envía mensaje de WhatsApp entrante
 *   POST /notificar         → el cotizador avisa: "envié cotización a este lead"
 *   POST /admin/message     → instrucción manual sobre un lead
 *   POST /admin/reset       → borra la memoria de una conversación
 *   GET  /estado/:phone     → ver estado de una conversación
 */
import { getAgentByName } from "agents";
import { Conversation } from "./conversation";
import { parsearFormData, validarFirma, descargarMediaTwilio, twiml, twimlVacio } from "./twilio";
import { transcribirAudio } from "./transcribe";

export type Env = {
  Conversation: DurableObjectNamespace<Conversation>;
  OPENAI_MODEL: string;
  OWNER_EMAIL: string;
  FROM_EMAIL: string;
  AUDENAR_WHATSAPP: string; // solo dígitos
  OPENAI_API_KEY: string;
  RESEND_API_KEY: string;
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_WHATSAPP_FROM: string; // "whatsapp:+14155238886"
  CLOSER_SECRET: string;
  AGENTE_URL?: string; // URL pública del agente (para push-back de eventos)
};

export { Conversation };

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "POST" && url.pathname === "/webhook/message") return handleMessage(req, env);
    if (req.method === "POST" && url.pathname === "/notificar") return handleNotificar(req, env);
    if (req.method === "POST" && url.pathname.startsWith("/admin/message")) return handleAdmin(req, env);

    if (req.method === "POST" && url.pathname === "/admin/reset") {
      const secret = req.headers.get("X-Secret") ?? "";
      if (secret !== env.CLOSER_SECRET) return new Response("Unauthorized", { status: 403 });
      const { phone } = await req.json<{ phone: string }>();
      if (!phone) return Response.json({ ok: false }, { status: 400 });
      const conv = await getAgentByName(env.Conversation, limpiarPhone(phone));
      await conv.fetch(new Request("https://do/reset", { method: "POST" }));
      return Response.json({ ok: true });
    }

    if (req.method === "POST" && url.pathname === "/admin/pausar") return handleAdminAccion(req, env, "pausar");
    if (req.method === "POST" && url.pathname === "/admin/reanudar") return handleAdminAccion(req, env, "reanudar");
    if (req.method === "POST" && url.pathname === "/admin/toque-manual") return handleAdminAccion(req, env, "toque-manual");
    if (req.method === "POST" && url.pathname === "/admin/editar-toques") return handleAdminEditarToques(req, env);

    if (req.method === "GET" && url.pathname.startsWith("/estado/")) {
      const phone = url.pathname.replace("/estado/", "");
      const conv = await getAgentByName(env.Conversation, limpiarPhone(phone));
      return conv.fetch(new Request("https://do/state"));
    }

    return new Response("Closer EL PRIMO — vivo 🪵", { status: 200 });
  },
};

async function handleMessage(req: Request, env: Env): Promise<Response> {
  const clonedReq = req.clone();
  const params = await parsearFormData(clonedReq);

  const signature = req.headers.get("X-Twilio-Signature") ?? "";
  if (signature) {
    const valid = await validarFirma(env.TWILIO_AUTH_TOKEN, signature, new URL(req.url).toString(), params);
    if (!valid) return new Response("Unauthorized", { status: 403 });
  }

  const from = params["From"] ?? "";
  let body = params["Body"] ?? "";
  const profileName = params["ProfileName"] ?? "amigo";
  if (!from) return twiml("Hola, ¿en qué te puedo ayudar?");

  // Nota de voz → transcribir con Whisper
  const numMedia = parseInt(params["NumMedia"] ?? "0", 10);
  const mediaType = params["MediaContentType0"] ?? "";
  const mediaUrl = params["MediaUrl0"] ?? "";
  if (!body.trim() && numMedia > 0 && mediaType.startsWith("audio") && mediaUrl) {
    const media = await descargarMediaTwilio(mediaUrl, env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
    if (media) {
      try {
        body = await transcribirAudio(media.buffer, media.contentType, env.OPENAI_API_KEY);
      } catch {
        body = "";
      }
    }
  }

  if (!body.trim()) {
    if (numMedia > 0) {
      return twiml("Recibí tu archivo 🙌 pero por ahora entiendo mejor texto y notas de voz 🎙️. ¿Me lo escribes o me mandas un audio?");
    }
    return twimlVacio();
  }

  const phone = limpiarPhone(from);
  const conv = await getAgentByName(env.Conversation, phone);
  const respReq = new Request("https://do/process-message", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body, profileName, phone: from }),
  });
  const respData = await (await conv.fetch(respReq)).json<{ respuesta: string }>();
  return twiml(respData.respuesta);
}

async function handleNotificar(req: Request, env: Env): Promise<Response> {
  const secret = req.headers.get("X-Secret") ?? "";
  if (secret !== env.CLOSER_SECRET) return new Response("Unauthorized", { status: 403 });

  const data = await req.json<{ phone: string; nombre: string }>();
  if (!data.phone) return Response.json({ ok: false, error: "phone requerido" }, { status: 400 });

  const phone = limpiarPhone(data.phone);
  const conv = await getAgentByName(env.Conversation, phone);
  const ctxReq = new Request("https://do/set-context", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...data, phone: data.phone }),
  });
  const result = await (await conv.fetch(ctxReq)).json<{ ok: boolean; enviado: boolean }>();
  return Response.json(result);
}

async function handleAdmin(req: Request, env: Env): Promise<Response> {
  const secret = req.headers.get("X-Secret") ?? "";
  if (secret !== env.CLOSER_SECRET) return new Response("Unauthorized", { status: 403 });

  const { phone, instruccion } = await req.json<{ phone: string; instruccion: string }>();
  if (!phone || !instruccion) return Response.json({ ok: false }, { status: 400 });

  const conv = await getAgentByName(env.Conversation, limpiarPhone(phone));
  await conv.fetch(
    new Request("https://do/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruccion }),
    })
  );
  return Response.json({ ok: true });
}

async function handleAdminAccion(req: Request, env: Env, accion: string): Promise<Response> {
  const secret = req.headers.get("X-Secret") ?? "";
  if (secret !== env.CLOSER_SECRET) return new Response("Unauthorized", { status: 403 });
  const body = await req.json<{ phone: string }>().catch(() => ({ phone: "" }));
  if (!body.phone) return Response.json({ ok: false, error: "phone requerido" }, { status: 400 });
  const conv = await getAgentByName(env.Conversation, limpiarPhone(body.phone));
  return conv.fetch(new Request(`https://do/admin/${accion}`, { method: "POST" }));
}

async function handleAdminEditarToques(req: Request, env: Env): Promise<Response> {
  const secret = req.headers.get("X-Secret") ?? "";
  if (secret !== env.CLOSER_SECRET) return new Response("Unauthorized", { status: 403 });
  const body = await req.json<{ phone: string; toques: string[] }>().catch(() => ({ phone: "", toques: [] }));
  if (!body.phone) return Response.json({ ok: false, error: "phone requerido" }, { status: 400 });
  const conv = await getAgentByName(env.Conversation, limpiarPhone(body.phone));
  return conv.fetch(new Request("https://do/admin/editar-toques", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ toques: body.toques }),
  }));
}

function limpiarPhone(raw: string): string {
  return raw.replace(/^whatsapp:/, "").replace(/[^0-9+]/g, "");
}
