/**
 * pricing.ts — La "guía de precios" de EL PRIMO convertida en código.
 *
 * 🔒 REGLA DE ORO: la IA NUNCA calcula ni menciona precios.
 * El precio SIEMPRE sale de aquí (código puro). La IA solo redacta prosa.
 * ¿Cambian los costos? Edita SOLO el bloque PRECIOS de abajo. Nada más.
 */

import type { Lead, ResultadoCotizacion, QuoteItem, TipoMueble } from "./types";

// ─── TABLA DE PRECIOS (COP) ─────────────────────────────────────────────────
// Actualizar aquí cada vez que cambien los costos del taller.
const PRECIOS = {
  cocina: {
    porMetroLineal: { min: 1_800_000, max: 2_800_000 }, // por metro lineal de mueble
    mesonGranito: { min: 750_000, max: 950_000 }, // por metro lineal
    mesonCuarzo: { min: 1_100_000, max: 1_400_000 },
    mesonSinterizado: { min: 1_600_000, max: 2_000_000 },
    ledPorModulo: 150_000,
    baseMinMetros: 2.5, // si no sabemos metros, asumimos mínimo
  },
  closet: {
    porMetroCuadrado: { min: 900_000, max: 1_500_000 },
    baseMinMetros: 2.0,
  },
  bano: { base: { min: 1_200_000, max: 2_200_000 } },
  entretenimiento: { base: { min: 1_500_000, max: 3_500_000 } },
  estudio: { base: { min: 1_200_000, max: 2_500_000 } },
  puerta: { porUnidad: { min: 350_000, max: 650_000 } },
  lavadero: { base: { min: 800_000, max: 1_400_000 } },
  alacena: { base: { min: 600_000, max: 1_200_000 } },
} as const;

// Multiplicadores por acabado del material (EL PRIMO solo trabaja melamina RH).
const MATERIAL: Record<NonNullable<Lead["material"]>, number> = {
  rh: 1.0, // RH es el estándar de EL PRIMO
  hpl: 1.25, // HPL / fórmica de alta presión
  "alto-brillo": 1.35, // alto brillo
};

// Multiplicadores por zona (desplazamiento ya considerado aparte en viáticos).
const ZONA = {
  fusagasuga: 1.0,
  chinauta: 1.1,
  laMesa: 1.12,
  silvania: 1.08,
  arbelaez: 1.08,
  soacha: 1.15,
  bogota: 1.2,
  girardot: 1.15,
  melgar: 1.15,
  otro: 1.12,
} as const;

// Viáticos fuera de Fusagasugá (COP). Se descuentan del proyecto si contrata.
const VIATICOS_FUERA_FUSA = 80_000;

// Ticket mínimo: por debajo de esto el proyecto no es viable para el taller.
export const TICKET_MINIMO = 4_000_000;

function detectarZona(zona: string): keyof typeof ZONA {
  const z = (zona || "").toLowerCase();
  if (z.includes("chinauta")) return "chinauta";
  if (z.includes("mesa")) return "laMesa";
  if (z.includes("silvania")) return "silvania";
  if (z.includes("arbelaez") || z.includes("arbeláez")) return "arbelaez";
  if (z.includes("soacha")) return "soacha";
  if (z.includes("bogot")) return "bogota";
  if (z.includes("girardot")) return "girardot";
  if (z.includes("melgar")) return "melgar";
  if (z.includes("fusagasug") || z.includes("fusa")) return "fusagasuga";
  return "otro";
}

/** Redondea al 100.000 más cercano — más limpio para presentar al cliente. */
function redondear(valor: number): number {
  return Math.round(valor / 100_000) * 100_000;
}

export function calcularCotizacion(lead: Lead): ResultadoCotizacion {
  const zonaKey = detectarZona(lead.zona ?? "");
  const zonaMult = ZONA[zonaKey];
  const matMult = MATERIAL[lead.material ?? "rh"];
  const incluyeDesplazamiento = zonaKey !== "fusagasuga";

  const items: QuoteItem[] = [];
  let subtotalMin = 0;
  let subtotalMax = 0;
  const notas: string[] = [];

  const tipos = lead.tiposMueble?.length ? lead.tiposMueble : ["otro" as TipoMueble];

  for (const tipo of tipos) {
    let itemMin = 0;
    let itemMax = 0;
    let descripcion = "";

    switch (tipo) {
      case "cocina": {
        const metros = lead.metros ?? PRECIOS.cocina.baseMinMetros;
        itemMin = PRECIOS.cocina.porMetroLineal.min * metros;
        itemMax = PRECIOS.cocina.porMetroLineal.max * metros;
        descripcion = `Cocina integral ${metros}m lineal${lead.configuracion ? ` en ${lead.configuracion}` : ""}`;

        if (lead.meson && lead.meson !== "ninguno") {
          const key = `meson${lead.meson.charAt(0).toUpperCase()}${lead.meson.slice(1)}` as
            | "mesonGranito"
            | "mesonCuarzo"
            | "mesonSinterizado";
          const m = PRECIOS.cocina[key];
          if (m) {
            itemMin += m.min * metros;
            itemMax += m.max * metros;
            descripcion += ` + mesón ${lead.meson}`;
          }
        }

        if (lead.ledIntegrado) {
          const ledModulos = Math.ceil(metros * 1.5);
          const ledCosto = PRECIOS.cocina.ledPorModulo * ledModulos;
          itemMin += ledCosto;
          itemMax += ledCosto;
          descripcion += " + iluminación LED";
        }

        notas.push("✅ Tablero RH obligatorio en cocina (estándar EL PRIMO).");
        notas.push("✅ Cantos termosellados a máquina industrial.");
        break;
      }
      case "closet": {
        const metros = lead.metros ?? PRECIOS.closet.baseMinMetros;
        itemMin = PRECIOS.closet.porMetroCuadrado.min * metros;
        itemMax = PRECIOS.closet.porMetroCuadrado.max * metros;
        descripcion = `Closet / vestier ${metros}m²`;
        break;
      }
      case "bano": {
        itemMin = PRECIOS.bano.base.min;
        itemMax = PRECIOS.bano.base.max;
        descripcion = "Mueble de baño (vanitorio)";
        notas.push("✅ Tablero RH obligatorio en baño (estándar EL PRIMO).");
        break;
      }
      case "entretenimiento": {
        itemMin = PRECIOS.entretenimiento.base.min;
        itemMax = PRECIOS.entretenimiento.base.max;
        descripcion = "Centro de entretenimiento";
        break;
      }
      case "estudio": {
        itemMin = PRECIOS.estudio.base.min;
        itemMax = PRECIOS.estudio.base.max;
        descripcion = "Escritorio / estudio empotrado";
        break;
      }
      case "puerta": {
        const unidades = lead.metros ? Math.round(lead.metros) : 1;
        itemMin = PRECIOS.puerta.porUnidad.min * unidades;
        itemMax = PRECIOS.puerta.porUnidad.max * unidades;
        descripcion = `Puertas de comunicación (${unidades} und.)`;
        break;
      }
      case "lavadero": {
        itemMin = PRECIOS.lavadero.base.min;
        itemMax = PRECIOS.lavadero.base.max;
        descripcion = "Mueble de lavadero";
        break;
      }
      case "alacena": {
        itemMin = PRECIOS.alacena.base.min;
        itemMax = PRECIOS.alacena.base.max;
        descripcion = "Alacena / despensa";
        break;
      }
      default: {
        itemMin = 800_000;
        itemMax = 2_500_000;
        descripcion = "Mueble especial a medida";
        break;
      }
    }

    itemMin = redondear(itemMin * matMult * zonaMult);
    itemMax = redondear(itemMax * matMult * zonaMult);
    subtotalMin += itemMin;
    subtotalMax += itemMax;
    items.push({ tipo, descripcion, precioMin: itemMin, precioMax: itemMax });
  }

  // Descuento combo (más de 1 tipo de mueble)
  let descuentoCombo = 0;
  if (tipos.length > 1) {
    descuentoCombo = redondear(subtotalMin * 0.05);
    notas.push("💡 Descuento combo por proyecto múltiple (5%).");
  }

  // Viáticos
  const viaticos = incluyeDesplazamiento ? VIATICOS_FUERA_FUSA : 0;
  if (incluyeDesplazamiento) {
    notas.push(`🚗 Desplazamiento a ${lead.zona}: ${formatCOP(viaticos)} (se descuenta si contrata).`);
  }

  // Tiempo de entrega (el mayor de los tipos solicitados)
  const tiemposBase: Record<TipoMueble, number> = {
    cocina: 30,
    closet: 18,
    bano: 10,
    entretenimiento: 20,
    estudio: 18,
    puerta: 10,
    lavadero: 8,
    alacena: 10,
    otro: 18,
  };
  const diasEntrega = Math.max(...tipos.map((t) => tiemposBase[t] ?? 18));

  const totalMin = subtotalMin - descuentoCombo + viaticos;
  const totalMax = subtotalMax - descuentoCombo + viaticos;

  // Aviso de ticket mínimo (no bloquea: Audenar decide al revisar)
  if (totalMax < TICKET_MINIMO) {
    notas.push(
      `⚠️ El estimado queda por debajo del ticket mínimo (${formatCOP(TICKET_MINIMO)}). Confirma alcance antes de enviar.`
    );
  }

  return {
    items,
    subtotalMin,
    subtotalMax,
    descuentoCombo,
    viaticos,
    totalMin,
    totalMax,
    diasEntrega,
    incluyeDesplazamiento,
    moneda: "COP",
    notas,
  };
}

/** Formatea un número como pesos colombianos: 1800000 -> "$1.800.000". */
export function formatCOP(valor: number): string {
  return "$" + Math.round(valor).toLocaleString("es-CO");
}

/** Versión corta para titulares: 1800000 -> "$1,8 millones". */
export function formatMillones(valor: number): string {
  return `$${(valor / 1_000_000).toFixed(1).replace(".0", "").replace(".", ",")} millones`;
}
