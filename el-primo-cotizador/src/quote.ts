/**
 * quote.ts — El "cerebro" + el "diseñador" de la cotización.
 *
 *  1. generarContenido() → OpenAI redacta el texto profesional (NUNCA precios)
 *  2. construirHtml()    → arma el correo interno premium para Audenar
 */
import OpenAI from "openai";
import type { Lead, ResultadoCotizacion, ContenidoIA } from "./types";
import { formatCOP, formatMillones } from "./pricing";
import { SYSTEM_PROMPT_CONTENIDO } from "./knowledge";

/** Le pide a OpenAI que redacte el contenido profesional (sin precios). */
export async function generarContenido(
  lead: Lead,
  cot: ResultadoCotizacion,
  apiKey: string,
  model: string
): Promise<ContenidoIA> {
  const client = new OpenAI({ apiKey });

  const userMsg = `Datos del proyecto:
- Cliente: ${lead.nombre}
- Zona: ${lead.zona}
- Tipo(s) de mueble: ${lead.tiposMueble.join(", ")}
- Descripción del cliente: ${lead.descripcion ?? "(no especificó)"}
- Material: ${lead.material ?? "RH (estándar)"}
- Metros: ${lead.metros ?? "por confirmar en visita técnica"}
- Configuración: ${lead.configuracion ?? "(no especificó)"}
- Mesón: ${lead.meson ?? "no aplica"}
- LED integrado: ${lead.ledIntegrado ? "sí" : "no"}
- Color preferido: ${lead.colorPreferido ?? "(no especificó)"}
- Entrega estimada: ${cot.diasEntrega} días hábiles
- Notas técnicas del sistema: ${cot.notas.join("; ")}

Redacta la propuesta siguiendo EXACTAMENTE el formato JSON pedido.`;

  const resp = await client.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT_CONTENIDO },
      { role: "user", content: userMsg },
    ],
    temperature: 0.7,
  });

  const content = resp.choices[0]?.message?.content ?? "{}";
  let parsed: Partial<ContenidoIA> = {};
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = {};
  }

  const proyecto = lead.tiposMueble[0] ?? "su proyecto";
  return {
    titulo: parsed.titulo || `Propuesta para la ${proyecto} de ${firstName(lead.nombre)}`,
    entendimiento:
      parsed.entendimiento ||
      `Entendemos que en ${lead.zona} buscas un proyecto de ${lead.tiposMueble.join(" y ")} hecho a tu medida. En EL PRIMO lo fabricamos en melamina RH de primera, con diseño 3D para que apruebes antes de cortar.`,
    entregables:
      parsed.entregables?.length
        ? parsed.entregables
        : [
            "Diseño 3D en SketchUp para aprobar antes de fabricar",
            "Melamina RH Tablemac/Duratex de primera calidad",
            "Cantos termosellados a máquina industrial",
            "Herrajes con cierre suave (soft-close)",
            "Transporte e instalación por equipo propio",
            "Garantía escrita: 1 año estructura, 6 meses herrajes",
          ],
    cierre:
      parsed.cierre ||
      "El siguiente paso es una visita técnica gratuita donde tomamos medidas exactas y afinamos el diseño 3D contigo. ¿Coordinamos día y hora?",
  };
}

// ─── Paleta EL PRIMO (madera / ebanistería) ─────────────────────────────────
const BROWN = "#4A2C0A";
const WOOD = "#8B4513";
const GOLD = "#C9A84C";
const GREEN = "#2E7D32";
const GRAY = "#4A4A5A";
const LGRAY = "#F0EBE3";

/** HTML interno para Audenar — con panel de datos del lead + cotización. */
export function construirHtml(lead: Lead, cot: ResultadoCotizacion, c: ContenidoIA): string {
  const fecha = new Date().toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
  const ref = `EP-${Date.now().toString(36).toUpperCase().slice(-6)}`;

  const itemsHtml = cot.items
    .map(
      (i) => `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid ${LGRAY};font-family:Arial;">
          <span style="display:block;font-size:14px;color:${BROWN};font-weight:bold;">${esc(i.descripcion)}</span>
        </td>
        <td style="padding:12px 0;border-bottom:1px solid ${LGRAY};text-align:right;white-space:nowrap;font-size:14px;font-weight:bold;color:${BROWN};font-family:Arial;">${formatMillones(i.precioMin)} – ${formatMillones(i.precioMax)}</td>
      </tr>`
    )
    .join("");

  const filaDescuento =
    cot.descuentoCombo > 0
      ? `<tr>
          <td style="padding:12px 0;border-bottom:1px solid ${LGRAY};font-family:Arial;font-size:13px;color:${GREEN};">🎁 Descuento proyecto combinado (5%)</td>
          <td style="padding:12px 0;border-bottom:1px solid ${LGRAY};text-align:right;font-size:14px;font-weight:bold;color:${GREEN};font-family:Arial;">- ${formatMillones(cot.descuentoCombo)}</td>
        </tr>`
      : "";

  const filaViaticos =
    cot.viaticos > 0
      ? `<tr>
          <td style="padding:12px 0;border-bottom:1px solid ${LGRAY};font-family:Arial;font-size:13px;color:${GRAY};">🚗 Viáticos ${esc(lead.zona)} (descontable si contrata)</td>
          <td style="padding:12px 0;border-bottom:1px solid ${LGRAY};text-align:right;font-size:14px;color:${GRAY};font-family:Arial;">${formatCOP(cot.viaticos)}</td>
        </tr>`
      : "";

  const entregablesHtml = c.entregables
    .map(
      (e) => `
      <tr>
        <td style="width:28px;padding:8px 0;vertical-align:top;">
          <div style="width:20px;height:20px;background:${WOOD};border-radius:50%;text-align:center;line-height:20px;font-size:11px;color:#fff;font-family:Arial;">✓</div>
        </td>
        <td style="padding:8px 0 8px 10px;color:${GRAY};font-size:14px;font-family:Arial;line-height:1.6;">${esc(e)}</td>
      </tr>`
    )
    .join("");

  const notasHtml = cot.notas.length
    ? `<ul style="margin:8px 0 0;padding-left:16px;">${cot.notas.map((n) => `<li style="font-size:13px;color:#7A5C2E;font-family:Arial;margin-bottom:4px;">${esc(n)}</li>`).join("")}</ul>`
    : "";

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#EFE9E1;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:700px;margin:0 auto;padding:24px 16px;">

  <!-- ░░░ PANEL INTERNO — elimina este bloque antes de reenviar al cliente ░░░ -->
  <div style="background:#FFF9E6;border:1px solid ${GOLD};border-radius:6px;padding:18px 20px;margin-bottom:20px;">
    <p style="margin:0 0 10px;font-size:13px;font-weight:bold;color:#7A5C2E;font-family:Arial;">📋 NUEVO LEAD — solo para Audenar (EL PRIMO)</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;font-family:Arial;">
      <tr><td style="padding:3px 0;width:120px;color:#92400E;">Nombre</td><td style="color:#1C1917;"><strong>${esc(lead.nombre)}</strong></td></tr>
      <tr><td style="padding:3px 0;color:#92400E;">Teléfono</td><td style="color:#1C1917;">${esc(lead.telefono)}</td></tr>
      <tr><td style="padding:3px 0;color:#92400E;">Correo</td><td style="color:#1C1917;">${esc(lead.correo || "—")}</td></tr>
      <tr><td style="padding:3px 0;color:#92400E;">Zona</td><td style="color:#1C1917;">${esc(lead.zona)}</td></tr>
      <tr><td style="padding:3px 0;color:#92400E;">Proyecto</td><td style="color:#1C1917;">${esc(lead.tiposMueble.join(", "))}</td></tr>
      <tr><td style="padding:3px 0;color:#92400E;">Descripción</td><td style="color:#1C1917;">${esc(lead.descripcion || "—")}</td></tr>
      <tr><td style="padding:3px 0;color:#92400E;">Presupuesto</td><td style="color:#1C1917;">${esc(lead.presupuestoCliente || "no indicado")}</td></tr>
      <tr><td style="padding:3px 0;color:#92400E;">Urgencia</td><td style="color:#1C1917;">${esc(lead.urgencia || "—")}</td></tr>
      <tr><td style="padding:3px 0;color:#92400E;">Fuente</td><td style="color:#1C1917;">${esc(lead.fuenteLead || "—")}</td></tr>
    </table>
    <div style="margin-top:12px;padding-top:12px;border-top:1px dashed ${GOLD};">
      <strong style="color:${BROWN};font-size:14px;">💰 Rango cotización: ${formatMillones(cot.totalMin)} – ${formatMillones(cot.totalMax)}</strong><br/>
      <span style="font-size:13px;color:${GRAY};">⏱️ Entrega estimada: ${cot.diasEntrega} días hábiles</span>
    </div>
    ${notasHtml}
  </div>

  <!-- ░░░ DOCUMENTO PARA EL CLIENTE ░░░ -->
  <div style="background:#FFFFFF;border-radius:6px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);">
    <div style="height:6px;background:linear-gradient(90deg,${WOOD} 0%,${BROWN} 100%);"></div>

    <div style="background:${BROWN};padding:32px 40px 28px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="vertical-align:top;">
            <p style="margin:0;font-size:11px;color:${GOLD};letter-spacing:3px;text-transform:uppercase;font-family:Arial;font-weight:bold;">EL PRIMO</p>
            <p style="margin:4px 0 0;font-size:10px;color:#C9B89A;letter-spacing:1px;text-transform:uppercase;font-family:Arial;">Ebanistería y Carpintería · Fusagasugá</p>
          </td>
          <td style="text-align:right;vertical-align:top;">
            <p style="margin:0;font-size:10px;color:#C9B89A;font-family:Arial;">Ref. ${ref}</p>
            <p style="margin:4px 0 0;font-size:10px;color:#C9B89A;font-family:Arial;">${fecha}</p>
          </td>
        </tr>
      </table>
      <div style="border-top:1px solid rgba(201,168,76,0.25);margin:20px 0;"></div>
      <h1 style="margin:0 0 12px;font-size:24px;color:#FFFFFF;font-family:Georgia,serif;font-weight:normal;line-height:1.3;">${esc(c.titulo)}</h1>
      <p style="margin:0;font-size:13px;color:#C9B89A;font-family:Arial;">Preparada para <strong style="color:${GOLD};">${esc(lead.nombre)}</strong></p>
    </div>

    <div style="padding:40px;">
      <p style="margin:0 0 8px;font-size:18px;color:${BROWN};font-family:Georgia,serif;">Hola ${esc(firstName(lead.nombre))},</p>
      <p style="margin:0 0 36px;font-size:15px;color:${GRAY};line-height:1.75;font-family:Georgia,serif;">${esc(c.entendimiento)}</p>

      <div style="margin-bottom:40px;">
        <p style="font-size:10px;color:${WOOD};letter-spacing:3px;text-transform:uppercase;font-family:Arial;font-weight:bold;border-bottom:2px solid ${WOOD};padding-bottom:8px;">01 ·· ¿Qué incluye tu proyecto?</p>
        <table style="width:100%;border-collapse:collapse;margin-top:16px;">${entregablesHtml}</table>
      </div>

      <div style="margin-bottom:40px;">
        <p style="font-size:10px;color:${WOOD};letter-spacing:3px;text-transform:uppercase;font-family:Arial;font-weight:bold;border-bottom:2px solid ${WOOD};padding-bottom:8px;">02 ·· Tu inversión estimada</p>
        <table style="width:100%;border-collapse:collapse;margin-top:16px;">
          ${itemsHtml}
          ${filaDescuento}
          ${filaViaticos}
          <tr><td colspan="2" style="padding:0;height:3px;background:${BROWN};"></td></tr>
          <tr style="background:${BROWN};">
            <td style="padding:16px 20px;color:#FFFFFF;font-family:Arial;font-size:13px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;">Inversión total estimada</td>
            <td style="padding:16px 20px;text-align:right;color:${GOLD};font-family:Arial;font-size:18px;font-weight:bold;white-space:nowrap;">${formatMillones(cot.totalMin)} – ${formatMillones(cot.totalMax)}</td>
          </tr>
        </table>
        <p style="margin:8px 0 0;font-size:11px;color:#999;font-family:Arial;">* Estimado preliminar. El precio exacto se confirma en la visita técnica gratuita.</p>
      </div>

      <p style="margin:0 0 28px;font-size:15px;color:${GRAY};line-height:1.75;font-family:Georgia,serif;">${esc(c.cierre)}</p>

      <div style="text-align:center;padding:8px 0 32px;">
        <a href="https://wa.me/${esc(lead.telefono.replace(/[^0-9]/g, ""))}" style="display:inline-block;background:${WOOD};color:#FFFFFF;text-decoration:none;padding:15px 40px;font-size:12px;letter-spacing:2px;text-transform:uppercase;font-family:Arial;font-weight:bold;border-radius:3px;">Agendar mi visita técnica gratuita</a>
      </div>

      <p style="margin:0;font-size:11px;color:#BBB;text-align:center;font-family:Arial;">Cotización válida por 15 días · Valores en Pesos Colombianos (COP)</p>
    </div>

    <div style="background:${BROWN};padding:22px 40px;text-align:center;">
      <p style="margin:0;font-size:10px;color:${GOLD};letter-spacing:3px;text-transform:uppercase;font-family:Arial;font-weight:bold;">EL PRIMO</p>
      <p style="margin:8px 0 0;font-size:11px;color:#C9B89A;font-family:Arial;">Audenar Salazar · 13 años de experiencia · Garantía escrita</p>
    </div>
  </div>
</div>
</body></html>`;
}

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function firstName(full: string): string {
  return (full || "").trim().split(/\s+/)[0] || full || "";
}
