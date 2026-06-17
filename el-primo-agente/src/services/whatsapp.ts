// src/services/whatsapp.ts
// ⚠️ Usa fetch nativo de Cloudflare Workers — NO importar node-fetch

export class WhatsAppClient {
  private accountSid: string;
  private authToken: string;
  private senderNumber: string;

  constructor(env: {
    WHATSAPP_ACCOUNT_SID: string;
    WHATSAPP_AUTH_TOKEN: string;
    WHATSAPP_SENDER_NUMBER: string;
  }) {
    this.accountSid = env.WHATSAPP_ACCOUNT_SID;
    this.authToken = env.WHATSAPP_AUTH_TOKEN;
    this.senderNumber = env.WHATSAPP_SENDER_NUMBER;
  }

  async sendMessage(to: string, body: string): Promise<void> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    // Encode via TextEncoder → garantiza que btoa recibe bytes puros (0–255)
    // aunque el token tenga caracteres no-Latin1 por encoding del sistema.
    const cred = `${this.accountSid}:${this.authToken}`;
    const credBytes = new TextEncoder().encode(cred);
    let bin = "";
    for (let i = 0; i < credBytes.length; i++) bin += String.fromCharCode(credBytes[i]);
    const auth = btoa(bin);

    // Asegurar formato whatsapp: para Twilio
    const toFormatted = to.startsWith("+") ? to : `+${to}`;

    const payload = new URLSearchParams({
      To: `whatsapp:${toFormatted}`,
      From: `whatsapp:${this.senderNumber}`,
      Body: body,
    });

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: payload,
    });

    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`WhatsApp send failed: ${resp.status} ${txt}`);
    }
  }
}
