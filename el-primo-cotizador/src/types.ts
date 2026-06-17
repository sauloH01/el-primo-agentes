/**
 * types.ts — El contrato central del cotizador de EL PRIMO.
 *
 * ⚠️ Cambiar un campo aquí = revisar pricing.ts Y el formulario al mismo tiempo.
 * Este tipo `Lead` es lo que llega del agente calificador (WhatsApp) o del
 * formulario web. El cotizador lo convierte en una propuesta formal.
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

// Material: EL PRIMO solo trabaja melamina RH; el tier sube por acabado.
export type MaterialTier = "rh" | "alto-brillo" | "hpl";
export type TipoMeson = "granito" | "cuarzo" | "sinterizado" | "ninguno";

export interface Lead {
  // Datos básicos (del calificador o del formulario web)
  nombre: string;
  telefono: string; // dígitos con código país, ej: 573001112233
  correo?: string;
  zona: string; // "Fusagasugá" | "Chinauta" | "La Mesa" | ...

  // Proyecto
  tiposMueble: TipoMueble[]; // puede ser múltiple: ["cocina", "closet"]
  descripcion?: string; // lo que el cliente escribió libremente

  // Datos técnicos (los recoge el calificador o el formulario)
  metros?: number;
  configuracion?: "L" | "U" | "lineal" | "isla" | "otra";
  material?: MaterialTier;
  meson?: TipoMeson;
  ledIntegrado?: boolean;
  colorPreferido?: string;

  // Meta
  presupuestoCliente?: string; // rango que mencionó el cliente
  urgencia?: "inmediato" | "1mes" | "3meses" | "sin-prisa";
  fuenteLead?: "whatsapp-agente" | "formulario-web" | "directo";
  leadId?: string; // ID en D1 del agente calificador
}

export interface QuoteItem {
  tipo: TipoMueble;
  descripcion: string;
  precioMin: number;
  precioMax: number;
}

export interface ResultadoCotizacion {
  items: QuoteItem[];
  subtotalMin: number;
  subtotalMax: number;
  descuentoCombo: number; // si hay más de 1 tipo de mueble
  viaticos: number; // desplazamiento fuera de Fusagasugá (descontable si contrata)
  totalMin: number;
  totalMax: number;
  diasEntrega: number;
  incluyeDesplazamiento: boolean;
  moneda: "COP";
  notas: string[];
}

export interface ContenidoIA {
  titulo: string; // ej: "Propuesta para la cocina de María García"
  entendimiento: string; // párrafo: qué entendimos del proyecto
  entregables: string[]; // lista de lo que incluye (6-10)
  cierre: string; // párrafo: llamada a acción
}

// Variables del Worker
export interface Env {
  Cotizador: DurableObjectNamespace<import("./index").Cotizador>;

  // Configs públicas (wrangler.jsonc → vars)
  OPENAI_MODEL: string;
  OWNER_EMAIL: string;
  FROM_EMAIL: string;
  AUDENAR_WHATSAPP: string; // solo dígitos, ej: 573223306682

  // Secretos (wrangler secret put)
  OPENAI_API_KEY: string;
  RESEND_API_KEY: string;

  // Integración con el closer (opcional — si no está, se ignora)
  CLOSER_URL?: string;
  CLOSER_SECRET?: string;
  // Quién puede llamar a /notificar (el calificador). Si está vacío, no se exige.
  COTIZADOR_SECRET?: string;

  // Integración con el render (opcional)
  RENDER_URL?: string;
  RENDER_SECRET?: string;
}
