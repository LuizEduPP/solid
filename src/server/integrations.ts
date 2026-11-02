import {
  braveSearchEndpoint,
  DEFAULT_INTEGRATION_ENDPOINTS,
  exaSearchEndpoint,
  firecrawlEndpoint,
  jinaReadUrl,
  scrapeProviderNeedsKey,
  searchProviderEndpoint,
  searchProviderNeedsKey,
  searxngSearchUrl,
  tavilySearchEndpoint,
  type IntegrationRuntime,
  type ScrapeProvider,
  type SearchProvider,
} from "../shared.js";

export interface ProviderHit {
  title: string;
  url: string;
  snippet: string;
}

const PROVIDER_TIMEOUT_MS = 12_000;
const MAX_SNIPPET = 500;

export interface ProviderSearchResult {
  hits: ProviderHit[];
  provider: SearchProvider;
}

function isValidUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

function snippetOf(...parts: Array<string | undefined>): string {
  return parts.find((part) => part?.trim())?.trim().slice(0, MAX_SNIPPET) ?? "";
}

export function mapProviderHits(
  items: Array<{ title?: string; url?: string; snippet?: string }>,
  maxResults: number,
): ProviderHit[] {
  return items.slice(0, maxResults).flatMap((item) => {
    const url = item.url?.trim() ?? "";
    if (!isValidUrl(url)) return [];
    return [
      {
        title: item.title?.trim() ?? "",
        url,
        snippet: item.snippet?.trim() ?? "",
      },
    ];
  });
}

async function fetchJson(
  url: string,
  init: RequestInit,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(`Provider returned ${response.status}`);
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(
  url: string,
  init: RequestInit,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Provider returned ${response.status}`);
    }
    return response.text();
  } finally {
    clearTimeout(timer);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function endpointsOf(runtime: IntegrationRuntime) {
  return runtime.endpoints ?? DEFAULT_INTEGRATION_ENDPOINTS;
}

function authHeaders(apiKey: string, extra: Record<string, string> = {}): Record<string, string> {
  if (!apiKey) return extra;
  return { ...extra, Authorization: `Bearer ${apiKey}` };
}

async function searchExa(
  query: string,
  maxResults: number,
  apiKey: string,
  baseUrl: string,
): Promise<ProviderHit[]> {
  const payload = asRecord(
    await fetchJson(exaSearchEndpoint(baseUrl), {
      method: "POST",
      headers: authHeaders(apiKey, { "Content-Type": "application/json" }),
      body: JSON.stringify({
        query,
        numResults: maxResults,
        type: "auto",
        contents: { text: { maxCharacters: MAX_SNIPPET } },
      }),
    }),
  );

  return mapProviderHits(
    asArray(payload.results).map((item) => {
      const row = asRecord(item);
      return {
        title: String(row.title ?? ""),
        url: String(row.url ?? ""),
        snippet: snippetOf(
          typeof row.text === "string" ? row.text : undefined,
          typeof row.summary === "string" ? row.summary : undefined,
        ),
      };
    }),
    maxResults,
  );
}

async function searchTavily(
  query: string,
  maxResults: number,
  apiKey: string,
  baseUrl: string,
): Promise<ProviderHit[]> {
  const payload = asRecord(
    await fetchJson(tavilySearchEndpoint(baseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: maxResults,
        search_depth: "advanced",
        include_answer: false,
      }),
    }),
  );

  return mapProviderHits(
    asArray(payload.results).map((item) => {
      const row = asRecord(item);
      return {
        title: String(row.title ?? ""),
        url: String(row.url ?? ""),
        snippet: snippetOf(
          typeof row.content === "string" ? row.content : undefined,
        ),
      };
    }),
    maxResults,
  );
}

async function searchBrave(
  query: string,
  maxResults: number,
  apiKey: string,
  baseUrl: string,
): Promise<ProviderHit[]> {
  const url = new URL(braveSearchEndpoint(baseUrl));
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(maxResults));

  const payload = asRecord(
    await fetchJson(url.toString(), {
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": apiKey,
      },
    }),
  );

  const web = asRecord(payload.web);
  return mapProviderHits(
    asArray(web.results).map((item) => {
      const row = asRecord(item);
      return {
        title: String(row.title ?? ""),
        url: String(row.url ?? ""),
        snippet: snippetOf(
          typeof row.description === "string" ? row.description : undefined,
        ),
      };
    }),
    maxResults,
  );
}

async function searchSearxng(
  query: string,
  maxResults: number,
  apiKey: string,
  baseUrl: string,
): Promise<ProviderHit[]> {
  const payload = asRecord(
    await fetchJson(searxngSearchUrl(baseUrl, query), {
      headers: authHeaders(apiKey, {
        Accept: "application/json",
        "User-Agent": "Solid/1.0 (+research)",
      }),
    }),
  );

  return mapProviderHits(
    asArray(payload.results).map((item) => {
      const row = asRecord(item);
      return {
        title: String(row.title ?? ""),
        url: String(row.url ?? ""),
        snippet: snippetOf(
          typeof row.content === "string" ? row.content : undefined,
        ),
      };
    }),
    maxResults,
  );
}

async function searchFirecrawl(
  query: string,
  maxResults: number,
  apiKey: string,
  baseUrl: string,
): Promise<ProviderHit[]> {
  const payload = asRecord(
    await fetchJson(firecrawlEndpoint(baseUrl, "search"), {
      method: "POST",
      headers: authHeaders(apiKey, { "Content-Type": "application/json" }),
      body: JSON.stringify({ query, limit: maxResults }),
    }),
  );

  return mapProviderHits(
    asArray(payload.data).map((item) => {
      const row = asRecord(item);
      return {
        title: String(row.title ?? ""),
        url: String(row.url ?? ""),
        snippet: snippetOf(
          typeof row.description === "string" ? row.description : undefined,
          typeof row.markdown === "string" ? row.markdown : undefined,
        ),
      };
    }),
    maxResults,
  );
}

export function requiredSearchKey(
  provider: SearchProvider,
  keys: IntegrationRuntime["keys"],
): string {
  if (provider === "exa") return keys.exa.trim();
  if (provider === "tavily") return keys.tavily.trim();
  if (provider === "brave") return keys.brave.trim();
  if (provider === "firecrawl") return keys.firecrawl.trim();
  if (provider === "searxng") return keys.searxng.trim();
  return "";
}

export async function searchWithProvider(
  query: string,
  maxResults: number,
  runtime: IntegrationRuntime,
): Promise<ProviderSearchResult> {
  const provider = runtime.searchProvider;
  const key = requiredSearchKey(provider, runtime.keys);
  const endpoints = endpointsOf(runtime);
  const endpoint = searchProviderEndpoint(provider, endpoints);

  if (searchProviderNeedsKey(provider, endpoint) && !key) {
    throw new Error(`Missing API key for ${provider}`);
  }

  let hits: ProviderHit[];
  if (provider === "exa") hits = await searchExa(query, maxResults, key, endpoints.exa);
  else if (provider === "tavily") hits = await searchTavily(query, maxResults, key, endpoints.tavily);
  else if (provider === "brave") hits = await searchBrave(query, maxResults, key, endpoints.brave);
  else if (provider === "firecrawl") {
    hits = await searchFirecrawl(query, maxResults, key, endpoints.firecrawl);
  } else if (provider === "searxng") {
    hits = await searchSearxng(query, maxResults, key, endpoints.searxng);
  } else {
    throw new Error("Unsupported search provider");
  }

  if (hits.length === 0) {
    throw new Error(`${provider} returned no valid results`);
  }

  return { hits, provider };
}

async function scrapeFirecrawl(
  url: string,
  apiKey: string,
  baseUrl: string,
): Promise<string | null> {
  const payload = asRecord(
    await fetchJson(firecrawlEndpoint(baseUrl, "scrape"), {
      method: "POST",
      headers: authHeaders(apiKey, { "Content-Type": "application/json" }),
      body: JSON.stringify({ url, formats: ["markdown"] }),
    }),
  );
  const data = asRecord(payload.data);
  const markdown = typeof data.markdown === "string" ? data.markdown.trim() : "";
  return markdown.length > 0 ? markdown : null;
}

async function scrapeJina(
  url: string,
  apiKey: string,
  baseUrl: string,
): Promise<string | null> {
  const text = (
    await fetchText(jinaReadUrl(baseUrl, url), {
      headers: authHeaders(apiKey, {
        Accept: "text/plain",
        "X-Return-Format": "text",
      }),
    })
  ).trim();
  return text.length > 0 ? text : null;
}

export async function scrapeWithProvider(
  url: string,
  provider: ScrapeProvider,
  runtime: IntegrationRuntime,
): Promise<string | null> {
  const endpoints = endpointsOf(runtime);
  if (provider === "firecrawl") {
    const key = runtime.keys.firecrawl.trim();
    if (scrapeProviderNeedsKey(provider, endpoints.firecrawl) && !key) {
      throw new Error("Missing API key for firecrawl");
    }
    return scrapeFirecrawl(url, key, endpoints.firecrawl);
  }
  if (provider === "jina") {
    return scrapeJina(url, runtime.keys.jina.trim(), endpoints.jina);
  }
  return null;
}
