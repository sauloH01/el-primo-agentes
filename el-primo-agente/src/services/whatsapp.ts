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
    const auth = btoa(`${this.accountSid}:${this.authToken}`);

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
