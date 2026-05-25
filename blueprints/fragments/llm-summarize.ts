/**
 * Fragment: pedirle a OpenAI que resuma o procese una lista de items.
 *
 * Usado típicamente después de scraping para destilar muchos items
 * en pocos puntos accionables.
 *
 * Modelo recomendado: gpt-4o-mini (barato, suficiente para resumir)
 */
import OpenAI from "openai";

export type LLMSummaryInput = {
  items: Array<{ text: string; [key: string]: any }>;
  /** Instrucción específica de qué hacer con los items */
  instruction: string;
  /** Cuántos puntos sintetizar (default 3) */
  maxOutputs?: number;
  apiKey: string;
  model?: string;  // default: "gpt-4o-mini"
};

export type LLMSummaryOutput = {
  summaries: string[];
  raw: string;
};

const DEFAULT_SYSTEM = `Eres un asistente que sintetiza información para audiencias hispanohablantes (LATAM).
Tu output es siempre en español neutro, claro, sin tecnicismos innecesarios.
Devuelves JSON estructurado.`;

export async function summarizeWithLLM(opts: LLMSummaryInput): Promise<LLMSummaryOutput> {
  const { items, instruction, maxOutputs = 3, apiKey, model = "gpt-4o-mini" } = opts;
  const client = new OpenAI({ apiKey });

  const compact = items.map((t, i) => `${i + 1}. ${t.text.slice(0, 280)}`).join("\n");

  const userMsg = `${instruction}

Items disponibles:
${compact}

Devuelve un JSON con esta forma exacta:
{
  "summaries": ["punto 1", "punto 2", ...]
}

Máximo ${maxOutputs} puntos. Sé conciso, accionable.`;

  const resp = await client.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: DEFAULT_SYSTEM },
      { role: "user", content: userMsg },
    ],
  });

  const content = resp.choices[0]?.message?.content ?? "{}";

  let parsed: { summaries?: string[] };
  try {
    parsed = JSON.parse(content);
  } catch {
    return { summaries: [], raw: content };
  }

  return {
    summaries: parsed.summaries ?? [],
    raw: content,
  };
}
