/**
 * transcribe.ts — Transcribe notas de voz de WhatsApp con OpenAI Whisper.
 */

export async function transcribirAudio(
  buffer: ArrayBuffer,
  contentType: string,
  apiKey: string
): Promise<string> {
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

  const resp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!resp.ok) throw new Error(`Whisper error: ${await resp.text()}`);
  return (await resp.text()).trim();
}
