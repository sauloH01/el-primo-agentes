/**
 * render.ts — Genera el render fotorrealista con gpt-image-1.
 * Devuelve el PNG como base64 (listo para adjuntar al correo).
 */
import OpenAI from "openai";
import type { RenderRequest, Env } from "./types";
import { construirPromptRender } from "./knowledge";

export type RenderResult = { ok: boolean; base64?: string; prompt: string; error?: string };

export async function generarRender(r: RenderRequest, env: Env): Promise<RenderResult> {
  const prompt = construirPromptRender(r);
  try {
    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const resp = await client.images.generate({
      model: env.OPENAI_IMAGE_MODEL || "gpt-image-1",
      prompt,
      size: (env.IMAGE_SIZE as "1024x1024" | "1536x1024" | "1024x1536") || "1536x1024",
      quality: (env.IMAGE_QUALITY as "low" | "medium" | "high") || "high",
      n: 1,
    });

    const b64 = resp.data?.[0]?.b64_json;
    if (!b64) return { ok: false, prompt, error: "La API no devolvió imagen." };
    return { ok: true, base64: b64, prompt };
  } catch (e) {
    return { ok: false, prompt, error: e instanceof Error ? e.message : String(e) };
  }
}
