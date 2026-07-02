import { search } from "duck-duck-scrape";

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

export async function searchWeb(
  query: string,
  maxResults: number,
): Promise<SearchHit[]> {
  const response = await search(query);
  return response.results.slice(0, maxResults).flatMap((item) => {
    if (!item.url) return [];
    return [
      {
        title: item.title ?? "",
        url: item.url,
        snippet: item.description ?? item.rawDescription ?? "",
      },
    ];
  });
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
