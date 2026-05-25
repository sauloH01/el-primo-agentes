/**
 * Fragment: crear una página nueva en una database de Notion.
 *
 * Usa fetch directo (no SDK) — único approach que funciona en Cloudflare Workers.
 *
 * Casos de uso:
 *   - Guardar ideas de contenido en DB Ideas
 *   - Guardar leads en DB CRM
 *   - Guardar reportes diarios
 *   - Crear bitácora de runs del agente
 */

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

/**
 * Crea una página simple en una DB de Notion.
 *
 * @example
 *   const page = await saveToNotion({
 *     notionToken: env.NOTION_TOKEN,
 *     databaseId: env.NOTION_DB_ID,
 *     properties: {
 *       Name: { title: [{ text: { content: "Mi título" } }] },
 *       Status: { select: { name: "Nueva" } },
 *     },
 *     bodyMarkdown: "# Detalles\n\nContenido extenso aquí...",
 *   });
 *   console.log(page.url);
 */
export async function saveToNotion(opts: {
  notionToken: string;
  databaseId: string;
  /** Properties siguiendo el schema EXACTO de tu DB en Notion */
  properties: Record<string, any>;
  /** Markdown opcional para el body de la página (se convierte a bloques Notion) */
  bodyMarkdown?: string;
}): Promise<{ pageId: string; url: string }> {
  const { notionToken, databaseId, properties, bodyMarkdown } = opts;

  const requestBody: Record<string, unknown> = {
    parent: { database_id: databaseId },
    properties,
  };

  if (bodyMarkdown) {
    requestBody.children = markdownToNotionBlocks(bodyMarkdown);
  }

  const resp = await fetch(`${NOTION_API}/pages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${notionToken}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Notion create page failed: ${resp.status} ${errText.slice(0, 500)}`);
  }

  const page = (await resp.json()) as { id: string; url: string };
  return { pageId: page.id, url: page.url };
}

/**
 * Helpers para construir properties con menos boilerplate.
 *
 * Uso:
 *   properties: {
 *     ...titleProp("Idea", "Mi título"),
 *     ...selectProp("Status", "Nueva"),
 *     ...textProp("Notas", "Detalles"),
 *     ...urlProp("Link", "https://..."),
 *     ...numberProp("Score", 85),
 *     ...dateProp("Fecha", new Date()),
 *   }
 */
export function titleProp(name: string, value: string): Record<string, any> {
  return { [name]: { title: [{ type: "text", text: { content: value.slice(0, 2000) } }] } };
}

export function selectProp(name: string, value: string): Record<string, any> {
  return { [name]: { select: { name: value } } };
}

export function textProp(name: string, value: string): Record<string, any> {
  return {
    [name]: { rich_text: [{ type: "text", text: { content: value.slice(0, 2000) } }] },
  };
}

export function urlProp(name: string, value: string): Record<string, any> {
  return { [name]: { url: value } };
}

export function numberProp(name: string, value: number): Record<string, any> {
  return { [name]: { number: value } };
}

export function dateProp(name: string, value: Date | string): Record<string, any> {
  const iso = value instanceof Date ? value.toISOString() : value;
  return { [name]: { date: { start: iso } } };
}

export function multiSelectProp(name: string, values: string[]): Record<string, any> {
  return { [name]: { multi_select: values.map((v) => ({ name: v })) } };
}

// ─────────────────────────────────────────────────────────────────────
// Markdown → Notion blocks (minimal, sin dependencies)
// Soporta: H1/H2/H3, párrafos, listas con "- ", dividers "---"
// ─────────────────────────────────────────────────────────────────────

export function markdownToNotionBlocks(md: string): any[] {
  const lines = md.split("\n");
  const blocks: any[] = [];
  const truncate = (s: string) => s.slice(0, 2000);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("# ")) {
      blocks.push({
        object: "block",
        type: "heading_1",
        heading_1: {
          rich_text: [{ type: "text", text: { content: truncate(trimmed.slice(2)) } }],
        },
      });
    } else if (trimmed.startsWith("## ")) {
      blocks.push({
        object: "block",
        type: "heading_2",
        heading_2: {
          rich_text: [{ type: "text", text: { content: truncate(trimmed.slice(3)) } }],
        },
      });
    } else if (trimmed.startsWith("### ")) {
      blocks.push({
        object: "block",
        type: "heading_3",
        heading_3: {
          rich_text: [{ type: "text", text: { content: truncate(trimmed.slice(4)) } }],
        },
      });
    } else if (trimmed.startsWith("- ")) {
      blocks.push({
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [{ type: "text", text: { content: truncate(trimmed.slice(2)) } }],
        },
      });
    } else if (trimmed === "---") {
      blocks.push({ object: "block", type: "divider", divider: {} });
    } else {
      blocks.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [{ type: "text", text: { content: truncate(trimmed) } }],
        },
      });
    }
  }

  return blocks;
}
