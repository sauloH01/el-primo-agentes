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

  const prompt = `Eres el agente de ventas de EL PRIMO Carpintería. Redacta un mensaje de WhatsApp profesional y cálido para enviar una cotización al cliente.

DATOS DEL CLIENTE:
- Nombre: ${lead.name ?? "Cliente"}
- Ciudad/zona: ${lead.city ?? "por confirmar"}
- Tipo de proyecto: ${lead.projectType ?? "muebles"}
- Presupuesto informado: ${lead.budget ? `$${lead.budget.toLocaleString("es-CO")} COP` : "por definir"}

TIERS ESTIMADOS:
${tiersText || "• Cotización personalizada: a definir en visita técnica"}

CONOCIMIENTO DEL NEGOCIO:
${knowledge.substring(0, 1200)}

INSTRUCCIONES:
- Saluda al cliente por su nombre si está disponible
- Presenta los tiers de forma clara (básico/estándar/premium si aplica)
- Menciona que incluye instalación y garantía
- Invita a agendar la visita técnica gratuita
- Tono: profesional pero cercano, en español colombiano
- Formato WhatsApp: usa *negrita* para resaltar precios, emojis moderados
- Máximo 250 palabras
- NO incluyas el número de teléfono de la empresa (el cliente ya está en la conversación)`;

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
