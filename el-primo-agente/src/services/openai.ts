// src/services/openai.ts
// Cerebro del agente: responde con MEMORIA (historial completo) y califica el lead.
import OpenAI from "openai";
import type { Lead, AgentReply, ConversationMessage, Stage } from "../types";
import { buildKnowledge } from "../knowledge";

const VALID_STAGES: Stage[] = ["nuevo", "en_proceso", "calificado", "rechazado"];

export class OpenAIClient {
  private openai: OpenAI;

  constructor(env: { OPENAI_API_KEY: string }) {
    this.openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }

  /**
   * Procesa el último mensaje del cliente teniendo en cuenta TODA la conversación
   * previa y el conocimiento del negocio. Devuelve la respuesta + la calificación.
   */
  async generateReply(
    conversation: ConversationMessage[],
    lead: Lead
  ): Promise<AgentReply> {
    const knowledge = buildKnowledge();

    const systemPrompt = `${knowledge}

INSTRUCCIONES DE SALIDA
Eres el agente de ventas en una conversación de WhatsApp en curso. Lee TODO el historial y responde el último mensaje del cliente.
Datos que ya conocemos de este lead (pueden estar vacíos):
- Nombre: ${lead.name ?? "(desconocido)"}
- Ciudad/Zona: ${lead.city ?? "(desconocida)"}
- Presupuesto: ${lead.budget ? `$${lead.budget.toLocaleString("es-CO")} COP` : "(desconocido)"}

Devuelve SIEMPRE un JSON con esta forma exacta:
{
  "reply": "respuesta breve para WhatsApp (máx 350 caracteres)",
  "nextStage": "nuevo" | "en_proceso" | "calificado" | "rechazado",
  "isQualified": true | false,
  "tiers": [ { "tier": "Básico", "price": 4000000 }, { "tier": "Premium", "price": 4800000 }, { "tier": "Lujo", "price": 6000000 } ],
  "capturedFields": { "name": "...", "city": "...", "budget": 0, "projectType": "..." }
}
Reglas:
- Si aún falta tipo de mueble, zona o presupuesto → nextStage="en_proceso", isQualified=false, sigue preguntando UNA cosa a la vez. "tiers" puede ir vacío.
- Marca isQualified=true y nextStage="calificado" SOLO cuando tengas tipo de proyecto + zona + un presupuesto/estimación que llegue al ticket mínimo. Incluye los 3 tiers.
- Si la estimación no llega al ticket mínimo → nextStage="rechazado", isQualified=false, "tiers" vacío, y despídete con amabilidad ofreciendo proyectos más pequeños a futuro.
- En "capturedFields" incluye solo lo que hayas podido deducir en esta conversación (omite lo que no sepas).`;

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...conversation.map((m) => ({
        role: (m.direction === "in" ? "user" : "assistant") as "user" | "assistant",
        content: m.body,
      })),
    ];

    let parsed: Partial<AgentReply> = {};
    try {
      const res = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.5,
        messages,
        response_format: { type: "json_object" },
      });
      parsed = JSON.parse(res.choices[0].message?.content?.trim() ?? "{}");
    } catch (err) {
      console.error("[OpenAI] fallo generando respuesta:", err);
    }

    // Normalización defensiva (nunca confíes ciegamente en el modelo).
    const isQualified = parsed.isQualified === true;
    let nextStage: Stage = VALID_STAGES.includes(parsed.nextStage as Stage)
      ? (parsed.nextStage as Stage)
      : isQualified
        ? "calificado"
        : "en_proceso";
    // Coherencia: si dice calificado pero la etapa no lo refleja (o viceversa).
    if (isQualified && nextStage !== "calificado") nextStage = "calificado";
    if (!isQualified && nextStage === "calificado") nextStage = "en_proceso";

    return {
      reply:
        typeof parsed.reply === "string" && parsed.reply.trim()
          ? parsed.reply.trim()
          : "Gracias por escribir a EL PRIMO 🙌 Cuéntame, ¿qué mueble o espacio quieres a medida (cocina, clóset, baño...) y en qué zona?",
      nextStage,
      isQualified,
      tiers: Array.isArray(parsed.tiers) ? parsed.tiers : [],
      capturedFields: parsed.capturedFields ?? {},
    };
  }
}
