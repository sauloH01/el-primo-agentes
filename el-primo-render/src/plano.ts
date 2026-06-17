/**
 * plano.ts — Genera un plano 2D acotado (SVG) a partir de las medidas.
 *
 * No es CAD: es un plano PRELIMINAR para que el cliente entienda la distribución.
 * El plano técnico definitivo lo hace Audenar tras la visita y el diseño 3D.
 *
 * - Cocina lineal/L/U → vista en planta con módulos y cotas.
 * - Closet/baño/otros → alzado frontal con divisiones y cotas.
 */
import type { RenderRequest } from "./types";

const WOOD = "#8B4513";
const BROWN = "#4A2C0A";
const GOLD = "#C9A84C";
const GRAY = "#6B6B6B";
const LINE = "#333333";
const FILL = "#F5EFE6";

const PROFUNDIDAD_COCINA = 0.6; // m (estándar)
const MODULO = 0.6; // m por módulo aprox.

/** Devuelve el SVG del plano como string. */
export function generarPlanoSVG(r: RenderRequest): string {
  const tipo = r.tipoMueble;
  if (tipo === "cocina") return planoCocina(r);
  return planoAlzado(r);
}

// ─── Cotas / helpers ────────────────────────────────────────────────────────
function dimH(x1: number, x2: number, y: number, label: string): string {
  const mid = (x1 + x2) / 2;
  return `
    <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${GRAY}" stroke-width="1"/>
    <line x1="${x1}" y1="${y - 5}" x2="${x1}" y2="${y + 5}" stroke="${GRAY}" stroke-width="1"/>
    <line x1="${x2}" y1="${y - 5}" x2="${x2}" y2="${y + 5}" stroke="${GRAY}" stroke-width="1"/>
    <rect x="${mid - 28}" y="${y - 9}" width="56" height="18" fill="white"/>
    <text x="${mid}" y="${y + 4}" font-family="Arial" font-size="12" fill="${BROWN}" text-anchor="middle">${label}</text>`;
}
function dimV(x: number, y1: number, y2: number, label: string): string {
  const mid = (y1 + y2) / 2;
  return `
    <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${GRAY}" stroke-width="1"/>
    <line x1="${x - 5}" y1="${y1}" x2="${x + 5}" y2="${y1}" stroke="${GRAY}" stroke-width="1"/>
    <line x1="${x - 5}" y1="${y2}" x2="${x + 5}" y2="${y2}" stroke="${GRAY}" stroke-width="1"/>
    <rect x="${x - 28}" y="${mid - 9}" width="56" height="18" fill="white"/>
    <text x="${x}" y="${mid + 4}" font-family="Arial" font-size="12" fill="${BROWN}" text-anchor="middle">${label}</text>`;
}
function metrosLabel(m: number): string {
  return `${m.toFixed(2)} m`;
}
/** Dibuja las divisiones de módulos (~0.6m c/u) sobre un run de `meters` metros. */
function modulos(x: number, y: number, w: number, h: number, horizontal: boolean, meters: number): string {
  const total = horizontal ? w : h;
  const n = Math.max(1, Math.round(meters / MODULO));
  let s = "";
  for (let i = 1; i < n; i++) {
    const p = (total / n) * i;
    s += horizontal
      ? `<line x1="${x + p}" y1="${y}" x2="${x + p}" y2="${y + h}" stroke="${WOOD}" stroke-width="1" stroke-dasharray="2 2"/>`
      : `<line x1="${x}" y1="${y + p}" x2="${x + w}" y2="${y + p}" stroke="${WOOD}" stroke-width="1" stroke-dasharray="2 2"/>`;
  }
  return s;
}

// ─── Cocina (planta) ────────────────────────────────────────────────────────
function planoCocina(r: RenderRequest): string {
  const metros = r.metros ?? 3;
  const config = r.configuracion ?? "lineal";
  const W = 820;
  const H = 560;
  // escala px/m según el run más largo
  const scale = Math.min(120, 520 / Math.max(metros, 2));
  const prof = PROFUNDIDAD_COCINA * scale;

  let dibujo = "";
  const ox = 120;
  const oy = 150;

  if (config === "L") {
    const a = metros * 0.6; // brazo horizontal
    const b = metros * 0.4; // brazo vertical
    const aw = a * scale;
    const bh = b * scale;
    // brazo horizontal
    dibujo += `<rect x="${ox}" y="${oy}" width="${aw}" height="${prof}" fill="${FILL}" stroke="${LINE}" stroke-width="2"/>`;
    dibujo += modulos(ox, oy, aw, prof, true, a);
    // brazo vertical
    dibujo += `<rect x="${ox}" y="${oy}" width="${prof}" height="${bh}" fill="${FILL}" stroke="${LINE}" stroke-width="2"/>`;
    dibujo += modulos(ox, oy, prof, bh, false, b);
    dibujo += dimH(ox, ox + aw, oy + prof + 40, metrosLabel(a));
    dibujo += dimV(ox - 40, oy, oy + bh, metrosLabel(b));
  } else if (config === "U") {
    const lado = metros / 3;
    const lw = lado * scale;
    const altura = metros * 0.45 * scale;
    // base
    dibujo += `<rect x="${ox}" y="${oy}" width="${lw * 3}" height="${prof}" fill="${FILL}" stroke="${LINE}" stroke-width="2"/>`;
    dibujo += modulos(ox, oy, lw * 3, prof, true, lado * 3);
    // brazo izq
    dibujo += `<rect x="${ox}" y="${oy}" width="${prof}" height="${altura}" fill="${FILL}" stroke="${LINE}" stroke-width="2"/>`;
    // brazo der
    dibujo += `<rect x="${ox + lw * 3 - prof}" y="${oy}" width="${prof}" height="${altura}" fill="${FILL}" stroke="${LINE}" stroke-width="2"/>`;
    dibujo += dimH(ox, ox + lw * 3, oy + prof + altura + 40, metrosLabel(lado * 3));
    dibujo += dimV(ox - 40, oy, oy + altura, metrosLabel(metros * 0.45));
  } else {
    // lineal
    const lw = metros * scale;
    dibujo += `<rect x="${ox}" y="${oy}" width="${lw}" height="${prof}" fill="${FILL}" stroke="${LINE}" stroke-width="2"/>`;
    dibujo += modulos(ox, oy, lw, prof, true, metros);
    // módulos superiores (dashed)
    dibujo += `<rect x="${ox}" y="${oy - prof - 24}" width="${lw}" height="${prof * 0.66}" fill="none" stroke="${WOOD}" stroke-width="1" stroke-dasharray="4 3"/>`;
    dibujo += `<text x="${ox + lw / 2}" y="${oy - prof - 30}" font-family="Arial" font-size="11" fill="${WOOD}" text-anchor="middle">módulos superiores</text>`;
    dibujo += dimH(ox, ox + lw, oy + prof + 40, metrosLabel(metros));
    dibujo += dimV(ox - 40, oy, oy + prof, metrosLabel(PROFUNDIDAD_COCINA));
  }

  return envolver(r, `Planta — cocina ${config}`, dibujo, W, H);
}

// ─── Closet / baño / otros (alzado frontal) ────────────────────────────────
function planoAlzado(r: RenderRequest): string {
  const W = 820;
  const H = 560;
  const ancho = r.metros ?? 2.4;
  const alto = r.tipoMueble === "closet" ? 2.4 : 0.9;
  const scale = Math.min(180, 560 / Math.max(ancho, 1.5));
  const aw = ancho * scale;
  const ah = alto * scale;
  const ox = 140;
  const oy = 120;

  let dibujo = `<rect x="${ox}" y="${oy}" width="${aw}" height="${ah}" fill="${FILL}" stroke="${LINE}" stroke-width="2"/>`;
  // divisiones verticales (puertas/módulos)
  const nCols = Math.max(2, Math.round(ancho / 0.5));
  for (let i = 1; i < nCols; i++) {
    const x = ox + (aw / nCols) * i;
    dibujo += `<line x1="${x}" y1="${oy}" x2="${x}" y2="${oy + ah}" stroke="${WOOD}" stroke-width="1"/>`;
  }
  // estantes (closet) o cajones
  if (r.tipoMueble === "closet") {
    for (let j = 1; j < 4; j++) {
      const y = oy + (ah / 4) * j;
      dibujo += `<line x1="${ox}" y1="${y}" x2="${ox + aw / nCols}" y2="${y}" stroke="${WOOD}" stroke-width="1" stroke-dasharray="3 2"/>`;
    }
    // barra de colgado
    dibujo += `<line x1="${ox + aw / nCols}" y1="${oy + ah * 0.25}" x2="${ox + aw}" y2="${oy + ah * 0.25}" stroke="${GOLD}" stroke-width="2"/>`;
    dibujo += `<text x="${ox + aw * 0.7}" y="${oy + ah * 0.22}" font-family="Arial" font-size="11" fill="${WOOD}" text-anchor="middle">zona de colgado</text>`;
  }
  dibujo += dimH(ox, ox + aw, oy + ah + 40, metrosLabel(ancho));
  dibujo += dimV(ox - 45, oy, oy + ah, metrosLabel(alto));

  return envolver(r, `Alzado — ${r.tipoMueble}`, dibujo, W, H);
}

// ─── Marco del documento (título + nota + firma) ───────────────────────────
function envolver(r: RenderRequest, subtitulo: string, dibujo: string, W: number, H: number): string {
  const color = r.colorPreferido ? ` · ${esc(r.colorPreferido)}` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Arial">
  <rect width="${W}" height="${H}" fill="white"/>
  <rect x="8" y="8" width="${W - 16}" height="${H - 16}" fill="none" stroke="${BROWN}" stroke-width="2"/>
  <!-- título -->
  <text x="28" y="42" font-size="20" font-weight="bold" fill="${BROWN}">EL PRIMO · Plano preliminar</text>
  <text x="28" y="64" font-size="13" fill="${GRAY}">${esc(subtitulo)}${color}  ·  Cliente: ${esc(r.nombre)}</text>
  <line x1="28" y1="76" x2="${W - 28}" y2="76" stroke="${GOLD}" stroke-width="2"/>
  ${dibujo}
  <!-- nota -->
  <text x="28" y="${H - 40}" font-size="11" fill="${GRAY}">Plano preliminar, no a escala. Las medidas exactas se confirman en la visita técnica gratuita.</text>
  <text x="28" y="${H - 22}" font-size="11" fill="${WOOD}">Audenar Salazar · Ebanistería y Carpintería · Fusagasugá · Melamina RH</text>
</svg>`;
}

function esc(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
