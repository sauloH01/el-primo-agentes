/**
 * twilio.ts — Helpers para la API de Twilio (WhatsApp).
 */

/** Parsea el FormData que manda Twilio en el body del webhook. */
export async function parsearFormData(req: Request): Promise<Record<string, string>> {
  const text = await req.text();
  const params: Record<string, string> = {};
  for (const pair of text.split("&")) {
    const [k, v] = pair.split("=");
    if (k) params[decodeURIComponent(k)] = decodeURIComponent((v ?? "").replace(/\+/g, " "));
  }
  return params;
}

/** Valida la firma X-Twilio-Signature (HMAC-SHA1) — seguridad del webhook. */
export async function validarFirma(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>
): Promise<boolean> {
  const sortedKeys = Object.keys(params).sort();
  let str = url;
  for (const key of sortedKeys) str += key + (params[key] ?? "");

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const sigBytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(str));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));
  return expected === signature;
}

/** Envía un mensaje de WhatsApp proactivo (outbound) al lead. */
export async function enviarMensajeWA(
  accountSid: string,
  authToken: string,
  from: string,
  to: string,
  body: string
): Promise<boolean> {
  const waTo = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;
  const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${accountSid}:${authToken}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ From: from, To: waTo, Body: body }).toString(),
  });
  return resp.ok;
}

/** Descarga un archivo de media (audio) de Twilio con autenticación. */
export async function descargarMediaTwilio(
  url: string,
  accountSid: string,
  authToken: string
): Promise<{ buffer: ArrayBuffer; contentType: string } | null> {
  const resp = await fetch(url, {
    headers: { Authorization: "Basic " + btoa(`${accountSid}:${authToken}`) },
  });
  if (!resp.ok) return null;
  const contentType = resp.headers.get("content-type") ?? "audio/ogg";
  const buffer = await resp.arrayBuffer();
  return { buffer, contentType };
}

/** TwiML para responder un mensaje de WhatsApp con texto. */
export function twiml(mensaje: string): Response {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escXml(mensaje)}</Message></Response>`;
  return new Response(xml, { headers: { "Content-Type": "text/xml" } });
}

/** TwiML vacío (cuando ya respondimos por REST o no hay nada que decir). */
export function twimlVacio(): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, {
    headers: { "Content-Type": "text/xml" },
  });
}

function escXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
