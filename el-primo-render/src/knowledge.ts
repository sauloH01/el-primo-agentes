/**
 * knowledge.ts — Prompt arquitectonico de alta precision para gpt-image-1
 *
 * Usa todos los campos del RenderRequest (incluidos los del Render Studio)
 * para construir un prompt ultra-detallado y consistente.
 */
import type { RenderRequest, TipoMueble } from "./types";

/* ─── Escena por tipo de mueble ──────────────────────────────────────────── */

const ESCENA: Record<TipoMueble, string> = {
  cocina: "a full fitted kitchen (cocina integral) with melamine upper and lower cabinets, integrated appliances (refrigerator niche, range hood alcove, built-in oven column), continuous countertop, and backsplash tile",
  closet: "a built-in walk-in wardrobe (closet vestier) with melamine modules: double-hang section (short + long), open shelves, drawers with push-to-open, integrated shoe shelf at bottom",
  bano: "a bathroom vanity cabinet (mueble de bano) in moisture-resistant melamine, with undermount ceramic sink, chrome faucet, frameless mirror above, and toe-kick base",
  entretenimiento: "a living-room entertainment wall unit (centro de entretenimiento) in melamine, with central TV niche (80-inch TV placeholder), flanking closed cabinets, floating open shelves, and integrated cable management",
  estudio: "a built-in home-office study wall (estudio / home office) in melamine with continuous desktop (1.8m), open bookshelf tower, lateral cabinet with doors, and monitor riser shelf",
  puerta: "interior flush communication doors (puertas de comunicacion) in melamine, installed in a hallway with three consecutive doors showing consistent finish and brushed steel lever handles",
  lavadero: "a laundry utility cabinet (mueble de lavadero) in moisture-resistant melamine with stainless laundry sink on top, upper wall cabinet, and open shelf for detergent",
  alacena: "a tall kitchen pantry cabinet (alacena) in melamine with full-height doors and internal adjustable shelves visible through open door, matching kitchen cabinetry finish",
  otro: "custom fitted melamine furniture (mueble a medida) combining open shelves, closed cabinets with soft-close doors, and integrated handles",
};

/* ─── Config layouts ─────────────────────────────────────────────────────── */

const CONFIG: Record<string, string> = {
  L:      "arranged in an L-shape (two perpendicular walls with corner carousel unit)",
  U:      "arranged in a U-shape (three walls, maximizing perimeter storage)",
  lineal: "arranged in a single straight line along one wall",
  isla:   "with a freestanding island centered in the kitchen",
  otra:   "",
};

/* ─── Material / acabado ──────────────────────────────────────────────────── */

function materialDesc(color?: string, material?: string): string {
  const mat = (material ?? "").toLowerCase();
  let finish = "flat matte finish with soft tactile texture";
  if (mat === "hpl")         finish = "high-pressure laminate (HPL), slightly textured surface with silk sheen";
  if (mat === "alto-brillo") finish = "high-gloss acrylic lacquer, mirror-like reflective surface, ultra modern";

  const c = (color ?? "").toLowerCase();
  let colorStr = "warm white (RAL 9001) matte melamine fronts with light natural oak wood-grain accent panels";
  if (c.includes("blanco"))                              colorStr = "white matte melamine fronts (RAL 9016)";
  else if (c.includes("roble") || c.includes("oak"))    colorStr = "light natural oak wood-grain melamine (Tablemac Roble Natural)";
  else if (c.includes("nogal") || c.includes("walnut")) colorStr = "dark walnut wood-grain melamine (Tablemac Nogal Americano)";
  else if (c.includes("gris") || c.includes("gray") || c.includes("grey"))
                                                         colorStr = "soft warm grey matte melamine (similar to RAL 7044)";
  else if (c.includes("negro") || c.includes("black"))  colorStr = "matte black melamine fronts (RAL 9005), ultra-modern";
  else if (c.includes("madera") || c.includes("wood"))  colorStr = "natural wood-grain melamine with realistic grain texture";
  else if (color && c.length > 2)                        colorStr = `${color}-finish melamine fronts`;

  return `${colorStr} — ${finish}`;
}

/* ─── Meson ──────────────────────────────────────────────────────────────── */

function mesonDesc(meson?: string): string {
  if (!meson || meson === "none") return "";
  const m: Record<string, string> = {
    granito:     ", dark grey granite countertop (polished, visible mineral veining)",
    cuarzo:      ", white quartz countertop (Calacatta-style veining, polished 20mm edge)",
    sinterizado: ", large-format sintered stone countertop (concrete grey, 12mm ultra-thin edge)",
  };
  return m[meson] ?? `, ${meson} countertop`;
}

/* ─── Ambiente ────────────────────────────────────────────────────────────── */

const AMBIENTE: Record<string, string> = {
  apartamento: "in a modern Colombian apartment (Fusagasuga or Bogota style), compact and well-optimized space",
  casa:        "in a spacious Colombian house with generous ceiling height and natural light",
  finca:       "in a Colombian countryside finca (rural property), warm and welcoming interior with natural wood accents in the architecture",
  loft:        "in an open-concept urban loft with exposed concrete ceiling and industrial accents",
  oficina:     "in a professional office or home-office environment, clean and functional",
};

/* ─── Estilo ──────────────────────────────────────────────────────────────── */

const ESTILO: Record<string, string> = {
  minimalista:    "Aesthetic: ultra-minimalist. Clean lines, no ornamentation, monochromatic palette, maximum empty space.",
  moderno:        "Aesthetic: contemporary modern. Sleek surfaces, geometric forms, warm neutrals, sophisticated feel.",
  contemporaneo:  "Aesthetic: contemporary. Mix of materials, subtle texture contrast, balanced and inviting.",
  industrial:     "Aesthetic: industrial-modern. Exposed concrete accents, dark metal details, raw textures mixed with clean melamine.",
  nordico:        "Aesthetic: Scandinavian / Nordic. White and natural wood tones, cozy (hygge) atmosphere, warm textiles in background.",
  clasico:        "Aesthetic: transitional classic. Shaker-style door profiles (or soft arch), neutral warm palette, timeless elegance.",
};

/* ─── Camara ──────────────────────────────────────────────────────────────── */

const CAMARA: Record<string, string> = {
  "3_4":       "CAMERA: 24mm wide-angle architectural lens. 3/4 perspective showing front face AND one side wall for spatial depth. Camera height: 1.1m (standing eye-level). Rule-of-thirds framing. Slight depth-of-field blur on background.",
  frontal:     "CAMERA: 50mm standard lens. Dead-center frontal elevation shot, symmetric composition. Camera height: 0.9m. Perfect for showcasing door panel design.",
  lateral:     "CAMERA: 35mm lens. Side perspective (90-degree view) showing depth of the space and modules from the side. Camera height: 1.2m.",
  perspectiva: "CAMERA: 16mm ultra-wide angle. Dramatic wide perspective showing the full room context, furniture in environment. Camera height: 1.4m, slight high-angle.",
};

/* ─── Iluminacion ────────────────────────────────────────────────────────── */

const ILUMINACION: Record<string, string> = {
  dia:     "LIGHTING: Bright natural daylight from large windows (5500K, overcast-soft). Even, shadowless ambient. Realistic daytime residential feel.",
  tarde:   "LIGHTING: Golden hour afternoon light (3200K, warm raking light from left window creating long soft shadows). Warm, cinematic, cozy atmosphere.",
  noche:   "LIGHTING: Evening interior lighting only. Warm LED downlights (2700K), LED strips under cabinets glowing amber. No natural light. Intimate and luxurious.",
  estudio: "LIGHTING: Professional architectural photography lighting setup. Balanced studio-quality light, no harsh shadows, even illumination on all cabinet surfaces.",
};

/* ─── Piso ────────────────────────────────────────────────────────────────── */

const PISO: Record<string, string> = {
  porcelana_gris: "large-format light grey polished porcelain tile 90x90cm",
  madera:         "light oak engineered wood parquet in herringbone pattern",
  concreto:       "polished micro-cement concrete floor in warm grey tone",
  ceramica:       "classic white ceramic floor tile 60x60cm with thin grout lines",
};

/* ─── Color de pared ──────────────────────────────────────────────────────── */

function colorParedDesc(cp?: string): string {
  if (!cp) return "warm off-white walls (Benjamin Moore White Dove equivalent)";
  const presets: Record<string, string> = {
    "blanco calido": "warm off-white walls (Benjamin Moore White Dove equivalent, soft cream undertone)",
    "beige":         "warm beige walls (SW Accessible Beige equivalent, sandy earth tone)",
    "gris paloma":   "soft grey walls (Agreeable Gray SW 7029 equivalent, warm light grey)",
    "gris oscuro":   "deep charcoal grey accent wall behind furniture (complementing the cabinetry)",
    "verde salvia":  "sage green walls (muted, dusty green undertone, organic feel)",
    "azul polvos":   "soft powder blue walls (muted blue-grey, serene and sophisticated)",
  };
  return presets[cp.toLowerCase()] ?? `${cp} painted walls`;
}

/* ─── Elementos extra ─────────────────────────────────────────────────────── */

const EXTRA_DESC: Record<string, string> = {
  plantas:          "one or two simple green plants in minimal pots on the floor or counter",
  electrodomesticos: "stainless steel kitchen appliances (coffee machine, microwave) visible on counter",
  decoracion:       "minimal tasteful decor items (a bowl, a small sculpture) on open shelves",
  libros:           "books and small decorative objects arranged on open shelving sections",
  espejo:           "a large decorative framed mirror on an adjacent wall",
  flores:           "a small vase with fresh flowers on the countertop",
  lampara:          "a stylish pendant lamp or floor lamp providing accent lighting",
  canasta:          "woven storage baskets on lower open shelves",
};

/* ─── Tamaño del ambiente ─────────────────────────────────────────────────── */

const SIZE_AMBIENTE: Record<string, string> = {
  compacto: "The space is compact and efficiently designed (under 8m2), smart storage solutions visible.",
  mediano:  "The space is medium-sized (8-15m2), comfortable proportions, well-balanced layout.",
  amplio:   "The space is spacious and generous (over 15m2), open and airy feel with room to breathe.",
};

/* ─── Constructor principal ──────────────────────────────────────────────── */

export function construirPromptRender(r: RenderRequest): string {
  const escena    = ESCENA[r.tipoMueble] ?? ESCENA.otro;
  const config    = r.configuracion ? (CONFIG[r.configuracion] ?? "") : "";
  const colorMat  = materialDesc(r.colorPreferido, r.material);
  const meson     = mesonDesc(r.meson);
  const led       = r.ledIntegrado ? " Warm LED strip lighting (3000K) under upper modules with soft glow on countertop." : "";
  const metros    = r.metros ? `Approximately ${r.metros} linear meters total.` : "";
  const detalle   = r.descripcion ? `CLIENT BRIEF: "${r.descripcion}".` : "";

  // Render Studio overrides
  const ambienteDesc = AMBIENTE[r.ambiente ?? "apartamento"] ?? AMBIENTE.apartamento;
  const estiloDesc   = ESTILO[r.estilo ?? "moderno"] ?? ESTILO.moderno;
  const camaraDesc   = CAMARA[r.anguloCamara ?? "3_4"] ?? CAMARA["3_4"];
  const luzDesc      = ILUMINACION[r.iluminacion ?? "dia"] ?? ILUMINACION.dia;
  const pisoDesc     = PISO[r.tipoPiso ?? "porcelana_gris"] ?? PISO.porcelana_gris;
  const paredDesc    = colorParedDesc(r.colorPared);
  const sizeDesc     = SIZE_AMBIENTE[r.sizeAmbiente ?? "mediano"] ?? SIZE_AMBIENTE.mediano;

  const extras = (r.elementosExtra ?? [])
    .map(e => EXTRA_DESC[e])
    .filter(Boolean)
    .join(", ");

  const subject = [
    `Ultra-realistic architectural interior render of ${escena}`,
    config ? config + "." : "",
    metros,
    `Set ${ambienteDesc}.`,
  ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

  const materials = [
    `MATERIALS: ${colorMat}${meson}.${led}`,
    "Cabinet interiors: white melamine lining.",
    "Handles: minimalist anodized aluminum bar handle or handleless push-to-open fronts.",
    "Edge banding: 1mm PVC exactly color-matched.",
    "Hardware: Blum soft-close hinges and full-extension drawer runners.",
    "NOT solid wood, NOT raw MDF, NOT exposed screws.",
    "Brand: Tablemac or Duratex RH melamine, EL PRIMO Carpinteria (Fusagasuga Colombia) quality standard.",
  ].join(" ");

  const environment = [
    `ENVIRONMENT: ${paredDesc}.`,
    `Floor: ${pisoDesc}.`,
    "Ceiling height: 2.6m, white painted, with recessed warm LED downlights.",
    sizeDesc,
    "No clutter, clean minimal staging.",
  ].join(" ");

  const composition = [
    camaraDesc,
    "",
    luzDesc,
    "",
    estiloDesc,
  ].join("\n");

  const quality = [
    "RENDER QUALITY: Photorealistic 8K architectural visualization equivalent to V-Ray / Corona Renderer.",
    "Subsurface-accurate materials, ray-traced ambient occlusion, accurate edge reflections on PVC edge banding.",
    "Ultra-precise hardware detail visible at close range.",
    "Perfect door alignment, consistent 2mm reveals.",
    "NO text, NO watermark, NO logo, NO people, NO pets, NOT a sketch, NOT a 3D wireframe.",
  ].join(" ");

  const parts: string[] = [
    subject,
    "",
    materials,
    "",
    environment,
    "",
    composition,
    "",
    quality,
  ];

  if (extras) {
    parts.push("", `ADDITIONAL ELEMENTS: Include ${extras}.`);
  }

  if (r.noIncluir) {
    parts.push("", `EXPLICITLY AVOID in this image: ${r.noIncluir}.`);
  }

  if (detalle) {
    parts.push("", detalle);
  }

  if (r.promptExtra) {
    parts.push("", `ADDITIONAL INSTRUCTIONS: ${r.promptExtra}`);
  }

  return parts.join("\n").trim();
}
