/**
 * knowledge.ts — Construye el prompt fotorrealista para gpt-image-1
 * a partir de los datos del proyecto de carpintería.
 *
 * El render es CONCEPTUAL (para enamorar al cliente y acelerar la venta).
 * El 3D técnico final lo hace Audenar en SketchUp tras la visita.
 */
import type { RenderRequest, TipoMueble } from "./types";

const ESCENA: Record<TipoMueble, string> = {
  cocina:
    "a modern fitted kitchen (cocina integral) with melamine cabinets, upper and lower modules, realistic countertop and backsplash",
  closet:
    "a built-in wardrobe / walk-in closet (closet vestier) with melamine modules, hanging sections, drawers and shelves",
  bano: "a bathroom vanity (mueble de baño) in moisture-resistant melamine, with sink and mirror",
  entretenimiento:
    "a living-room TV entertainment center (centro de entretenimiento) in melamine, with floating shelves and cable management",
  estudio: "a built-in home-office study desk (estudio / home office) in melamine, with shelving and storage",
  puerta: "interior melamine doors (puertas de comunicación) in a clean hallway",
  lavadero: "a laundry utility cabinet (mueble de lavadero) in moisture-resistant melamine, with sink",
  alacena: "a kitchen pantry cabinet (alacena) in melamine, with shelves behind doors",
  otro: "custom fitted melamine furniture (mueble a medida)",
};

const CONFIG: Record<string, string> = {
  L: "in an L-shaped layout",
  U: "in a U-shaped layout",
  lineal: "in a single straight (linear) layout along one wall",
  isla: "with a central island",
  otra: "",
};

/** Traduce el color preferido a inglés visual para el prompt. */
function colorEN(color?: string): string {
  if (!color) return "warm white matte fronts with light oak wood accents";
  const c = color.toLowerCase();
  if (c.includes("blanco")) return "white matte fronts";
  if (c.includes("roble") || c.includes("oak")) return "light oak wood-grain fronts";
  if (c.includes("nogal") || c.includes("walnut")) return "dark walnut wood-grain fronts";
  if (c.includes("gris") || c.includes("gray") || c.includes("grey")) return "soft grey matte fronts";
  if (c.includes("negro") || c.includes("black")) return "matte black fronts";
  if (c.includes("madera") || c.includes("wood")) return "natural wood-grain fronts";
  return `${color} fronts`;
}

export function construirPromptRender(r: RenderRequest): string {
  const escena = ESCENA[r.tipoMueble] ?? ESCENA.otro;
  const config = r.configuracion ? CONFIG[r.configuracion] ?? "" : "";
  const color = colorEN(r.colorPreferido);
  const led = r.ledIntegrado ? ", warm LED strip lighting under the upper modules" : "";
  const meson = r.meson ? `, ${r.meson} countertop` : "";
  const metros = r.metros ? ` approximately ${r.metros} meters` : "";
  const detalle = r.descripcion ? ` Client notes: ${r.descripcion}.` : "";

  return `Photorealistic interior design render of ${escena} ${config}${metros}.
Finish: ${color}${meson}${led}. Soft-close handleless or slim-handle modules, termo-sealed edges, premium melamine look (Tablemac/Duratex style), NOT solid wood, NOT MDF visible.
Lighting: bright natural daylight, warm and inviting, realistic shadows and reflections.
Style: clean, contemporary Colombian home, professional architectural visualization, 3D render quality, ultra detailed, no text, no people, no watermark, no logos.`.trim();
}
