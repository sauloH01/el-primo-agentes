/**
 * email.ts — Envía la cotización por correo usando Resend (API directa, sin librerías).
 */

export type EmailAdjunto = { filename: string; content: string /* base64 */ };

export type EnviarCorreoInput = {
  apiKey: string; // RESEND_API_KEY
  from: string; // ej. "EL PRIMO <onboarding@resend.dev>"
  to: string; // OWNER_EMAIL (Audenar / Saulo)
  subject: string;
  html: string;
  replyTo?: string; // correo del lead, para responder directo
  attachments?: EmailAdjunto[];
};

export type EnviarCorreoResultado = { ok: boolean; id?: string; error?: string };

export async function enviarCorreo(input: EnviarCorreoInput): Promise<EnviarCorreoResultado> {
  const body: Record<string, unknown> = {
    from: input.from,
    to: [input.to],
    subject: input.subject,
    html: input.html,
  };
  if (input.replyTo) body.reply_to = input.replyTo;
  if (input.attachments?.length) body.attachments = input.attachments;

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const texto = await resp.text();
    return { ok: false, error: `Resend respondió ${resp.status}: ${texto}` };
  }
  const data = (await resp.json()) as { id?: string };
  return { ok: true, id: data.id };
}
