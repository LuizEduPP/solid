import { DDGS, RatelimitError } from "@phukon/duckduckgo-search";

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchWebResult {
  hits: SearchHit[];
  error?: string;
}

const ddgs = new DDGS();
const MIN_GAP_MS = 2_500;
const MAX_RETRIES = 5;
const BACKENDS = ["lite", "html"] as const;

let lastSearchAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function searchRegion(query: string): string {
  return /[áàâãéêíóôõúç]|\b(brasil|brasileir|constru)/i.test(query)
    ? "br-pt"
    : "wt-wt";
}

function isValidUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

function isRateLimitError(error: Error): boolean {
  if (error instanceof RatelimitError) return true;
  return /\bratelimit\b|\b202\b|\b403\b/i.test(error.message);
}

export function simplifyQuery(query: string): string {
  const normalized = query
    .trim()
    .replace(/[?!.;,:]+$/g, "")
    .replace(
      /^(quais são os|quais são|quais|existem|como|what are the|what is|what|which|how do|how does|how|are there|is there|does|do)\s+/i,
      "",
    );

  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length <= 8) return "";
  return words.slice(0, 8).join(" ");
}

function queryVariants(query: string): string[] {
  const trimmed = query.trim();
  const simplified = simplifyQuery(trimmed);
  return simplified && simplified !== trimmed
    ? [trimmed, simplified]
    : [trimmed];
}

function pickSearchParams(
  query: string,
  attempt: number,
): { keywords: string; region: string; backend: (typeof BACKENDS)[number] } {
  const variants = queryVariants(query);
  const keywords = variants[Math.min(attempt, variants.length - 1)]!;
  const primaryRegion = searchRegion(query);
  const region =
    attempt >= 2 && primaryRegion !== "wt-wt" ? "wt-wt" : primaryRegion;
  const backend = BACKENDS[attempt % BACKENDS.length]!;

  return { keywords, region, backend };
}

async function throttle(): Promise<void> {
  const wait = lastSearchAt + MIN_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastSearchAt = Date.now();
}

function mapHits(
  results: Array<{ title?: string; href?: string; body?: string }>,
  maxResults: number,
): SearchHit[] {
  return results.slice(0, maxResults).flatMap((item) => {
    const url = item.href?.trim() ?? "";
    if (!isValidUrl(url)) return [];
    return [
      {
        title: item.title?.trim() ?? "",
        url,
        snippet: item.body?.trim() ?? "",
      },
    ];
  });
}

function retryDelayMs(error: Error, attempt: number): number {
  if (isRateLimitError(error)) return 5_000 + attempt * 4_000;
  return 2_000 + attempt * 1_000;
}

export async function searchWeb(
  query: string,
  maxResults: number,
): Promise<SearchWebResult> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    await throttle();

    const { keywords, region, backend } = pickSearchParams(query, attempt);

    try {
      const results = await ddgs.text({
        keywords,
        maxResults,
        region,
        backend,
      });

      const hits = mapHits(results, maxResults);
      if (hits.length > 0) {
        return { hits };
      }

      lastError = new Error("No valid results returned");
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }

    if (attempt === MAX_RETRIES - 1) break;
    await sleep(retryDelayMs(lastError, attempt));
  }

  return {
    hits: [],
    error: lastError?.message ?? "Search failed",
  };
}

export function formatHits(hits: SearchHit[]): string {
  if (hits.length === 0) return "(no results)";

  return hits
    .map(
      (hit, index) =>
        `[${index + 1}] ${hit.title}\nURL: ${hit.url}\n${hit.snippet}`.trim(),
    )
    .join("\n\n");
}
