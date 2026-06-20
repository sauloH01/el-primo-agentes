/**
 * Fragment: leer el contenido de una página web (HTML) y extraer texto.
 *
 * GRATIS para sitios públicos sencillos — usa fetch nativo.
 *
 * Para sitios con anti-bot, JavaScript pesado, o que requieren login,
 * usar el actor de Apify `apify/website-content-crawler` en su lugar.
 *
 * Funciona en Cloudflare Workers.
 */

export type ScrapedPage = {
  url: string;
  title: string;
  textContent: string;
  metaDescription: string;
  fetchedAt: string;
};

/**
 * Scrapea UN sitio web público.
 *
 * @example
 *   const page = await scrapeWebsite({ url: "https://example.com/blog/article" });
 *   console.log(page.title, page.textContent.slice(0, 500));
 */
export async function scrapeWebsite(opts: {
  url: string;
  timeoutMs?: number;        // default 15s
  userAgent?: string;
}): Promise<ScrapedPage> {
  const {
    url,
    timeoutMs = 15000,
    userAgent = "Mozilla/5.0 (Cloudflare Worker Agent)",
  } = opts;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let html: string;
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": userAgent,
        "Accept": "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
    });
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
    }
    html = await resp.text();
  } finally {
    clearTimeout(timeout);
  }

  return {
    url,
    title: extractTitle(html),
    textContent: extractText(html).slice(0, 50000), // cap 50K chars
    metaDescription: extractMetaDescription(html),
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Scrapea MÚLTIPLES sitios en paralelo.
 *
 * @example
 *   const pages = await scrapeMultipleSites({
 *     urls: ["https://anthropic.com/news/...", "https://openai.com/blog/..."],
 *   });
 */
export async function scrapeMultipleSites(opts: {
  urls: string[];
  timeoutMs?: number;
  concurrency?: number;       // default 5
}): Promise<ScrapedPage[]> {
  const { urls, timeoutMs = 15000, concurrency = 5 } = opts;

  const results: ScrapedPage[] = [];
  const chunks: string[][] = [];
  for (let i = 0; i < urls.length; i += concurrency) {
    chunks.push(urls.slice(i, i + concurrency));
  }

  for (const chunk of chunks) {
    const settled = await Promise.allSettled(
      chunk.map((url) => scrapeWebsite({ url, timeoutMs })),
    );
    for (const s of settled) {
      if (s.status === "fulfilled") results.push(s.value);
    }
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────
// Helpers de extracción — minimal HTML parsing sin DOMParser
// ─────────────────────────────────────────────────────────────────────

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return decodeEntities(match?.[1]?.trim() ?? "");
}

function extractMetaDescription(html: string): string {
  // <meta name="description" content="..."> o <meta property="og:description" ...>
  const patterns = [
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i,
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decodeEntities(m[1]);
  }
  return "";
}

function extractText(html: string): string {
  // Remove scripts, styles, comments
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  // Reemplazar tags por espacios para separar palabras
  text = text.replace(/<[^>]+>/g, " ");

  // Decode HTML entities + collapse whitespace
  text = decodeEntities(text);
  text = text.replace(/\s+/g, " ").trim();

  return text;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}
