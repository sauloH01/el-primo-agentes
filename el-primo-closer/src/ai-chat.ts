/**
 * ai-chat.ts — OpenAI para los mensajes de texto de WhatsApp del closer.
 *
 * Devuelve [respuesta, cerrado, transferir]:
 *  - respuesta:  texto para el lead (sin las etiquetas internas)
 *  - cerrado:    true si el lead confirmó avanzar ([CERRADO])
 *  - transferir: true si hay que pasar el lead a Audenar ([TRANSFERIR])
 */
import OpenAI from "openai";
import { CLOSER_SYSTEM_PROMPT } from "./knowledge";

export async function generarRespuestaChat(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  apiKey: string,
  model: string,
  contexto?: string
): Promise<[string, boolean, boolean]> {
  const client = new OpenAI({ apiKey });

  const fechaHoy = new Date().toLocaleDateString("es-CO", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    timeZone: "America/Bogota",
  });

  const systemContent = contexto
    ? `${CLOSER_SYSTEM_PROMPT}\n\nFECHA ACTUAL (Colombia): ${fechaHoy}\nCONTEXTO DE ESTE LEAD (cotización ya enviada por Audenar; NO inventes precios nuevos):\n${contexto}`
    : `${CLOSER_SYSTEM_PROMPT}\n\nFECHA ACTUAL (Colombia): ${fechaHoy}\n(Sin contexto previo: trata al lead con calidez y averigua en qué proyecto está interesado.)`;

  const resp = await client.chat.completions.create({
    model,
    messages: [{ role: "system", content: systemContent }, ...messages],
    max_tokens: 280,
    temperature: 0.4,
  });

  const raw =
    resp.choices[0]?.message?.content ??
    "¡Hola! Tuve un problemita técnico 🙏 ¿Me repites tu mensaje?";
  const cerrado = raw.includes("[CERRADO]");
  const transferir = raw.includes("[TRANSFERIR]");
  const respuesta = raw.replace("[CERRADO]", "").replace("[TRANSFERIR]", "").trim();

  return [respuesta, cerrado, transferir];
}
