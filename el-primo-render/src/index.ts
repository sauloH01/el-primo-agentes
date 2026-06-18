/**
 * index.ts — El "director" del agente de render + plano de EL PRIMO.
 *
 * Rutas:
 *   GET  /           → ping (agente vivo)
 *   POST /preview    → (X-Secret) genera render+plano y los DEVUELVE como JSON (sin correo)
 *   POST /generar    → el cotizador notifica (X-Secret) → render + plano → correo a Audenar
 *   POST /render     → generación directa (prueba / formulario)
 *   GET  /historial  → resumen de lo generado
 *
 * Flujo /preview (panel):
 *   1. generarRender(req)   → gpt-image-1 (PNG base64)   [puede fallar → renderPng: null]
 *   2. generarPlanoSVG(req) → plano 2D acotado (SVG, código puro)
 *   3. Devuelve { ok, renderPng, planoSvg } — SIN correo, SIN historial
 */
import { Agent, getAgentByName } from "agents";
import { generarRender } from "./render";
import { generarPlanoSVG } from "./plano";
import { enviarRenderEmail } from "./email";
import type { RenderRequest, Env } from "./types";

type AgentState = {
  total: number;
  registros: Array<{ fecha: string; nombre: string; tipo: string; ok: boolean; renderOk: boolean; error?: string }>;
};

const INITIAL_STATE: AgentState = { total: 0, registros: [] };

export class Render extends Agent<Env, AgentState> {
  initialState = INITIAL_STATE;

  async onRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      return new Response("ok — render EL PRIMO vivo 🎨", { status: 200 });
    }

    if (req.method === "POST" && url.pathname === "/generar") {
      const secret = req.headers.get("X-Secret") ?? "";
      if (this.env.RENDER_SECRET && secret !== this.env.RENDER_SECRET) {
        return new Response("Unauthorized", { status: 403 });
      }
      return this.generar(req);
    }

    if (req.method === "POST" && url.pathname === "/render") {
      return this.generar(req);
    }

    if (req.method === "GET" && url.pathname === "/historial") {
      return Response.json({ total: this.state.total, recientes: this.state.registros.slice(0, 15) });
    }

    // POST /preview — genera render+plano y los DEVUELVE como JSON (sin correo ni historial)
    if (req.method === "POST" && url.pathname === "/preview") {
      const secret = req.headers.get("X-Secret") ?? "";
      if (this.env.RENDER_SECRET && secret !== this.env.RENDER_SECRET) {
        return new Response("Unauthorized", { status: 403 });
      }
      return this.preview(req);
    }

    return new Response("Ruta no encontrada", { status: 404 });
  }

  async preview(req: Request): Promise<Response> {
    let r: RenderRequest;
    try {
      r = (await req.json()) as RenderRequest;
    } catch {
      return Response.json({ ok: false, error: "Datos inválidos." }, { status: 400 });
    }
    if (!r?.nombre || !r?.tipoMueble) {
      return Response.json({ ok: false, error: "Faltan nombre o tipoMueble." }, { status: 400 });
    }

    const [render, planoSvg] = await Promise.all([
      generarRender(r, this.env).catch(() => ({ ok: false, base64: undefined, prompt: "", error: "Error al generar render" })),
      Promise.resolve(generarPlanoSVG(r)),
    ]);

    return Response.json({
      ok: true,
      renderPng: render.base64 ?? null,
      renderError: render.ok ? undefined : render.error,
      planoSvg,
    });
  }

  async generar(req: Request): Promise<Response> {
    let r: RenderRequest;
    try {
      r = (await req.json()) as RenderRequest;
    } catch {
      return Response.json({ ok: false, error: "Datos inválidos." }, { status: 400 });
    }
    if (!r?.nombre || !r?.tipoMueble) {
      return Response.json({ ok: false, error: "Faltan nombre o tipoMueble." }, { status: 400 });
    }

    const registro = {
      fecha: new Date().toISOString(),
      nombre: r.nombre,
      tipo: r.tipoMueble,
      ok: false as boolean,
      renderOk: false as boolean,
      error: undefined as string | undefined,
    };

    try {
      // 1) Render IA (puede fallar; no rompe el flujo) + 2) Plano SVG (código puro)
      const render = await generarRender(r, this.env);
      registro.renderOk = render.ok;
      const svg = generarPlanoSVG(r);

      // 3) Correo a Audenar con ambos adjuntos
      const envio = await enviarRenderEmail({
        apiKey: this.env.RESEND_API_KEY,
        from: this.env.FROM_EMAIL,
        to: this.env.OWNER_EMAIL,
        r,
        renderB64: render.base64,
        svg,
        prompt: render.prompt,
        renderError: render.error,
      });
      if (!envio.ok) throw new Error(envio.error || "No se pudo enviar el correo");
      registro.ok = true;
    } catch (e) {
      registro.error = e instanceof Error ? e.message : String(e);
    }

    // 4) Historial
    this.setState({
      total: this.state.total + (registro.ok ? 1 : 0),
      registros: [registro, ...this.state.registros].slice(0, 100),
    });

    if (!registro.ok) return Response.json({ ok: false, error: registro.error }, { status: 500 });
    return Response.json({ ok: true, renderOk: registro.renderOk });
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const agent = await getAgentByName(env.Render, "default");
    return agent.fetch(req);
  },
};
