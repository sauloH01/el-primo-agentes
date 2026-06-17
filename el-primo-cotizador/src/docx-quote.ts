/**
 * docx-quote.ts — Genera la cotización como documento Word (.docx) premium
 * para que Audenar la reenvíe al cliente. Neuromarketing aplicado:
 * Problema → Solución (entregables como resultados) → "Inversión" (nunca "precio")
 * → Urgencia con fecha → CTA único.
 */
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  ShadingType,
  HeadingLevel,
  PageBreak,
  ExternalHyperlink,
  convertMillimetersToTwip,
} from "docx";
import type { Lead, ResultadoCotizacion, ContenidoIA } from "./types";
import { formatMillones, formatCOP } from "./pricing";

// ─── Paleta EL PRIMO (sin #) ────────────────────────────────────────────────
const BROWN = "4A2C0A";
const WOOD = "8B4513";
const GOLD = "C9A84C";
const WHITE = "FFFFFF";
const LIGHT = "F5EFE6";
const WARN = "FFF8EC";
const GRAY = "4A4A5A";
const LGRAY = "F0EBE3";

function spacer(size = 200): Paragraph {
  return new Paragraph({ spacing: { after: size } });
}

function sectionLabel(num: string, label: string): Paragraph {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: WOOD, space: 6 } },
    spacing: { after: 240 },
    children: [
      new TextRun({ text: `${num}  ·  `, color: GOLD, size: 18, font: "Arial" }),
      new TextRun({ text: label.toUpperCase(), color: WOOD, size: 18, bold: true, font: "Arial" }),
    ],
  });
}

function bodyText(text: string, after = 200): Paragraph {
  return new Paragraph({
    spacing: { after, line: 360 },
    children: [new TextRun({ text, color: GRAY, size: 24, font: "Arial" })],
  });
}

function entregableItem(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 160 },
    indent: { left: convertMillimetersToTwip(5) },
    children: [
      new TextRun({ text: "✓  ", color: WOOD, size: 24, bold: true, font: "Arial" }),
      new TextRun({ text, color: GRAY, size: 24, font: "Arial" }),
    ],
  });
}

function pricingRow(concepto: string, detalle: string, valor: string, isTotal = false): TableRow {
  const bg = isTotal ? BROWN : WHITE;
  const textColor = isTotal ? WHITE : BROWN;
  const valueColor = isTotal ? GOLD : WOOD;
  const fontSize = isTotal ? 28 : 22;
  return new TableRow({
    children: [
      new TableCell({
        shading: { type: ShadingType.SOLID, color: bg },
        borders: {
          top: { style: BorderStyle.NONE },
          bottom: isTotal ? { style: BorderStyle.NONE } : { style: BorderStyle.SINGLE, size: 2, color: LGRAY },
          left: { style: BorderStyle.NONE },
          right: { style: BorderStyle.NONE },
        },
        margins: { top: 160, bottom: 160, left: 280, right: 280 },
        width: { size: 72, type: WidthType.PERCENTAGE },
        children: [
          new Paragraph({
            children: [new TextRun({ text: concepto, color: textColor, size: fontSize, bold: isTotal, font: "Arial", allCaps: isTotal })],
          }),
          ...(detalle
            ? [new Paragraph({ spacing: { before: 40 }, children: [new TextRun({ text: detalle, color: "9A8A78", size: 18, font: "Arial" })] })]
            : []),
        ],
      }),
      new TableCell({
        shading: { type: ShadingType.SOLID, color: bg },
        borders: {
          top: { style: BorderStyle.NONE },
          bottom: isTotal ? { style: BorderStyle.NONE } : { style: BorderStyle.SINGLE, size: 2, color: LGRAY },
          left: { style: BorderStyle.NONE },
          right: { style: BorderStyle.NONE },
        },
        margins: { top: 160, bottom: 160, left: 280, right: 280 },
        width: { size: 28, type: WidthType.PERCENTAGE },
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: valor, color: valueColor, size: isTotal ? 30 : fontSize, bold: true, font: "Arial" })],
          }),
        ],
      }),
    ],
  });
}

export async function generarDocx(lead: Lead, cot: ResultadoCotizacion, c: ContenidoIA): Promise<Buffer> {
  const waMsg = encodeURIComponent(`Hola, soy ${lead.nombre}. Recibí mi propuesta de EL PRIMO y quiero agendar la visita.`);
  const waHref = `https://wa.me/${lead.telefono.replace(/[^0-9]/g, "")}?text=${waMsg}`;
  const nombreCorto = (lead.nombre || "").trim().split(/\s+/)[0];
  const fecha = new Date().toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
  const validaHasta = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toLocaleDateString("es-CO", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const ref = `EP-${Date.now().toString(36).toUpperCase().slice(-6)}`;

  const filasPrecio = cot.items.map((i) =>
    pricingRow(i.descripcion, "", `${formatMillones(i.precioMin)} – ${formatMillones(i.precioMax)}`)
  );
  if (cot.descuentoCombo > 0) {
    filasPrecio.push(pricingRow("Descuento proyecto combinado", "5% por más de un mueble", `- ${formatMillones(cot.descuentoCombo)}`));
  }
  if (cot.viaticos > 0) {
    filasPrecio.push(pricingRow("Viáticos de desplazamiento", "Se descuenta si contrata", formatCOP(cot.viaticos)));
  }
  filasPrecio.push(pricingRow("INVERSIÓN TOTAL ESTIMADA", "", `${formatMillones(cot.totalMin)} – ${formatMillones(cot.totalMax)}`, true));

  const tablaPrecio = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: filasPrecio });

  const doc = new Document({
    styles: {
      default: { document: { run: { font: "Arial", size: 24, color: GRAY }, paragraph: { spacing: { after: 160 } } } },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertMillimetersToTwip(25),
              right: convertMillimetersToTwip(25),
              bottom: convertMillimetersToTwip(25),
              left: convertMillimetersToTwip(25),
            },
          },
        },
        children: [
          // PORTADA
          new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: "EL PRIMO", color: GOLD, size: 22, bold: true, font: "Arial", allCaps: true })] }),
          new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: "Ebanistería y Carpintería  ·  Fusagasugá, Cundinamarca", color: "8A7A68", size: 16, font: "Arial" })] }),
          spacer(1200),
          new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: "PROPUESTA DE MOBILIARIO A MEDIDA", color: "8A7A68", size: 18, font: "Arial", allCaps: true })] }),
          new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { after: 400 }, children: [new TextRun({ text: c.titulo, color: BROWN, size: 60, font: "Arial" })] }),
          new Paragraph({ border: { top: { style: BorderStyle.SINGLE, size: 12, color: GOLD, space: 0 } }, spacing: { after: 200 }, children: [] }),
          new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: "Preparada exclusivamente para", color: GRAY, size: 22, font: "Arial" })] }),
          new Paragraph({ spacing: { after: 1200 }, children: [new TextRun({ text: lead.nombre, color: WOOD, size: 50, bold: true, font: "Arial" })] }),
          new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: `${fecha}    ·    Ref. ${ref}    ·    Válida hasta: ${validaHasta}`, color: "9A8A78", size: 18, font: "Arial" })] }),
          new Paragraph({ children: [new PageBreak()] }),

          // 01 ENTENDEMOS TU PROYECTO
          spacer(400),
          sectionLabel("01", "Entendemos tu proyecto"),
          spacer(120),
          new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: `Hola ${nombreCorto},`, color: BROWN, size: 32, bold: true, font: "Arial" })] }),
          new Paragraph({
            shading: { type: ShadingType.SOLID, color: LIGHT },
            border: { left: { style: BorderStyle.SINGLE, size: 16, color: GOLD, space: 8 } },
            spacing: { after: 0, line: 380 },
            indent: { left: convertMillimetersToTwip(5) },
            children: [new TextRun({ text: c.entendimiento, color: GRAY, size: 24, font: "Arial" })],
          }),
          spacer(400),
          new Paragraph({
            shading: { type: ShadingType.SOLID, color: WARN },
            border: {
              top: { style: BorderStyle.SINGLE, size: 4, color: GOLD },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: GOLD },
              left: { style: BorderStyle.SINGLE, size: 4, color: GOLD },
              right: { style: BorderStyle.SINGLE, size: 4, color: GOLD },
            },
            spacing: { after: 0, line: 360 },
            indent: { left: convertMillimetersToTwip(5), right: convertMillimetersToTwip(5) },
            children: [
              new TextRun({ text: "Por qué hacerlo bien desde el principio: ", color: "92400E", size: 22, bold: true, font: "Arial" }),
              new TextRun({ text: "un mueble en melamina RH bien fabricado dura más de 15 años. Uno barato en material equivocado se sopla con la humedad en meses. La diferencia no se ve el primer día — se ve a los dos años.", color: "78350F", size: 22, font: "Arial" }),
            ],
          }),
          new Paragraph({ children: [new PageBreak()] }),

          // 02 LO QUE INCLUYE
          spacer(400),
          sectionLabel("02", "Lo que incluye tu proyecto"),
          spacer(120),
          bodyText(`Esto es exactamente lo que vas a tener cuando terminemos — no promesas, resultados concretos para tu espacio:`, 320),
          ...c.entregables.map((e) => entregableItem(e)),
          spacer(600),

          // 03 INVERSIÓN
          sectionLabel("03", "Tu inversión"),
          spacer(120),
          bodyText("Cada peso que inviertes queda en tu casa por más de una década. Materiales de primera, herrajes que no fallan, y la mano de un ebanista con 13 años de oficio.", 320),
          tablaPrecio,
          new Paragraph({ spacing: { before: 160, after: 0 }, children: [new TextRun({ text: "* Estimado preliminar. El precio exacto se confirma en la visita técnica gratuita, sin compromiso.", color: "9A8A78", size: 18, font: "Arial" })] }),
          spacer(360),
          new Paragraph({
            spacing: { after: 0 },
            children: [
              new TextRun({ text: `⏳  Esta propuesta está reservada para ti hasta el `, color: GRAY, size: 20, font: "Arial" }),
              new TextRun({ text: validaHasta, color: WOOD, size: 20, bold: true, font: "Arial" }),
              new TextRun({ text: ". Después, precios y disponibilidad de agenda pueden cambiar.", color: GRAY, size: 20, font: "Arial" }),
            ],
          }),
          new Paragraph({ children: [new PageBreak()] }),

          // 04 SIGUIENTE PASO
          spacer(400),
          sectionLabel("04", "El siguiente paso"),
          spacer(120),
          bodyText(c.cierre, 320),
          new Paragraph({
            shading: { type: ShadingType.SOLID, color: WOOD },
            border: {
              top: { style: BorderStyle.SINGLE, size: 2, color: WOOD },
              bottom: { style: BorderStyle.SINGLE, size: 2, color: WOOD },
              left: { style: BorderStyle.SINGLE, size: 2, color: WOOD },
              right: { style: BorderStyle.SINGLE, size: 2, color: WOOD },
            },
            alignment: AlignmentType.CENTER,
            spacing: { after: 0 },
            indent: { left: convertMillimetersToTwip(10), right: convertMillimetersToTwip(10) },
            children: [
              new ExternalHyperlink({
                link: waHref,
                children: [new TextRun({ text: "  Escríbeme por WhatsApp y agendamos la visita  ", color: WHITE, size: 28, bold: true, font: "Arial" })],
              }),
            ],
          }),
          spacer(600),
          new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: "Sin compromiso de entrada:", color: BROWN, size: 22, bold: true, font: "Arial" })] }),
          bodyText("La visita técnica y el diseño 3D en SketchUp son gratis. Solo avanzas si te enamoras del diseño. Y todo queda por escrito: contrato con garantía de 1 año en estructura.", 320),
          spacer(400),
          new Paragraph({ border: { top: { style: BorderStyle.SINGLE, size: 4, color: GOLD, space: 8 } }, spacing: { after: 160, before: 240 }, children: [] }),
          new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: "EL PRIMO · Ebanistería y Carpintería", color: BROWN, size: 28, bold: true, font: "Arial" })] }),
          new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: "Audenar Salazar  ·  Fusagasugá, Cundinamarca  ·  13 años de experiencia", color: GRAY, size: 20, font: "Arial" })] }),
          new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: `Ref. ${ref}  ·  ${fecha}`, color: "9A8A78", size: 18, font: "Arial" })] }),
        ],
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
