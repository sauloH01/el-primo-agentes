/**
 * notify.ts — Avisa a Audenar por WhatsApp + correo cuando el closer cierra
 * (o transfiere) un lead, y cuando un lead se enfría.
 */

type Mensaje = { role: "user" | "assistant"; content: string };

async function enviarWA(
  accountSid: string,
  authToken: string,
  from: string,
  to: string,
  body: string
): Promise<void> {
  const waTo = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;
  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${accountSid}:${authToken}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ From: from, To: waTo, Body: body }).toString(),
  }).catch(() => {});
}

async function enviarCorreo(
  resendApiKey: string,
  from: string,
  to: string,
  subject: string,
  html: string
): Promise<void> {
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html }),
  }).catch(() => {});
}

export type NotifyOpts = {
  // Twilio (para avisar a Audenar por WhatsApp)
  accountSid: string;
  authToken: string;
  whatsappFrom: string;
  audenarWhatsapp: string;
  // Resend (respaldo por correo)
  resendApiKey: string;
  ownerEmail: string;
  fromEmail: string;
  // Datos del lead
  leadName: string;
  phone: string;
  motivo: "cierre" | "transferir" | "frio";
  messages: Mensaje[];
  contexto?: string;
};

export async function notificarAudenar(o: NotifyOpts): Promise<void> {
  const titulo =
    o.motivo === "cierre"
      ? "🔥 LEAD LISTO PARA CERRAR"
      : o.motivo === "transferir"
      ? "🙋 LEAD PIDE HABLAR CONTIGO"
      : "❄️ LEAD FRÍO (no respondió)";

  const phoneClean = o.phone.replace(/[^0-9]/g, "");

  // 1) WhatsApp a Audenar (lo más inmediato)
  const waMsg = [
    `*${titulo}*`,
    `👤 ${o.leadName}`,
    `📱 ${o.phone}`,
    o.contexto ? `📋 ${o.contexto.replace(/\n/g, " · ")}` : "",
    "",
    `Escríbele: https://wa.me/${phoneClean}`,
  ]
    .filter(Boolean)
    .join("\n");
  await enviarWA(o.accountSid, o.authToken, o.whatsappFrom, o.audenarWhatsapp, waMsg);

  // 2) Correo de respaldo con el hilo
  const ultimos = o.messages.slice(-6);
  const hilo = ultimos.length
    ? ultimos
        .map((m) => {
          const bg = m.role === "user" ? "#F0FBF7" : "#F8F4EE";
          const label = m.role === "user" ? o.leadName : "Asistente";
          return `<div style="padding:10px 14px;background:${bg};border-radius:6px;margin-bottom:8px;font-size:14px;font-family:Arial;"><strong>${escHtml(label)}:</strong> ${escHtml(m.content)}</div>`;
        })
        .join("")
    : `<p style="font-size:14px;color:#667788;font-family:Arial;">El lead no dejó mensajes.</p>`;

  const html = `<!DOCTYPE html><html><body style="background:#EFE9E1;font-family:Arial,sans-serif;margin:0;padding:20px;">
<div style="max-width:600px;margin:0 auto;">
  <div style="background:#4A2C0A;padding:24px 28px;border-radius:6px 6px 0 0;">
    <p style="margin:0;font-size:11px;color:#C9A84C;letter-spacing:3px;text-transform:uppercase;font-weight:bold;">EL PRIMO — SEGUIMIENTO</p>
    <h2 style="margin:8px 0 0;color:#FFF;font-size:22px;font-weight:normal;">${escHtml(titulo)}</h2>
  </div>
  <div style="background:#FFF;padding:28px;border-radius:0 0 6px 6px;border:1px solid #E0D8CC;border-top:none;">
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px;">
      <tr><td style="padding:8px 0;color:#8A7A68;width:110px;">Nombre</td><td style="padding:8px 0;color:#1C1917;font-weight:bold;">${escHtml(o.leadName)}</td></tr>
      <tr><td style="padding:8px 0;color:#8A7A68;">WhatsApp</td><td style="padding:8px 0;color:#1C1917;">${escHtml(o.phone)}</td></tr>
      ${o.contexto ? `<tr><td style="padding:8px 0;color:#8A7A68;vertical-align:top;">Contexto</td><td style="padding:8px 0;color:#1C1917;">${escHtml(o.contexto)}</td></tr>` : ""}
    </table>
    <p style="margin:0 0 12px;font-size:12px;color:#C9A84C;letter-spacing:2px;text-transform:uppercase;font-weight:bold;">Últimos mensajes</p>
    ${hilo}
    <div style="margin-top:24px;text-align:center;">
      <a href="https://wa.me/${phoneClean}" style="display:inline-block;background:#8B4513;color:#FFF;text-decoration:none;padding:14px 32px;font-size:13px;letter-spacing:2px;text-transform:uppercase;font-weight:bold;border-radius:3px;">Escribirle ahora</a>
    </div>
  </div>
</div></body></html>`;

  await enviarCorreo(o.resendApiKey, o.fromEmail, o.ownerEmail, `${titulo}: ${o.leadName}`, html);
}

function escHtml(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
