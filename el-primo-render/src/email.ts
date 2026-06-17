/**
 * email.ts — Envía el render + plano a Audenar por correo (Resend).
 * Audenar revisa el render IA (puede tener detalles a pulir) antes de mostrarlo al cliente.
 */
import type { RenderRequest } from "./types";

type Adjunto = { filename: string; content: string /* base64 */ };

async function resendSend(
  apiKey: string,
  from: string,
  to: string,
  subject: string,
  html: string,
  attachments: Adjunto[]
): Promise<{ ok: boolean; error?: string }> {
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html, attachments }),
  });
  if (!resp.ok) return { ok: false, error: `Resend ${resp.status}: ${await resp.text()}` };
  return { ok: true };
}

const BROWN = "#4A2C0A";
const GOLD = "#C9A84C";
const GRAY = "#6B6B6B";

export async function enviarRenderEmail(opts: {
  apiKey: string;
  from: string;
  to: string;
  r: RenderRequest;
  renderB64?: string; // PNG base64 (sin prefijo data:)
  svg: string; // SVG del plano
  prompt: string;
  renderError?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { r } = opts;
  const safeName = (r.nombre || "Cliente").replace(/[^a-zA-Z0-9]/g, "-");

  const attachments: Adjunto[] = [];
  if (opts.renderB64) {
    attachments.push({ filename: `Render-${safeName}.png`, content: opts.renderB64 });
  }
  // SVG del plano como adjunto (base64 del texto SVG)
  attachments.push({ filename: `Plano-${safeName}.svg`, content: b64(opts.svg) });

  const renderHtml = opts.renderB64
    ? `<img src="data:image/png;base64,${opts.renderB64}" alt="Render" style="width:100%;max-width:560px;border-radius:8px;border:1px solid #E0D8CC;" />`
    : `<div style="padding:16px;background:#FFF3E0;border:1px solid ${GOLD};border-radius:6px;font-size:13px;color:#92400E;">No se pudo generar el render IA esta vez${opts.renderError ? `: ${escHtml(opts.renderError)}` : ""}. El plano 2D sí va adjunto.</div>`;

  const html = `<!DOCTYPE html><html><body style="background:#EFE9E1;font-family:Arial,sans-serif;margin:0;padding:20px;">
<div style="max-width:620px;margin:0 auto;background:#FFF;border-radius:8px;overflow:hidden;border:1px solid #E0D8CC;">
  <div style="background:${BROWN};padding:24px 28px;">
    <p style="margin:0;font-size:11px;color:${GOLD};letter-spacing:3px;text-transform:uppercase;font-weight:bold;">EL PRIMO — RENDER + PLANO</p>
    <h2 style="margin:8px 0 0;color:#FFF;font-size:21px;font-weight:normal;">Propuesta visual para ${escHtml(r.nombre)}</h2>
  </div>
  <div style="padding:24px 28px;">
    <p style="margin:0 0 16px;font-size:14px;color:#1C1917;">
      Audenar, generé una propuesta visual para este lead. <strong>Revisa el render antes de enviarlo al cliente</strong> — es un concepto IA, el 3D técnico final lo afinas tú en SketchUp.
    </p>
    ${renderHtml}
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin:20px 0;">
      <tr><td style="padding:6px 0;color:${GRAY};width:130px;">Cliente</td><td style="color:#1C1917;font-weight:bold;">${escHtml(r.nombre)}</td></tr>
      ${r.phone ? `<tr><td style="padding:6px 0;color:${GRAY};">WhatsApp</td><td style="color:#1C1917;">${escHtml(r.phone)}</td></tr>` : ""}
      <tr><td style="padding:6px 0;color:${GRAY};">Mueble</td><td style="color:#1C1917;">${escHtml(r.tipoMueble)}${r.configuracion ? ` (${escHtml(r.configuracion)})` : ""}</td></tr>
      ${r.metros ? `<tr><td style="padding:6px 0;color:${GRAY};">Medidas</td><td style="color:#1C1917;">${r.metros} m</td></tr>` : ""}
      ${r.colorPreferido ? `<tr><td style="padding:6px 0;color:${GRAY};">Color</td><td style="color:#1C1917;">${escHtml(r.colorPreferido)}</td></tr>` : ""}
    </table>
    <p style="margin:0;font-size:12px;color:${GRAY};">📎 Adjuntos: render en PNG y plano preliminar en SVG (ábrelo en el navegador o Word).</p>
  </div>
  <div style="background:${BROWN};padding:16px 28px;text-align:center;">
    <p style="margin:0;font-size:10px;color:${GOLD};letter-spacing:2px;text-transform:uppercase;">EL PRIMO · Ebanistería y Carpintería</p>
  </div>
</div></body></html>`;

  return resendSend(
    opts.apiKey,
    opts.from,
    opts.to,
    `🎨 Render + plano — ${r.nombre} (${r.tipoMueble})`,
    html,
    attachments
  );
}

function b64(s: string): string {
  // UTF-8 safe base64 para el SVG
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function escHtml(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
