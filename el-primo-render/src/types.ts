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

/** Lo que llega del cotizador o del Render Studio del panel admin. */
export interface RenderRequest {
  nombre: string;
  phone?: string;
  correo?: string;
  tipoMueble: TipoMueble;
  metros?: number;
  configuracion?: "L" | "U" | "lineal" | "isla" | "otra";
  colorPreferido?: string;
  ledIntegrado?: boolean;
  meson?: string;
  descripcion?: string;
  material?: string;

  // Render Studio — personalizacion de Audenar
  ambiente?: string;         // "apartamento" | "casa" | "finca" | "loft" | "oficina"
  estilo?: string;           // "minimalista" | "moderno" | "contemporaneo" | "industrial" | "nordico" | "clasico"
  anguloCamara?: string;     // "3_4" | "frontal" | "lateral" | "perspectiva"
  iluminacion?: string;      // "dia" | "tarde" | "noche" | "estudio"
  colorPared?: string;       // "blanco calido" | "beige" | "gris paloma" | custom
  tipoPiso?: string;         // "porcelana_gris" | "madera" | "concreto" | "ceramica"
  sizeAmbiente?: string;     // "compacto" | "mediano" | "amplio"
  elementosExtra?: string[]; // ["plantas", "electrodomesticos", "decoracion", ...]
  noIncluir?: string;        // guia negativa — que evitar en la imagen
  promptExtra?: string;      // instrucciones libres finales
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
