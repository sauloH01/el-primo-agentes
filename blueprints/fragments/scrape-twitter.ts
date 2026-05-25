/**
 * Fragment: scrapear tweets recientes de cuentas o búsquedas en Twitter/X
 *
 * Usa Apify actor: `scrape.badger/twitter-tweets-scraper` ($0.0002/tweet)
 *
 * Funciona en Cloudflare Workers (fetch nativo, sin SDK).
 *
 * Casos de uso típicos:
 *   - Tweets de N cuentas específicas en últimas 24h
 *   - Búsqueda por keywords en últimas X horas
 *   - Tendencias virales por engagement mínimo
 */

export type ScrapedTweet = {
  id: string;
  url: string;
  text: string;
  authorHandle: string;
  authorName: string;
  authorFollowers: number;
  likes: number;
  retweets: number;
  replies: number;
  createdAt: string;
};

/**
 * Scrapea tweets de una lista de cuentas (handles) en un rango de tiempo.
 *
 * @example
 *   await scrapeTweetsFromHandles({
 *     apifyToken: env.APIFY_TOKEN,
 *     handles: ["AnthropicAI", "OpenAI", "elonmusk"],
 *     hoursBack: 24,
 *     tweetsPerHandle: 30,
 *   });
 */
export async function scrapeTweetsFromHandles(opts: {
  apifyToken: string;
  handles: string[];           // sin @
  hoursBack: number;
  tweetsPerHandle?: number;    // default 30
  batchSize?: number;          // default 10 — agrupa N handles en 1 query OR
}): Promise<ScrapedTweet[]> {
  const { apifyToken, handles, hoursBack, tweetsPerHandle = 30, batchSize = 10 } = opts;

  // Twitter Advanced Search soporta `from:userA OR from:userB ...`
  // Limit query length ~512 chars → 10 handles por batch es seguro.
  const batches: string[][] = [];
  for (let i = 0; i < handles.length; i += batchSize) {
    batches.push(handles.slice(i, i + batchSize));
  }

  // Fecha desde la cual scrapear (formato: YYYY-MM-DD_HH:MM:SS)
  const startDate = new Date(Date.now() - hoursBack * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 19)
    .replace("T", "_");

  // Scrape cada batch en paralelo (resiliente — si uno falla, los demás siguen)
  const results = await Promise.allSettled(
    batches.map((batch) =>
      runApifyActor({
        apifyToken,
        actor: "scrape.badger/twitter-tweets-scraper",
        input: {
          mode: "Advanced Search",
          query: `(${batch.map((h) => `from:${h}`).join(" OR ")}) since:${startDate}`,
          query_type: "Latest",
          max_results: tweetsPerHandle * batch.length,
        },
      }),
    ),
  );

  // Combinar resultados (saltar batches fallados)
  const all: ScrapedTweet[] = [];
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const t of r.value) all.push(mapToScrapedTweet(t));
  }

  // Dedupe por tweet id
  const seen = new Set<string>();
  return all.filter((t) => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });
}

/**
 * Scrapea tweets que coincidan con una búsqueda (keywords, hashtag, etc).
 *
 * @example
 *   await scrapeTweetsBySearch({
 *     apifyToken: env.APIFY_TOKEN,
 *     query: "#claudecode min_faves:50 lang:en",
 *     maxTweets: 100,
 *   });
 */
export async function scrapeTweetsBySearch(opts: {
  apifyToken: string;
  query: string;          // sintaxis Twitter Advanced Search
  queryType?: "Top" | "Latest";
  maxTweets?: number;     // default 100
}): Promise<ScrapedTweet[]> {
  const { apifyToken, query, queryType = "Top", maxTweets = 100 } = opts;

  const items = await runApifyActor({
    apifyToken,
    actor: "scrape.badger/twitter-tweets-scraper",
    input: {
      mode: "Advanced Search",
      query,
      query_type: queryType,
      max_results: maxTweets,
    },
  });

  return items.map(mapToScrapedTweet);
}

// ─────────────────────────────────────────────────────────────────────
// Helpers internos
// ─────────────────────────────────────────────────────────────────────

async function runApifyActor(opts: {
  apifyToken: string;
  actor: string;
  input: Record<string, unknown>;
}): Promise<Array<Record<string, unknown>>> {
  const { apifyToken, actor, input } = opts;
  const actorId = actor.replace("/", "~"); // Apify URL usa ~ no /

  const url = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apifyToken}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!resp.ok) {
    throw new Error(`Apify ${actor} failed: ${resp.status} ${await resp.text()}`);
  }

  const json = await resp.json();
  return Array.isArray(json) ? json : [];
}

function mapToScrapedTweet(t: Record<string, unknown>): ScrapedTweet {
  return {
    id: String(t.id || ""),
    url: `https://x.com/${t.username}/status/${t.id}`,
    text: String(t.full_text || t.text || ""),
    authorHandle: String(t.username || ""),
    authorName: String(t.user_name || ""),
    authorFollowers: Number(t.user_followers_count || 0),
    likes: Number(t.favorite_count || 0),
    retweets: Number(t.retweet_count || 0),
    replies: Number(t.reply_count || 0),
    createdAt: String(t.created_at || ""),
  };
}
