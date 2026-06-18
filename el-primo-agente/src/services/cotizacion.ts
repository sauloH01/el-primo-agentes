// src/services/cotizacion.ts
// Genera y envía una cotización formal por WhatsApp a un lead calificado.
// Se llama desde el dashboard (botón "Enviar cotización") o potencialmente de forma automática.

import type { Env, Lead } from "../types";
import { buildKnowledge } from "../knowledge";

/** Genera el mensaje de cotización formal usando GPT-4o. */
export async function generateQuoteMessage(lead: Lead, env: Env): Promise<string> {
  const tiersText = lead.tiers
    .map((t) => `• ${t.tier}: $${t.price.toLocaleString("es-CO")} COP`)
    .join("\n");

  const knowledge = buildKnowledge();

  const clientName = (lead.name ?? "").trim();
  const saludoNombre = clientName ? `${clientName.split(" ")[0]}` : "hola";

  const prompt = `Eres Audenar Salazar, dueño de EL PRIMO Carpintería (Fusagasugá). Redacta un mensaje de WhatsApp para presentar una cotización al cliente.

DATOS DEL CLIENTE:
- Nombre para saludar: ${saludoNombre}
- Ciudad/zona: ${lead.city ?? "por confirmar"}
- Tipo de proyecto: ${lead.projectType ?? "mobiliario"}
- Presupuesto informado: ${lead.budget ? `$${lead.budget.toLocaleString("es-CO")} COP` : "por definir"}

TIERS CALCULADOS (estos son los valores reales — úsalos tal cual):
${tiersText || "• Cotización personalizada: a definir en visita técnica"}

INSTRUCCIONES ESTRICTAS:
- Saluda usando el nombre real: "${saludoNombre}". NUNCA escribas "[Nombre del Cliente]" ni ningún placeholder.
- Presenta los tiers con sus precios EXACTOS tal como aparecen arriba. No los cambies.
- Los precios ya están calculados para el presupuesto de ${lead.budget ? `$${lead.budget.toLocaleString("es-CO")}` : "este cliente"} — son coherentes.
- Menciona que los valores son estimados y el precio exacto se confirma en la visita técnica gratuita.
- Menciona que incluye instalación, diseño 3D y garantía escrita de 1 año.
- Invita a agendar la visita técnica gratuita.
- Tono: directo, profesional, cercano. Sin lenguaje corporativo. En español colombiano.
- Formato WhatsApp: usa *negrita* para los precios y secciones clave. Máximo 200 palabras.
- Firma como: *Audenar — EL PRIMO Carpintería*
- NUNCA escribas "[Tu Nombre]", "[Nombre del Cliente]" ni ningún corchete o placeholder.
- NO incluyas número de teléfono ni menciones que vas a contactar al cliente (él ya está en el chat).

CONOCIMIENTO DEL NEGOCIO:
${knowledge.substring(0, 800)}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      temperature: 0.7,
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Error generando cotización: ${err}`);
  }

  const json: any = await res.json();
  return (json.choices?.[0]?.message?.content ?? "").trim();
}

/** Formatea una cotización básica sin IA cuando no hay tiers guardados. */
export function buildFallbackQuote(lead: Lead): string {
  const name = lead.name ?? "hola";
  const project = lead.projectType ?? "tu proyecto";
  const city = lead.city ? ` en ${lead.city}` : "";

  return [
    `👋 *${name}*, gracias por tu interés en EL PRIMO Carpintería.`,
    "",
    `Para tu ${project}${city}, preparamos la siguiente estimación:`,
    "",
    ...(lead.tiers.length > 0
      ? lead.tiers.map((t) => `• *${t.tier}*: $${t.price.toLocaleString("es-CO")} COP`)
      : ["• Cotización personalizada: a definir en visita técnica"]),
    "",
    "✅ *Todos los precios incluyen:* diseño 3D, materiales melamina RH, instalación y garantía de 1 año.",
    "",
    "📐 ¿Agendamos la visita técnica gratuita para tomar medidas exactas?",
  ].join("\n");
}
