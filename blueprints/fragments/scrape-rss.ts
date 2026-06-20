/**
 * Fragment: leer un feed RSS / Atom y devolver los items recientes.
 *
 * GRATIS — no requiere Apify ni ningún servicio externo. Solo `fetch` nativo.
 *
 * Funciona en Cloudflare Workers.
 *
 * Casos de uso:
 *   - Newsletters / blogs con RSS
 *   - Noticias de medios (NYT, BBC, etc — todos tienen RSS)
 *   - Releases de GitHub (cada repo tiene RSS de releases)
 *   - YouTube channels (cada canal tiene RSS de uploads)
 *   - Podcasts (RSS es el formato nativo)
 */

export type RssItem = {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  guid: string;
};

/**
 * Lee un RSS feed y devuelve los items más recientes.
 *
 * @example
 *   const items = await fetchRssFeed({
 *     url: "https://www.anthropic.com/rss.xml",
 *     hoursBack: 24,
 *   });
 */
export async function fetchRssFeed(opts: {
  url: string;
  hoursBack?: number;     // default 24 — solo items publicados en últimas N horas
  maxItems?: number;       // default 50
}): Promise<RssItem[]> {
  const { url, hoursBack = 24, maxItems = 50 } = opts;

  const resp = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Agent RSS Reader)" },
  });
  if (!resp.ok) throw new Error(`RSS fetch failed: ${resp.status} ${url}`);

  const xml = await resp.text();
  const items = parseRssXml(xml).slice(0, maxItems);

  if (hoursBack) {
    const cutoff = Date.now() - hoursBack * 60 * 60 * 1000;
    return items.filter((item) => {
      const ts = parseDate(item.pubDate);
      return ts > cutoff;
    });
  }

  return items;
}

/**
 * Lee MÚLTIPLES feeds RSS en paralelo y combina los resultados.
 *
 * @example
 *   const items = await fetchMultipleFeeds({
 *     urls: [
 *       "https://www.anthropic.com/rss.xml",
 *       "https://blog.openai.com/rss",
 *       "https://platform.openai.com/blog/rss.xml",
 *     ],
 *     hoursBack: 24,
 *   });
 */
export async function fetchMultipleFeeds(opts: {
  urls: string[];
  hoursBack?: number;
  maxItemsPerFeed?: number;
}): Promise<Array<RssItem & { sourceUrl: string }>> {
  const { urls, hoursBack = 24, maxItemsPerFeed = 20 } = opts;

  const results = await Promise.allSettled(
    urls.map((url) =>
      fetchRssFeed({ url, hoursBack, maxItems: maxItemsPerFeed }).then((items) =>
        items.map((i) => ({ ...i, sourceUrl: url })),
      ),
    ),
  );

  const all: Array<RssItem & { sourceUrl: string }> = [];
  for (const r of results) {
    if (r.status === "fulfilled") all.push(...r.value);
  }

  // Ordenar por fecha (más reciente primero)
  return all.sort((a, b) => parseDate(b.pubDate) - parseDate(a.pubDate));
}

// ─────────────────────────────────────────────────────────────────────
// Parser RSS/Atom minimal — funciona sin dependencias en Workers
// ─────────────────────────────────────────────────────────────────────

function parseRssXml(xml: string): RssItem[] {
  // Detectar si es Atom o RSS
  const isAtom = xml.includes("<feed") && xml.includes("xmlns=\"http://www.w3.org/2005/Atom\"");

  if (isAtom) {
    return parseAtomFeed(xml);
  }
  return parseRssFeed(xml);
}

function parseRssFeed(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1] ?? "";
    items.push({
      title: extractTag(block, "title"),
      link: extractTag(block, "link"),
      description: extractTag(block, "description"),
      pubDate: extractTag(block, "pubDate") || extractTag(block, "dc:date"),
      guid: extractTag(block, "guid"),
    });
  }
  return items;
}

function parseAtomFeed(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const entryRegex = /<entry\b[^>]*>([\s\S]*?)<\/entry>/g;
  let match;
  while ((match = entryRegex.exec(xml)) !== null) {
    const block = match[1] ?? "";
    const linkMatch = block.match(/<link[^>]*href="([^"]+)"/);
    items.push({
      title: extractTag(block, "title"),
      link: linkMatch?.[1] ?? "",
      description: extractTag(block, "summary") || extractTag(block, "content"),
      pubDate: extractTag(block, "published") || extractTag(block, "updated"),
      guid: extractTag(block, "id"),
    });
  }
  return items;
}

function extractTag(block: string, tag: string): string {
  // Soporta <tag>text</tag> y <tag><![CDATA[text]]></tag>
  const regex = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const match = block.match(regex);
  if (!match) return "";
  const raw = match[1] ?? "";
  // Remove CDATA wrapper
  return raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
}

function parseDate(str: string): number {
  if (!str) return 0;
  const ts = Date.parse(str);
  return isNaN(ts) ? 0 : ts;
}
