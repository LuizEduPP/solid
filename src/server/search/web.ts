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
const EXTRA_DELAY_MS = 1_000;
const MAX_RETRIES = 3;

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

async function throttle(): Promise<void> {
  const wait = lastSearchAt + EXTRA_DELAY_MS - Date.now();
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

export async function searchWeb(
  query: string,
  maxResults: number,
): Promise<SearchWebResult> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    await throttle();

    try {
      const results = await ddgs.text({
        keywords: query,
        maxResults,
        region: searchRegion(query),
        backend: "auto",
      });

      const hits = mapHits(results, maxResults);
      if (hits.length > 0 || attempt === MAX_RETRIES - 1) {
        return { hits };
      }

      lastError = new Error("No valid results returned");
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (!(error instanceof RatelimitError) || attempt === MAX_RETRIES - 1) {
        break;
      }

      await sleep(4_000 * (attempt + 1));
    }
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
