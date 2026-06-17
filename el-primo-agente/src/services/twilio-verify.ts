// src/services/twilio-verify.ts
// Valida la firma X-Twilio-Signature para asegurar que el webhook
// viene realmente de Twilio (y no de un atacante).
// Algoritmo: HMAC-SHA1( authToken, URL + concat(sortedParams) ) → base64.
// https://www.twilio.com/docs/usage/security#validating-requests

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/**
 * @param url       URL completa a la que Twilio hizo POST (debe coincidir con la configurada en Twilio).
 * @param params    Pares clave/valor del cuerpo (application/x-www-form-urlencoded).
 * @param signature Valor del header X-Twilio-Signature.
 * @param authToken Auth Token de la cuenta Twilio (secreto).
 */
export async function isValidTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string | null,
  authToken: string
): Promise<boolean> {
  if (!signature || !authToken) return false;

  // URL + parámetros ordenados alfabéticamente y concatenados (clave seguida de valor).
  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const key of sortedKeys) data += key + params[key];

  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(data));
  const expected = bufferToBase64(sig);

  // Comparación en tiempo (casi) constante.
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}
