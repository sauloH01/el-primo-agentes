// src/services/openai.ts
// Cerebro del agente: responde con MEMORIA (historial completo) y califica el lead.
import OpenAI from "openai";
import type { Env, Lead, AgentReply, ConversationMessage, Stage } from "../types";
import { buildKnowledge } from "../knowledge";
import { loadFewShots } from "./curator";

const VALID_STAGES: Stage[] = ["nuevo", "en_proceso", "calificado", "rechazado"];

export class OpenAIClient {
  private openai: OpenAI;
  private env: Env;

  constructor(env: Env) {
    this.openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    this.env = env;
  }

  /**
   * Procesa el último mensaje del cliente teniendo en cuenta TODA la conversación
   * previa y el conocimiento del negocio. Devuelve la respuesta + la calificación.
   */
  async generateReply(
    conversation: ConversationMessage[],
    lead: Lead
  ): Promise<AgentReply> {
    const knowledge = buildKnowledge();

    // Few-shots dinámicos del sistema de curación (mejoran con el tiempo)
    const fewShots = await loadFewShots(this.env).catch(() => []);
    const fewShotBlock = buildFewShotBlock(fewShots, lead);

    const origenBloque = lead.source === "landing"
      ? `ORIGEN: Landing (el cliente ya nos dio datos por formulario web).
IMPORTANTE: Ya sabemos su nombre, zona, tipo de proyecto y presupuesto aproximado.
SALÚDALO por su nombre (si lo tenemos), reconoce su proyecto y NO vuelvas a preguntar lo que ya conocemos.
Solo llena los huecos que falten (metros, configuración, urgencia, etc.).`
      : `ORIGEN: WhatsApp orgánico (llegó directo sin formulario previo).
Sigue el proceso normal: conexión → calificación suave → construir valor → cerrar visita.`;

    // Fecha y día actual para que el bot no confunda "mañana" con el día equivocado
    const now = new Date();
    const fechaHoy = now.toLocaleDateString("es-CO", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
      timeZone: "America/Bogota",
    });

    const systemPrompt = `${knowledge}
${fewShotBlock}

FECHA Y HORA ACTUALES (Colombia): ${fechaHoy}
Usa esta fecha para interpretar "mañana", "esta semana", "el sábado", etc. con el día real del calendario.

INSTRUCCIONES DE SALIDA
Eres el agente de ventas en una conversación de WhatsApp en curso. Lee TODO el historial y responde el último mensaje del cliente.
Datos que ya conocemos de este lead:
- Nombre: ${lead.name ?? "(desconocido)"}
- Ciudad/Zona: ${lead.city ?? "(desconocida)"}
- Presupuesto estimado: ${lead.budget ? `$${lead.budget.toLocaleString("es-CO")} COP` : "(por definir — sondea con preguntas de alcance, NUNCA mencionando cifras)"}
- Proyecto: ${lead.projectType ?? "(desconocido)"}

${origenBloque}

TABLA DE PRECIOS — USO INTERNO ÚNICAMENTE (PROHIBIDO escribir estas cifras en "reply"):
- Cocina integral (3-5m lineales): $12M – $28M
- Closet individual (2-3m): $4M – $12M  |  Vestier / closet grande (4-6m): $8M – $22M
- Mueble de baño: $3M – $8M  |  Centro de entretenimiento / TV: $5M – $14M
- Estudio / home office: $3M – $9M  |  Puerta decorativa: $1M – $3M
- Mobiliario completo (múltiples ambientes): suma de los ambientes
  → rango $30M–$60M → tiers $20M / $40M / $55M
  → rango $60M–$120M → tiers $40M / $70M / $95M
  → rango >$120M → tiers proporcionales al 35% / 65% / 90% del presupuesto
Coherencia: tier Lujo debe estar entre P×0.7 y P×1.0. PROHIBIDO tiers menores al 10% del presupuesto.

REGLA ABSOLUTA DE PRECIOS: ninguna cifra en pesos va en el campo "reply", nunca, ni rangos, ni ejemplos.
El campo "reply" es lo que el cliente lee. Los tiers y presupuestos van SOLO en el JSON interno.
Para avanzar hacia calificación: cuando tengas tipo de mueble + zona + metros (o alcance), di algo como:
→ "Con eso Audenar te arma la propuesta. ¿Cuándo puedes para la visita técnica — esta semana o la próxima?"

REGLA DE CIERRE CON DIRECCIÓN:
Nunca des la visita por confirmada sin tener la dirección. Flujo obligatorio:
1. Cliente confirma día y hora → tú respondes: "Listo, [día] a las [hora]. ¿Cuál es la dirección exacta?"
2. Cliente da la dirección → ENTONCES marca isQualified=true, nextStage="calificado".
3. Si el cliente confirma hora pero no da dirección → nextStage="en_proceso", isQualified=false, pide la dirección.

Devuelve SIEMPRE un JSON con esta forma:
{
  "reply": "respuesta breve para WhatsApp (máx 300 caracteres, tono natural colombiano, sin repetir frases ya usadas en el historial)",
  "nextStage": "nuevo" | "en_proceso" | "calificado" | "rechazado",
  "isQualified": true | false,
  "tiers": [ { "tier": "Básico", "price": NÚMERO }, { "tier": "Premium", "price": NÚMERO }, { "tier": "Lujo", "price": NÚMERO } ],
  "capturedFields": { "name": "...", "city": "...", "budget": 0, "projectType": "...", "metros": 0, "urgencia": "...", "colorPreferido": "...", "configuracion": "...", "direccion": "..." }
}
Reglas de calificación:
- Sin tipo de mueble, zona o alcance → nextStage="en_proceso", isQualified=false, pregunta UNA cosa. "tiers" puede ir [].
- isQualified=true y nextStage="calificado" SOLO cuando tengas tipo + zona + dirección de visita confirmada.
- Presupuesto insuficiente para el ticket mínimo → nextStage="rechazado", isQualified=false, tiers=[], cierra con calidez pero sugiere un mueble individual a futuro.
- Captura en "capturedFields" todo lo deducible: name, city, budget, projectType, metros, urgencia, colorPreferido, configuracion, direccion.
- Pregunta máximo UN campo nuevo por turno.`;

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...conversation.map((m) => ({
        role: (m.direction === "in" ? "user" : "assistant") as "user" | "assistant",
        content: m.body,
      })),
    ];

    let parsed: Partial<AgentReply> = {};
    try {
      const res = await this.openai.chat.completions.create({
        model: this.env.OPENAI_MODEL ?? "gpt-4o-mini",
        temperature: 0.5,
        messages,
        response_format: { type: "json_object" },
      });
      parsed = JSON.parse(res.choices[0].message?.content?.trim() ?? "{}");
    } catch (err) {
      console.error("[OpenAI] fallo generando respuesta:", err);
    }

    // Normalización defensiva (nunca confíes ciegamente en el modelo).
    const isQualified = parsed.isQualified === true;
    let nextStage: Stage = VALID_STAGES.includes(parsed.nextStage as Stage)
      ? (parsed.nextStage as Stage)
      : isQualified
        ? "calificado"
        : "en_proceso";
    // Coherencia: si dice calificado pero la etapa no lo refleja (o viceversa).
    if (isQualified && nextStage !== "calificado") nextStage = "calificado";
    if (!isQualified && nextStage === "calificado") nextStage = "en_proceso";

    return {
      reply:
        typeof parsed.reply === "string" && parsed.reply.trim()
          ? parsed.reply.trim()
          : "Gracias por escribir a EL PRIMO 🙌 Cuéntame, ¿qué mueble o espacio quieres a medida (cocina, clóset, baño...) y en qué zona?",
      nextStage,
      isQualified,
      tiers: Array.isArray(parsed.tiers) ? parsed.tiers : [],
      capturedFields: parsed.capturedFields ?? {},
    };
  }
}

// ─── Few-shot builder ────────────────────────────────────────────────────────

type FewShot = { projectType: string | null; budgetTier: string; input: string; idealOutput: string };

function classifyLeadBudget(budget: number): string {
  if (budget >= 50_000_000) return "muy_alto";
  if (budget >= 20_000_000) return "alto";
  if (budget >= 5_000_000)  return "medio";
  return "bajo";
}

function buildFewShotBlock(shots: FewShot[], lead: Lead): string {
  if (shots.length === 0) return "";

  const budgetTier = classifyLeadBudget(lead.budget);
  const projectType = (lead.projectType ?? "").toLowerCase();

  // Priorizar ejemplos relevantes: mismo tipo de proyecto o mismo tier de presupuesto
  const sorted = [...shots].sort((a, b) => {
    const aMatch =
      (a.budgetTier === budgetTier ? 2 : 0) +
      (projectType && a.projectType && projectType.includes(a.projectType.toLowerCase()) ? 2 : 0);
    const bMatch =
      (b.budgetTier === budgetTier ? 2 : 0) +
      (projectType && b.projectType && projectType.includes(b.projectType.toLowerCase()) ? 2 : 0);
    return bMatch - aMatch;
  });

  const top = sorted.slice(0, 3); // máximo 3 ejemplos para no inflar el prompt
  if (top.length === 0) return "";

  const examples = top
    .map(
      (s, i) =>
        `Ejemplo ${i + 1} (tipo: ${s.projectType ?? "general"}, presupuesto: ${s.budgetTier}):\n` +
        `  Cliente: ${s.input}\n` +
        `  Agente: ${s.idealOutput}`
    )
    .join("\n\n");

  return `\nEJEMPLOS DE CONVERSACIONES EXITOSAS (aprende del tono y la estructura, NO copies literalmente):
${examples}`;
}
