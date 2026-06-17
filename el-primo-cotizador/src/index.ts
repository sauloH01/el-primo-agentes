/**
 * index.ts — El "director" del agente cotizador de EL PRIMO.
 *
 * Rutas:
 *   GET  /             → ping (agente vivo)
 *   POST /notificar    → el calificador (el-primo-agente) avisa: "lead calificado, cotiza"
 *   POST /cotizar      → cotización directa (formulario web o prueba)
 *   GET  /leads        → historial resumido (sin datos sensibles)
 *
 * Flujo de /notificar y /cotizar:
 *   1. calcularCotizacion(lead)  → precio (código puro, NUNCA IA)
 *   2. generarContenido(...)     → OpenAI redacta prosa (sin precios)
 *   3. construirHtml + generarDocx (en paralelo)
 *   4. enviarCorreo a Audenar con el DOCX adjunto
 *   5. best-effort: notifica al closer (seguimiento) y al render (3D)
 *   6. guarda en el historial del Durable Object
 */
import { Agent, getAgentByName } from "agents";
import { calcularCotizacion as calcular, formatMillones as fmtMill } from "./pricing";
import { generarContenido, construirHtml } from "./quote";
import { generarDocx } from "./docx-quote";
import { enviarCorreo } from "./email";
import type { Lead, Env } from "./types";

type AgentState = {
  totalCotizaciones: number;
  leads: Array<{
    fecha: string;
    nombre: string;
    zona: string;
    tipos: string[];
    rango: string;
    ok: boolean;
    error?: string;
  }>;
};

const INITIAL_STATE: AgentState = { totalCotizaciones: 0, leads: [] };

export class Cotizador extends Agent<Env, AgentState> {
  initialState = INITIAL_STATE;

  async onRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      return new Response("ok — cotizador EL PRIMO vivo 🪵", { status: 200 });
    }

    // El calificador notifica un lead listo para cotizar (protegido con secret)
    if (req.method === "POST" && url.pathname === "/notificar") {
      const secret = req.headers.get("X-Secret") ?? "";
      if (this.env.COTIZADOR_SECRET && secret !== this.env.COTIZADOR_SECRET) {
        return new Response("Unauthorized", { status: 403 });
      }
      return this.cotizar(req);
    }

    // Cotización directa (formulario web)
    if (req.method === "POST" && url.pathname === "/cotizar") {
      return this.cotizar(req);
    }

    if (req.method === "GET" && url.pathname === "/leads") {
      return Response.json({
        total: this.state.totalCotizaciones,
        recientes: this.state.leads.slice(0, 15),
      });
    }

    return new Response("Ruta no encontrada", { status: 404 });
  }

  /** Recibe el lead, cotiza, genera con IA y envía el correo a Audenar. */
  async cotizar(req: Request): Promise<Response> {
    let lead: Lead;
    try {
      lead = (await req.json()) as Lead;
    } catch {
      return Response.json({ ok: false, error: "Datos del lead inválidos." }, { status: 400 });
    }

    if (!lead?.nombre || !lead?.telefono) {
      return Response.json({ ok: false, error: "Faltan nombre o teléfono." }, { status: 400 });
    }
    if (!lead.tiposMueble?.length) lead.tiposMueble = ["otro"];

    // 1) Precio con la guía fija (código, NUNCA IA)
    const cot = calcular(lead);

    const registro = {
      fecha: new Date().toISOString(),
      nombre: lead.nombre,
      zona: lead.zona || "",
      tipos: lead.tiposMueble,
      rango: `${fmtMill(cot.totalMin)} – ${fmtMill(cot.totalMax)}`,
      ok: false as boolean,
      error: undefined as string | undefined,
    };

    try {
      // 2) La IA redacta el texto profesional (sin precios)
      const contenido = await generarContenido(lead, cot, this.env.OPENAI_API_KEY, this.env.OPENAI_MODEL);

      // 3) HTML interno (Audenar) + DOCX para el cliente, en paralelo
      const [html, docxBuffer] = await Promise.all([
        Promise.resolve(construirHtml(lead, cot, contenido)),
        generarDocx(lead, cot, contenido),
      ]);

      const nombreArchivo = `Propuesta-ElPrimo-${(lead.nombre || "Cliente").replace(/[^a-zA-Z0-9]/g, "-")}-${new Date()
        .toISOString()
        .slice(0, 10)}.docx`;

      // 4) Correo a Audenar con el DOCX adjunto listo para reenviar
      const envio = await enviarCorreo({
        apiKey: this.env.RESEND_API_KEY,
        from: this.env.FROM_EMAIL,
        to: this.env.OWNER_EMAIL,
        subject: `📋 Cotización EL PRIMO — ${lead.nombre} (${lead.zona}) · ${registro.rango}`,
        html,
        replyTo: lead.correo,
        attachments: [{ filename: nombreArchivo, content: docxBuffer.toString("base64") }],
      });
      if (!envio.ok) throw new Error(envio.error || "No se pudo enviar el correo");
      registro.ok = true;

      // 5a) Best-effort: notificar al closer (seguimiento por WhatsApp)
      if (this.env.CLOSER_URL && this.env.CLOSER_SECRET && lead.telefono) {
        this.notificarCloser(lead, cot).catch(() => {});
      }
      // 5b) Best-effort: notificar al render (genera 3D + plano)
      if (this.env.RENDER_URL && this.env.RENDER_SECRET && lead.telefono) {
        this.notificarRender(lead).catch(() => {});
      }
    } catch (e) {
      registro.error = e instanceof Error ? e.message : String(e);
    }

    // 6) Guardar en el historial
    this.setState({
      totalCotizaciones: this.state.totalCotizaciones + (registro.ok ? 1 : 0),
      leads: [registro, ...this.state.leads].slice(0, 100),
    });

    if (!registro.ok) return Response.json({ ok: false, error: registro.error }, { status: 500 });
    return Response.json({ ok: true, rango: registro.rango });
  }

  private async notificarCloser(lead: Lead, cot: ReturnType<typeof calcular>): Promise<void> {
    await fetch(`${this.env.CLOSER_URL}/notificar`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Secret": this.env.CLOSER_SECRET! },
      body: JSON.stringify({
        phone: lead.telefono,
        nombre: lead.nombre,
        zona: lead.zona,
        tipos: lead.tiposMueble,
        totalMin: cot.totalMin,
        totalMax: cot.totalMax,
        diasEntrega: cot.diasEntrega,
        descripcion: lead.descripcion,
      }),
    });
  }

  private async notificarRender(lead: Lead): Promise<void> {
    await fetch(`${this.env.RENDER_URL}/generar`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Secret": this.env.RENDER_SECRET! },
      body: JSON.stringify({
        phone: lead.telefono,
        nombre: lead.nombre,
        tipoMueble: lead.tiposMueble[0],
        metros: lead.metros,
        configuracion: lead.configuracion,
        colorPreferido: lead.colorPreferido,
        ledIntegrado: lead.ledIntegrado,
        descripcion: lead.descripcion,
      }),
    });
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const agent = await getAgentByName(env.Cotizador, "default");
    return agent.fetch(req);
  },
};
