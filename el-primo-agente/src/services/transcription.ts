// src/services/transcription.ts
// Maneja la transcripción de audios (Whisper) y descripción de imágenes (GPT-4o Vision).
// Los medios de WhatsApp requieren autenticación básica Twilio para descargarse.

import type { Env } from "../types";

export type MediaResult = {
  text: string;       // texto a usar como "body" del mensaje en la conversación
  transcription: string; // lo mismo, se guarda también en la columna transcription
};

/** Descarga un archivo de media de Twilio (requiere auth básica). */
async function fetchTwilioMedia(url: string, env: Env): Promise<ArrayBuffer> {
  const credentials = btoa(`${env.WHATSAPP_ACCOUNT_SID}:${env.WHATSAPP_AUTH_TOKEN}`);
  const res = await fetch(url, {
    headers: { Authorization: `Basic ${credentials}` },
  });
  if (!res.ok) throw new Error(`Error descargando media Twilio: ${res.status}`);
  return res.arrayBuffer();
}

/**
 * Transcribe una nota de voz (OGG/MP4/WebM) con OpenAI Whisper.
 * Devuelve el texto transcripto.
 */
export async function transcribeAudio(
  mediaUrl: string,
  contentType: string,
  env: Env
): Promise<MediaResult> {
  const buffer = await fetchTwilioMedia(mediaUrl, env);

  // Whisper acepta varios formatos; normalizamos la extensión
  const ext = contentType.includes("ogg")
    ? "ogg"
    : contentType.includes("mp4") || contentType.includes("m4a")
    ? "mp4"
    : contentType.includes("webm")
    ? "webm"
    : "ogg";

  const form = new FormData();
  form.append("file", new Blob([buffer], { type: contentType }), `audio.${ext}`);
  form.append("model", "whisper-1");
  form.append("language", "es");
  form.append("response_format", "text");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: form,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Whisper error: ${err}`);
  }

  const text = ((await res.text()) as string).trim();
  return { text: `[Audio] ${text}`, transcription: text };
}

/**
 * Describe una imagen usando GPT-4o Vision.
 */
export async function describeImage(
  mediaUrl: string,
  contentType: string,
  env: Env
): Promise<MediaResult> {
  // Descargamos la imagen y la convertimos a base64 (Vision acepta URL o base64)
  const buffer = await fetchTwilioMedia(mediaUrl, env);
  const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
  const dataUrl = `data:${contentType};base64,${base64}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Describe brevemente qué muestra esta imagen en el contexto de una empresa de carpintería y muebles. ¿Qué tipo de mueble o espacio es? ¿Hay medidas o detalles visibles? Responde en español, máximo 2 oraciones.",
            },
            { type: "image_url", image_url: { url: dataUrl, detail: "low" } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Vision error: ${err}`);
  }

  const json: any = await res.json();
  const description: string = json.choices?.[0]?.message?.content?.trim() ?? "Imagen recibida.";
  return { text: `[Imagen] ${description}`, transcription: description };
}

/**
 * Punto de entrada principal: recibe los params del webhook de Twilio
 * y decide qué hacer según el tipo de media.
 * Devuelve el texto procesado y el tipo de media detectado.
 */
export async function processMedia(
  params: Record<string, string>,
  env: Env
): Promise<{
  body: string;
  mediaType: "audio" | "image" | "video" | "document" | "location";
  mediaUrl: string;
  transcription: string;
} | null> {
  const numMedia = parseInt(params["NumMedia"] ?? "0", 10);
  if (numMedia === 0) return null;

  const contentType = (params["MediaContentType0"] ?? "").toLowerCase();
  const mediaUrl = params["MediaUrl0"] ?? "";

  if (!contentType || !mediaUrl) return null;

  // Audio (nota de voz)
  if (contentType.startsWith("audio/")) {
    try {
      const result = await transcribeAudio(mediaUrl, contentType, env);
      return { body: result.text, mediaType: "audio", mediaUrl, transcription: result.transcription };
    } catch (e: any) {
      return {
        body: "[Audio recibido — no se pudo transcribir]",
        mediaType: "audio",
        mediaUrl,
        transcription: "",
      };
    }
  }

  // Imagen (foto de referencia o del espacio)
  if (contentType.startsWith("image/")) {
    try {
      const result = await describeImage(mediaUrl, contentType, env);
      return { body: result.text, mediaType: "image", mediaUrl, transcription: result.transcription };
    } catch (e: any) {
      return {
        body: "[Imagen recibida]",
        mediaType: "image",
        mediaUrl,
        transcription: "",
      };
    }
  }

  // Video
  if (contentType.startsWith("video/")) {
    return {
      body: "[Video recibido — no proceso videos, pero puedo ayudarte si me describes lo que necesitas]",
      mediaType: "video",
      mediaUrl,
      transcription: "",
    };
  }

  // Documento / PDF
  if (contentType.startsWith("application/") || contentType.includes("pdf")) {
    return {
      body: "[Documento recibido — no puedo leer archivos, pero si me describes tu proyecto puedo orientarte]",
      mediaType: "document",
      mediaUrl,
      transcription: "",
    };
  }

  return null;
}

/**
 * Extrae ciudad de los params de ubicación de Twilio.
 * Twilio envía: Latitude, Longitude, Address, Label (solo si el usuario comparte ubicación).
 */
export function extractLocation(params: Record<string, string>): {
  body: string;
  city: string | null;
} | null {
  const lat = params["Latitude"];
  const lng = params["Longitude"];
  if (!lat || !lng) return null;

  const address = params["Address"] ?? params["Label"] ?? "";
  // Intentar extraer ciudad del address (ej. "Cll 5 #3-12, Fusagasugá, Cundinamarca, Colombia")
  let city: string | null = null;
  if (address) {
    const parts = address.split(",").map((p: string) => p.trim());
    // Heurística: la ciudad suele ser la segunda o tercera parte del address
    if (parts.length >= 2) city = parts[1] ?? parts[0];
  }

  return {
    body: `[Ubicación compartida${address ? `: ${address}` : ""}]`,
    city,
  };
}
