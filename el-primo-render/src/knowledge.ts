/**
 * knowledge.ts — Prompt de render arquitectónico para gpt-image-1
 *
 * Objetivo: imágenes fotorrealistas de ALTA PRECISIÓN arquitectónica
 * que Audenar pueda revisar antes de enviar al cliente.
 *
 * Principios:
 *  1. Escena base consistente (paredes, piso, luz) → coherencia entre renders
 *  2. Especificación de cámara y perspectiva → composición profesional
 *  3. Detalle de materiales melamínicos Tablemac/Duratex → reconocibles
 *  4. Negaciones explícitas → evitar plástico barato, madera sólida, texto
 *  5. Cues de calidad → guían al modelo a resolución y detalle máximos
 */

import type { RenderRequest, TipoMueble } from "./types";

/* ─── Escena por tipo de mueble ─────────────────────────────────────────── */

const ESCENA: Record<TipoMueble, string> = {
  cocina: [
    "a full fitted kitchen (cocina integral) with melamine upper and lower cabinets,",
    "integrated appliances (refrigerator niche, range hood alcove, built-in oven column),",
    "continuous countertop, and backsplash tile in 60×30cm format.",
  ].join(" "),

  closet: [
    "a built-in walk-in wardrobe (closet vestier) with melamine modules:",
    "double-hang section (short + long), open shelves for folded garments,",
    "drawers with push-to-open mechanism, and integrated shoe shelf at bottom.",
  ].join(" "),

  bano: [
    "a bathroom vanity cabinet (mueble de baño) in moisture-resistant melamine,",
    "with undermount ceramic sink, chrome faucet, frameless mirror above,",
    "and toe-kick base.",
  ].join(" "),

  entretenimiento: [
    "a living-room entertainment wall unit (centro de entretenimiento) in melamine,",
    "with central TV niche (80-inch TV placeholder), flanking closed cabinets,",
    "floating open shelves for decor, and integrated cable management channel.",
  ].join(" "),

  estudio: [
    "a built-in home-office study wall (estudio / home office) in melamine,",
    "with a continuous desktop (1.8m), open bookshelf tower, lateral cabinet with doors,",
    "and monitor riser shelf.",
  ].join(" "),

  puerta: [
    "interior flush communication doors (puertas de comunicacion) in melamine,",
    "installed in a hallway with three consecutive doors showing consistent finish,",
    "brushed steel lever handles.",
  ].join(" "),

  lavadero: [
    "a laundry utility cabinet (mueble de lavadero) in moisture-resistant melamine,",
    "with stainless laundry sink on top, upper wall cabinet, and open shelf for detergent.",
  ].join(" "),

  alacena: [
    "a tall kitchen pantry cabinet (alacena) in melamine,",
    "with full-height doors, internal adjustable shelves visible through open door,",
    "matching the kitchen cabinetry finish.",
  ].join(" "),

  otro: [
    "custom fitted melamine furniture (mueble a medida) combining",
    "open shelves, closed cabinets with soft-close doors, and integrated handles.",
  ].join(" "),
};

/* ─── Config layouts ─────────────────────────────────────────────────────── */

const CONFIG: Record<string, string> = {
  L:      "arranged in an L-shape (two perpendicular walls with corner carousel unit)",
  U:      "arranged in a U-shape (three walls, maximizing perimeter storage)",
  lineal: "arranged in a single straight line along one wall",
  isla:   "with a freestanding island centered in the kitchen",
  otra:   "",
};

/* ─── Color / material → descripción precisa ────────────────────────────── */

function materialDesc(color?: string, material?: string): string {
  const mat = (material ?? "").toLowerCase();
  let finish = "flat matte finish with soft tactile texture";
  if (mat === "hpl")         finish = "high-pressure laminate (HPL), slightly textured surface with silk sheen";
  if (mat === "alto-brillo") finish = "high-gloss acrylic lacquer, mirror-like reflective surface";

  const c = (color ?? "").toLowerCase();
  let colorStr = "warm white (equivalent to RAL 9001) matte melamine fronts with light natural oak wood-grain accent panels";
  if (c.includes("blanco"))                             colorStr = "white matte melamine fronts (RAL 9016), clean and minimal";
  if (c.includes("roble") || c.includes("oak"))        colorStr = "light natural oak wood-grain melamine (Tablemac Roble Natural finish)";
  if (c.includes("nogal") || c.includes("walnut"))     colorStr = "dark walnut wood-grain melamine (Tablemac Nogal Americano finish)";
  if (c.includes("gris") || c.includes("gray") || c.includes("grey"))
                                                        colorStr = "soft warm grey matte melamine fronts (similar to RAL 7044)";
  if (c.includes("negro") || c.includes("black"))      colorStr = "matte black melamine fronts (RAL 9005), ultra-modern";
  if (c.includes("madera") || c.includes("wood"))      colorStr = "natural wood-grain melamine with realistic grain texture";
  if (color && !colorStr.toLowerCase().includes(c) && c.length > 2)
                                                        colorStr = `${color}-finish melamine fronts`;

  return `${colorStr} — ${finish}`;
}

/* ─── Mesón ──────────────────────────────────────────────────────────────── */

function mesonDesc(meson?: string): string {
  if (!meson || meson === "none") return "";
  const m: Record<string, string> = {
    granito:     ", dark grey granite countertop with polished surface and visible mineral veining",
    cuarzo:      ", white quartz countertop (Calacatta-style subtle veining), polished 20mm edge",
    sinterizado: ", large-format sintered stone countertop (concrete grey), 12mm ultra-thin edge",
  };
  return m[meson] ?? `, ${meson} countertop`;
}

/* ─── Escena base — igual en TODOS los renders de EL PRIMO ──────────────── */

const BASE_SCENE = [
  "ENVIRONMENT: Modern Colombian upper-middle-class home interior.",
  "Walls: smooth painted plaster in warm off-white (equivalent to Benjamin Moore White Dove).",
  "Floor: large-format light grey polished porcelain tile 90x90cm or light oak engineered wood parquet.",
  "Ceiling height: 2.6m, white, with recessed warm LED downlights (3000K).",
  "No clutter, no decorative objects, no food, minimal and clean staging.",
].join(" ");

const CAMERA = [
  "CAMERA SETUP: Architectural interior photography with 24mm wide-angle lens.",
  "Camera height: 1.1m (standing eye-level).",
  "Composition: 3/4 perspective showing the front face AND one side wall for spatial depth.",
  "Rule-of-thirds framing. Slight depth-of-field on far background.",
  "Absolutely no fish-eye distortion.",
].join(" ");

const LIGHTING = [
  "LIGHTING: Soft natural daylight from a large window to the left (5500K, diffused through sheer curtain).",
  "Fill light: warm LED ambient from ceiling (3000K). No harsh shadows, no blown highlights.",
  "Subtle specular reflection on cabinet fronts. Warm, welcoming, residential feel.",
  "LED strip under upper modules (if applicable) casts a warm glow on the countertop surface.",
].join(" ");

const QUALITY_CUES = [
  "RENDER QUALITY: Photorealistic 8K architectural visualization,",
  "equivalent to professional V-Ray or Corona Renderer output for a real architecture firm.",
  "Physically accurate materials: subsurface scattering, ray-traced ambient occlusion,",
  "accurate specular reflections on PVC edge banding and hardware.",
  "Ultra-precise hardware detail: hinges, handles, drawer runners, edge banding seams visible at close range.",
  "Cabinet alignment: pixel-perfect module gaps, consistent 2mm reveals between doors.",
  "NO text, NO watermark, NO logo, NO people, NO pets, NO cartoon style,",
  "NOT a sketch, NOT a line drawing, NOT a 3D wireframe, NOT an exterior shot.",
].join(" ");

const BRAND_NOTE = [
  "BRAND STANDARD EL PRIMO Carpinteria (Fusagasuga, Colombia):",
  "All cabinetry uses Tablemac or Duratex RH melamine boards exclusively.",
  "Visible construction precision: tight tolerances, perfect door alignment, flush drawer faces.",
  "NOT solid wood, NOT raw MDF, NOT laminate with visible bubbles, NOT exposed screws or staples.",
  "Premium Colombian craftsmanship aesthetic.",
].join(" ");

/* ─── Constructor del prompt ─────────────────────────────────────────────── */

export function construirPromptRender(r: RenderRequest): string {
  const escena   = ESCENA[r.tipoMueble] ?? ESCENA.otro;
  const config   = r.configuracion ? (CONFIG[r.configuracion] ?? "") : "";
  const colorMat = materialDesc(r.colorPreferido, r.material);
  const led      = r.ledIntegrado
    ? " Warm LED strip lighting (3000K) under upper modules with soft glow on countertop."
    : "";
  const meson    = mesonDesc(r.meson);
  const metros   = r.metros ? `Approximately ${r.metros} linear meters total.` : "";
  const detalle  = r.descripcion ? `CLIENT BRIEF: "${r.descripcion}".` : "";

  const subject = [
    `Ultra-realistic architectural interior render of ${escena}`,
    config ? config + "." : "",
    metros,
  ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

  const materials = [
    `MATERIALS: ${colorMat}${meson}.${led}`,
    "Cabinet interiors: white melamine lining.",
    "Handles: minimalist anodized aluminum bar handle or handleless push-to-open fronts.",
    "Edge banding: 1mm PVC exactly color-matched. Hardware: Blum soft-close hinges and full-extension drawer runners.",
  ].join(" ");

  const parts = [
    subject,
    "",
    materials,
    "",
    BASE_SCENE,
    "",
    CAMERA,
    "",
    LIGHTING,
    "",
    QUALITY_CUES,
    "",
    BRAND_NOTE,
  ];

  if (detalle) parts.push("", detalle);

  return parts.join("\n").trim();
}
