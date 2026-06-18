/**
 * conversation.ts — Durable Object: memoria + máquina de seguimiento por lead.
 *
 * Cada número de teléfono tiene su propio DO (key = número limpio).
 * Guarda el historial, el estado del cierre, y orquesta una SECUENCIA DE
 * SEGUIMIENTO proactiva (4 toques) que persigue al lead hasta cerrar, transferir,
 * o pasárselo a Audenar como lead frío.
 *
 * Secuencia (se aplaza sola si el lead está conversando):
 *   Toque 1 → +24 h   (recordatorio suave)
 *   Toque 2 → +48 h   (prueba social)
 *   Toque 3 → +3 días (urgencia: cupo limitado)
 *   Toque 4 → +6 días (reactivación final)
 *   +2 días después → avisa a Audenar "lead frío"
 *
 * Rutas internas (llamadas desde index.ts):
 *   POST /process-message → texto/voz de WhatsApp entrante
 *   POST /set-context     → el cotizador notifica contexto + manda bienvenida
 *   POST /admin           → instrucción manual
 *   POST /reset           → borra memoria
 *   GET  /state           → estado completo
 */
import { Agent } from "agents";
import { generarRespuestaChat } from "./ai-chat";
import { enviarMensajeWA } from "./twilio";
import { notificarAudenar } from "./notify";
import { FOLLOWUPS, COLD_NOTIFY_DELAY_SEC, mensajeBienvenida } from "./knowledge";
import type { Env } from "./index";

type Mensaje = { role: "user" | "assistant"; content: string };

type ConversationState = {
  phone: string;
  leadName: string;
  messages: Mensaje[];
  cotizacionContext: string;
  startedAt: string;
  lastInboundAt: string;
  lastOutboundAt: string;
  messageCount: number;
  closed: boolean;
  notified: boolean;
  followUpStep: number;
  followUpScheduleId: string;
  coldNotified: boolean;
  paused: boolean;
  customToques: string[] | null; // null = usar FOLLOWUPS por defecto
};

const INITIAL: ConversationState = {
  phone: "",
  leadName: "amigo",
  messages: [],
  cotizacionContext: "",
  startedAt: "",
  lastInboundAt: "",
  lastOutboundAt: "",
  messageCount: 0,
  closed: false,
  notified: false,
  followUpStep: 0,
  followUpScheduleId: "",
  coldNotified: false,
  paused: false,
  customToques: null,
};

export class Conversation extends Agent<Env, ConversationState> {
  initialState = INITIAL;

  async onRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "POST" && url.pathname === "/process-message") return this.procesarMensaje(req);
    if (req.method === "POST" && url.pathname === "/set-context") return this.setContexto(req);
    if (req.method === "POST" && url.pathname === "/admin") return this.adminInstruccion(req);
    if (req.method === "POST" && url.pathname === "/admin/pausar") return this.adminPausar();
    if (req.method === "POST" && url.pathname === "/admin/reanudar") return this.adminReanudar();
    if (req.method === "POST" && url.pathname === "/admin/toque-manual") return this.adminToqueManual();
    if (req.method === "POST" && url.pathname === "/admin/editar-toques") return this.adminEditarToques(req);
    if (req.method === "POST" && url.pathname === "/reset") return this.reset();
    if (req.method === "GET" && url.pathname === "/state") return Response.json(this.state);
    return new Response("ok", { status: 200 });
  }

  private async reset(): Promise<Response> {
    if (this.state.followUpScheduleId) {
      try {
        await this.cancelSchedule(this.state.followUpScheduleId);
      } catch {
        /* noop */
      }
    }
    this.setState({ ...INITIAL });
    return Response.json({ ok: true });
  }

  // ── Mensaje de texto/voz entrante ─────────────────────────────────────────
  private async procesarMensaje(req: Request): Promise<Response> {
    const { body, profileName, phone } = await req.json<{ body: string; profileName: string; phone: string }>();

    if (this.state.closed) {
      return Response.json({
        respuesta: "¡Ya le avisé a Audenar! Te contacta muy pronto para coordinar todo 🙌",
      });
    }

    const now = new Date().toISOString();
    this.setState({
      ...this.state,
      phone: this.state.phone || phone,
      leadName: this.state.leadName === "amigo" && profileName ? profileName : this.state.leadName,
      startedAt: this.state.startedAt || now,
      lastInboundAt: now,
    });

    const messages: Mensaje[] = [...this.state.messages, { role: "user" as const, content: body }];
    const [respuesta, cerrado, transferir] = await generarRespuestaChat(
      messages,
      this.env.OPENAI_API_KEY,
      this.env.OPENAI_MODEL,
      this.state.cotizacionContext || undefined
    );

    this.setState({
      ...this.state,
      messages: [...messages, { role: "assistant" as const, content: respuesta }].slice(-30),
      messageCount: this.state.messageCount + 1,
      lastOutboundAt: new Date().toISOString(),
      closed: cerrado,
    });

    if ((cerrado || transferir) && !this.state.notified) {
      await this.notificar(transferir ? "transferir" : "cierre");
    }
    await this.programarSiguienteFollowUp();

    return Response.json({ respuesta });
  }

  // ── El cotizador notifica un lead + se manda la bienvenida ────────────────
  private async setContexto(req: Request): Promise<Response> {
    const data = await req.json<{
      phone: string;
      nombre: string;
      zona?: string;
      tipos?: string[];
      totalMin?: number;
      totalMax?: number;
      diasEntrega?: number;
      descripcion?: string;
    }>();

    const fmt = (n?: number) => (n ? `$${(n / 1_000_000).toFixed(1).replace(".0", "")}M` : "");
    const contexto = [
      `Nombre: ${data.nombre}`,
      data.zona ? `Zona: ${data.zona}` : "",
      data.tipos?.length ? `Proyecto: ${data.tipos.join(", ")}` : "",
      data.totalMin && data.totalMax ? `Rango cotizado: ${fmt(data.totalMin)}–${fmt(data.totalMax)} COP` : "",
      data.diasEntrega ? `Entrega: ${data.diasEntrega} días` : "",
      data.descripcion ? `Detalle: ${data.descripcion}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const now = new Date().toISOString();
    this.setState({
      ...this.state,
      phone: this.state.phone || data.phone,
      leadName: data.nombre || this.state.leadName,
      cotizacionContext: contexto,
      startedAt: this.state.startedAt || now,
      followUpStep: 0,
      coldNotified: false,
    });

    // Primer mensaje proactivo (no afirma que ya envió nada)
    const primer = mensajeBienvenida(this.firstName());
    const enviado = await enviarMensajeWA(
      this.env.TWILIO_ACCOUNT_SID,
      this.env.TWILIO_AUTH_TOKEN,
      this.env.TWILIO_WHATSAPP_FROM,
      data.phone,
      primer
    );
    if (enviado) {
      this.setState({
        ...this.state,
        messages: [...this.state.messages, { role: "assistant" as const, content: primer }].slice(-30),
        lastOutboundAt: now,
      });
    }

    await this.programarSiguienteFollowUp();
    return Response.json({ ok: true, enviado });
  }

  private async adminInstruccion(req: Request): Promise<Response> {
    const { instruccion } = await req.json<{ instruccion: string }>();
    this.setState({
      ...this.state,
      messages: [...this.state.messages, { role: "assistant" as const, content: `[Instrucción de Audenar: ${instruccion}]` }],
    });
    return Response.json({ ok: true });
  }

  private async adminPausar(): Promise<Response> {
    if (this.state.followUpScheduleId) {
      try { await this.cancelSchedule(this.state.followUpScheduleId); } catch {}
    }
    this.setState({ ...this.state, paused: true, followUpScheduleId: "" });
    await this.pushCloserEvent("pausado");
    return Response.json({ ok: true });
  }

  private async adminReanudar(): Promise<Response> {
    this.setState({ ...this.state, paused: false });
    await this.programarSiguienteFollowUp();
    await this.pushCloserEvent("reanudado");
    return Response.json({ ok: true });
  }

  private async adminToqueManual(): Promise<Response> {
    const pausedBefore = this.state.paused;
    // Despausa temporalmente para ejecutar el toque
    if (pausedBefore) this.setState({ ...this.state, paused: false });
    await this.ejecutarFollowUp();
    await this.pushCloserEvent("toque_manual");
    return Response.json({ ok: true });
  }

  private async adminEditarToques(req: Request): Promise<Response> {
    const body = await req.json<{ toques: string[] }>();
    if (!Array.isArray(body.toques) || body.toques.length === 0) {
      return Response.json({ ok: false, error: "toques requeridos" }, { status: 400 });
    }
    this.setState({ ...this.state, customToques: body.toques });
    return Response.json({ ok: true });
  }

  private async pushCloserEvent(tipo: string): Promise<void> {
    if (!this.env.AGENTE_URL) return;
    try {
      await fetch(`${this.env.AGENTE_URL}/api/closer-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Secret": this.env.CLOSER_SECRET },
        body: JSON.stringify({
          phone: this.state.phone,
          tipo,
          leadName: this.state.leadName,
          closed: this.state.closed,
          paused: this.state.paused ?? false,
          followUpStep: this.state.followUpStep,
          coldNotified: this.state.coldNotified,
          lastOutboundAt: this.state.lastOutboundAt,
        }),
        signal: AbortSignal.timeout(5000),
      });
    } catch {}
  }

  // ── Callback de seguimiento (lo dispara this.schedule) ────────────────────
  async ejecutarFollowUp(): Promise<void> {
    if (this.state.closed || !this.state.phone || this.state.paused) return;

    if (this.state.followUpStep < FOLLOWUPS.length) {
      const texto =
        this.state.customToques?.[this.state.followUpStep] ??
        FOLLOWUPS[this.state.followUpStep].build(this.firstName());
      await enviarMensajeWA(
        this.env.TWILIO_ACCOUNT_SID,
        this.env.TWILIO_AUTH_TOKEN,
        this.env.TWILIO_WHATSAPP_FROM,
        this.state.phone,
        texto
      );
      this.setState({
        ...this.state,
        messages: [...this.state.messages, { role: "assistant" as const, content: texto }].slice(-30),
        followUpStep: this.state.followUpStep + 1,
        lastOutboundAt: new Date().toISOString(),
      });
      await this.programarSiguienteFollowUp();
      return;
    }

    if (!this.state.coldNotified) {
      this.setState({ ...this.state, coldNotified: true, followUpScheduleId: "" });
      await this.notificar("frio");
    }
  }

  private async programarSiguienteFollowUp(): Promise<void> {
    if (this.state.followUpScheduleId) {
      try {
        await this.cancelSchedule(this.state.followUpScheduleId);
      } catch {
        /* ya disparó o no existe */
      }
    }
    if (this.state.closed) {
      this.setState({ ...this.state, followUpScheduleId: "" });
      return;
    }

    let delaySec: number;
    if (this.state.followUpStep < FOLLOWUPS.length) {
      delaySec = FOLLOWUPS[this.state.followUpStep].delaySec;
    } else if (!this.state.coldNotified) {
      delaySec = COLD_NOTIFY_DELAY_SEC;
    } else {
      this.setState({ ...this.state, followUpScheduleId: "" });
      return;
    }

    const sched = await this.schedule(delaySec, "ejecutarFollowUp");
    this.setState({ ...this.state, followUpScheduleId: sched.id });
  }

  private async notificar(motivo: "cierre" | "transferir" | "frio"): Promise<void> {
    if (motivo !== "frio") this.setState({ ...this.state, notified: true });
    if (this.state.followUpScheduleId) {
      try {
        await this.cancelSchedule(this.state.followUpScheduleId);
      } catch {
        /* noop */
      }
      this.setState({ ...this.state, followUpScheduleId: "" });
    }
    await notificarAudenar({
      accountSid: this.env.TWILIO_ACCOUNT_SID,
      authToken: this.env.TWILIO_AUTH_TOKEN,
      whatsappFrom: this.env.TWILIO_WHATSAPP_FROM,
      audenarWhatsapp: this.env.AUDENAR_WHATSAPP,
      resendApiKey: this.env.RESEND_API_KEY,
      ownerEmail: this.env.OWNER_EMAIL,
      fromEmail: this.env.FROM_EMAIL,
      leadName: this.state.leadName,
      phone: this.state.phone,
      motivo,
      messages: this.state.messages.slice(-6),
      contexto: this.state.cotizacionContext,
    });
    await this.pushCloserEvent(motivo);
  }

  private firstName(): string {
    return (this.state.leadName || "amigo").trim().split(/\s+/)[0] || "amigo";
  }
}
