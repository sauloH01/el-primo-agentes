/**
 * types.ts — Contrato del agente de render + plano de EL PRIMO.
 */

export type TipoMueble =
  | "cocina"
  | "closet"
  | "bano"
  | "entretenimiento"
  | "estudio"
  | "puerta"
  | "lavadero"
  | "alacena"
  | "otro";

/** Lo que llega del cotizador o de una llamada directa. */
export interface RenderRequest {
  nombre: string;
  phone?: string;
  correo?: string;
  tipoMueble: TipoMueble;
  metros?: number; // metros lineales (cocina/puerta) o m² (closet)
  configuracion?: "L" | "U" | "lineal" | "isla" | "otra";
  colorPreferido?: string; // "blanco mate", "roble", "nogal", "gris"...
  ledIntegrado?: boolean;
  meson?: string; // "granito", "cuarzo", "sinterizado"
  descripcion?: string; // texto libre del cliente
}

export interface Env {
  Render: DurableObjectNamespace<import("./index").Render>;

  // Configs públicas
  OPENAI_IMAGE_MODEL: string; // "gpt-image-1"
  OWNER_EMAIL: string;
  FROM_EMAIL: string;
  IMAGE_SIZE: string; // "1536x1024" (horizontal) | "1024x1024"
  IMAGE_QUALITY: string; // "low" | "medium" | "high"

  // Secretos
  OPENAI_API_KEY: string;
  RESEND_API_KEY: string;
  RENDER_SECRET?: string; // valida quién puede llamar /generar
}
