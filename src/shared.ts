export type ResearchMode = "rigorous" | "fast";

export interface ScoreRubric {
  direct_evidence: number;
  source_diversity: number;
  gap_coverage: number;
  risk_contradiction: number;
}

export interface ModeThresholds {
  targetScore: number;
  maxIterations: number;
  maxLlmCalls: number;
}

export const MODE_THRESHOLDS: Record<ResearchMode, ModeThresholds> = {
  rigorous: {
    targetScore: 100,
    maxIterations: 8,
    maxLlmCalls: 36,
  },
  fast: {
    targetScore: 85,
    maxIterations: 4,
    maxLlmCalls: 18,
  },
};

export const EVIDENCE_TYPES = ["direct", "contextual", "none"] as const;
export const ENTITY_VERDICTS = [
  "confirmed",
  "likely",
  "uncertain",
  "unlikely",
  "nonexistent",
] as const;
export const INVESTIGATION_QUALITIES = [
  "progressing",
  "stagnating",
  "circular",
  "exhausted",
] as const;
export const REFLECTION_RECOMMENDATIONS = ["continue", "pivot", "stop"] as const;

export type EvidenceType = (typeof EVIDENCE_TYPES)[number];
export type EntityVerdict = (typeof ENTITY_VERDICTS)[number];
export type InvestigationQuality = (typeof INVESTIGATION_QUALITIES)[number];
export type ReflectionRecommendation = (typeof REFLECTION_RECOMMENDATIONS)[number];

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

export interface ReflectionSnapshot {
  entity_verdict: EntityVerdict;
  entity_confidence: number;
  entity_reasoning: string;
  investigation_quality: InvestigationQuality;
  quality_reasoning: string;
  recommendation: ReflectionRecommendation;
  recommendation_reasoning: string;
  pivot_suggestion: string;
  key_observations: string[];
  should_continue: boolean;
}

export const STREAM_MARKERS = [
  "STATUS",
  "SCORE",
  "REPORT",
  "ITER",
  "RUBRIC",
  "REFLECTION",
  "FOLLOWUP",
] as const;

export type StreamMarker = (typeof STREAM_MARKERS)[number];

export const STREAM_MARKER_RE = new RegExp(
  `@@(?:${STREAM_MARKERS.join("|")})@@\\n`,
);

export function streamToken(marker: StreamMarker): string {
  return `@@${marker}@@\n`;
}

export function streamChunk(marker: StreamMarker, content: string): string {
  return `${streamToken(marker)}${content}\n\n`;
}

export function appendStreamChunks(
  existing: string,
  parts: Array<readonly [StreamMarker, string]>,
): string {
  return `${existing}\n\n${parts.map(([marker, content]) => streamChunk(marker, content)).join("")}`;
}

export const EVIDENCE_COLORS: Record<EvidenceType, string> = {
  direct: "green",
  contextual: "yellow",
  none: "gray",
};

export type ScoreTone = "teal" | "yellow" | "red" | "gray";

export function scoreTone(score: number): ScoreTone {
  if (score <= 0) return "gray";
  if (score >= 70) return "teal";
  if (score >= 40) return "yellow";
  return "red";
}

export const EVIDENCE_I18N: Record<EvidenceType, string> = {
  direct: "evidenceDirect",
  contextual: "evidenceContextual",
  none: "evidenceNone",
};

export const VERDICT_I18N: Record<EntityVerdict, string> = {
  confirmed: "verdictConfirmed",
  likely: "verdictLikely",
  uncertain: "verdictUncertain",
  unlikely: "verdictUnlikely",
  nonexistent: "verdictNonexistent",
};

export const QUALITY_I18N: Record<InvestigationQuality, string> = {
  progressing: "qualityProgressing",
  stagnating: "qualityStagnating",
  circular: "qualityCircular",
  exhausted: "qualityExhausted",
};

export function isHttpUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

export function isLocalLlmBaseUrl(baseUrl: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(baseUrl.trim());
}

export function llmRequiresApiKey(apiKey: string, baseUrl: string): boolean {
  return !apiKey.trim() && !isLocalLlmBaseUrl(baseUrl);
}

export function mapSearchHits(
  items: Array<{ title?: string; url?: string; snippet?: string }>,
  maxResults: number,
): SearchHit[] {
  return items.slice(0, maxResults).flatMap((item) => {
    const url = item.url?.trim() ?? "";
    if (!isHttpUrl(url)) return [];
    return [
      {
        title: item.title?.trim() ?? "",
        url,
        snippet: item.snippet?.trim() ?? "",
      },
    ];
  });
}

export const SUPPORTED_LOCALES = [
  "en",
  "es",
  "pt-BR",
  "pt-PT",
  "fr",
  "de",
  "it",
] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const LOCALE_ENGLISH_NAMES: Record<Locale, string> = {
  en: "English",
  es: "Spanish",
  "pt-BR": "Brazilian Portuguese",
  "pt-PT": "European Portuguese",
  fr: "French",
  de: "German",
  it: "Italian",
};

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" &&
    (SUPPORTED_LOCALES as readonly string[]).includes(value)
  );
}

export function normalizeLocale(value: unknown): Locale {
  return isLocale(value) ? value : "en";
}

export const RUBRIC_MAX = 25;

export const RUBRIC_DIMENSIONS = [
  { key: "direct_evidence" as const, labelKey: "rubricEvidence", hintKey: "rubricEvidenceHint" },
  { key: "source_diversity" as const, labelKey: "rubricSources", hintKey: "rubricSourcesHint" },
  { key: "gap_coverage" as const, labelKey: "rubricGaps", hintKey: "rubricGapsHint" },
  { key: "risk_contradiction" as const, labelKey: "rubricRisks", hintKey: "rubricRisksHint" },
] as const;

export function rubricTotal(rubric: ScoreRubric): number {
  return (
    rubric.direct_evidence +
    rubric.source_diversity +
    rubric.gap_coverage +
    rubric.risk_contradiction
  );
}

export function tryHostname(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function hostnameFromUrl(url: string): string {
  return tryHostname(url) ?? url;
}

function uniqueHostnamesFromUrls(urls: string[]): string[] {
  const domains = new Set<string>();
  for (const url of urls) {
    const domain = tryHostname(url);
    if (domain) domains.add(domain);
  }
  return [...domains];
}

export function countUniqueHostnames(urls: string[]): number {
  return uniqueHostnamesFromUrls(urls).length;
}

export function uniqueHostnamesFromHits(hits: Array<{ url: string }>): string[] {
  return uniqueHostnamesFromUrls(hits.map((hit) => hit.url));
}

export function uniqueUrlsByHostname(urls: string[]): string[] {
  const seenHosts = new Set<string>();
  const out: string[] = [];

  for (const url of urls) {
    const host = tryHostname(url);
    if (!host || seenHosts.has(host)) continue;
    seenHosts.add(host);
    out.push(url);
  }

  return out;
}

export function groupUrlsByHostname(urls: string[]): Array<[string, string[]]> {
  const byHost = new Map<string, string[]>();
  for (const url of urls) {
    const host = tryHostname(url);
    if (!host) continue;
    const list = byHost.get(host);
    if (list) {
      if (!list.includes(url)) list.push(url);
    } else {
      byHost.set(host, [url]);
    }
  }
  return [...byHost.entries()];
}

export function faviconUrl(url: string): string {
  const hostname = hostnameFromUrl(url);
  return `/favicons/${encodeURIComponent(hostname)}`;
}

export const DEFAULT_FAVICON_URL = "/favicons/default";

export function isDefaultFaviconSrc(src: string): boolean {
  return src.includes(DEFAULT_FAVICON_URL);
}

export const SEARCH_PROVIDERS = [
  "duckduckgo",
  "searxng",
  "exa",
  "tavily",
  "brave",
  "firecrawl",
] as const;

export const SCRAPE_PROVIDERS = ["direct", "firecrawl", "jina"] as const;

export type SearchProvider = (typeof SEARCH_PROVIDERS)[number];
export type ScrapeProvider = (typeof SCRAPE_PROVIDERS)[number];

export const SEARCH_I18N: Record<SearchProvider, string> = {
  duckduckgo: "providerDuckDuckGo",
  searxng: "providerSearxng",
  exa: "providerExa",
  tavily: "providerTavily",
  brave: "providerBrave",
  firecrawl: "providerFirecrawl",
};

export const SCRAPE_I18N: Record<ScrapeProvider, string> = {
  direct: "providerDirect",
  firecrawl: "providerFirecrawl",
  jina: "providerJina",
};

export const INTEGRATION_FIELDS = [
  "exa",
  "tavily",
  "brave",
  "firecrawl",
  "jina",
  "searxng",
] as const;

export type IntegrationField = (typeof INTEGRATION_FIELDS)[number];
export type IntegrationRecord = Record<IntegrationField, string>;
export type IntegrationKeys = IntegrationRecord;
export type IntegrationEndpoints = IntegrationRecord;

export const SEARCH_INTEGRATION_FIELD: Partial<
  Record<SearchProvider, IntegrationField>
> = {
  exa: "exa",
  tavily: "tavily",
  brave: "brave",
  firecrawl: "firecrawl",
  searxng: "searxng",
};

export function integrationRecord(
  fill: string | ((field: IntegrationField) => string),
): IntegrationRecord {
  return Object.fromEntries(
    INTEGRATION_FIELDS.map((field) => [
      field,
      typeof fill === "function" ? fill(field) : fill,
    ]),
  ) as IntegrationRecord;
}

export interface IntegrationRuntime {
  searchProvider: SearchProvider;
  scrapeProvider: ScrapeProvider;
  keys: IntegrationKeys;
  endpoints: IntegrationEndpoints;
}

export const EMPTY_INTEGRATION_KEYS: IntegrationKeys = integrationRecord("");

export const DEFAULT_INTEGRATION_ENDPOINTS: IntegrationEndpoints = {
  exa: "https://api.exa.ai",
  tavily: "https://api.tavily.com",
  brave: "https://api.search.brave.com",
  firecrawl: "https://api.firecrawl.dev",
  jina: "https://r.jina.ai",
  searxng: "http://127.0.0.1:8080",
};

export const DEFAULT_INTEGRATIONS: IntegrationRuntime = {
  searchProvider: "duckduckgo",
  scrapeProvider: "direct",
  keys: EMPTY_INTEGRATION_KEYS,
  endpoints: { ...DEFAULT_INTEGRATION_ENDPOINTS },
};

export function stripTrailingSlash(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export function resolveProviderUrl(configured: string, fallback: string): string {
  return stripTrailingSlash(configured) || stripTrailingSlash(fallback);
}

export function joinUrl(base: string, path: string): string {
  const root = stripTrailingSlash(base);
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${root}${suffix}`;
}

export function usesCloudEndpoint(configured: string, cloudDefault: string): boolean {
  return resolveProviderUrl(configured, cloudDefault) === stripTrailingSlash(cloudDefault);
}

function resolvedJoin(base: string, fallback: string, path: string): string {
  return joinUrl(resolveProviderUrl(base, fallback), path);
}

export function firecrawlEndpoint(base: string, action: "search" | "scrape"): string {
  const root = resolveProviderUrl(base, DEFAULT_INTEGRATION_ENDPOINTS.firecrawl);
  if (root.endsWith(`/v1/${action}`)) return root;
  if (root.endsWith("/v1")) return `${root}/${action}`;
  return `${root}/v1/${action}`;
}

export function exaSearchEndpoint(base: string): string {
  return resolvedJoin(base, DEFAULT_INTEGRATION_ENDPOINTS.exa, "/search");
}

export function tavilySearchEndpoint(base: string): string {
  return resolvedJoin(base, DEFAULT_INTEGRATION_ENDPOINTS.tavily, "/search");
}

export function braveSearchEndpoint(base: string): string {
  const root = resolveProviderUrl(base, DEFAULT_INTEGRATION_ENDPOINTS.brave);
  if (root.includes("/res/v1/web/search")) return root.split("?")[0] ?? root;
  return joinUrl(root, "/res/v1/web/search");
}

export function jinaReadUrl(base: string, target: string): string {
  const root = resolveProviderUrl(base, DEFAULT_INTEGRATION_ENDPOINTS.jina);
  return `${root}/${target}`;
}

export function searxngSearchUrl(base: string, query: string): string {
  const root = resolveProviderUrl(base, DEFAULT_INTEGRATION_ENDPOINTS.searxng);
  const path = root.split("?")[0] ?? root;
  const endpoint = path.endsWith("/search") ? path : joinUrl(path, "/search");
  const url = new URL(endpoint);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  return url.toString();
}

export function searchProviderEndpoint(
  provider: SearchProvider,
  endpoints: IntegrationEndpoints,
): string {
  const field = SEARCH_INTEGRATION_FIELD[provider];
  return field ? endpoints[field] : "";
}

export function requiredSearchKey(
  provider: SearchProvider,
  keys: IntegrationKeys,
): string {
  const field = SEARCH_INTEGRATION_FIELD[provider];
  return field ? keys[field].trim() : "";
}

export function isSearchProvider(value: unknown): value is SearchProvider {
  return (
    typeof value === "string" &&
    (SEARCH_PROVIDERS as readonly string[]).includes(value)
  );
}

export function isScrapeProvider(value: unknown): value is ScrapeProvider {
  return (
    typeof value === "string" &&
    (SCRAPE_PROVIDERS as readonly string[]).includes(value)
  );
}

export function normalizeSearchProvider(value: unknown): SearchProvider {
  return isSearchProvider(value) ? value : "duckduckgo";
}

export function normalizeScrapeProvider(value: unknown): ScrapeProvider {
  return isScrapeProvider(value) ? value : "direct";
}

export function normalizeIntegrationRecord(
  raw: unknown,
  fallback: IntegrationRecord,
): IntegrationRecord {
  const value = raw && typeof raw === "object" ? (raw as Partial<IntegrationRecord>) : {};
  return integrationRecord((field) =>
    typeof value[field] === "string" ? value[field]!.trim() : fallback[field],
  );
}

export function normalizeIntegrationKeys(raw: unknown): IntegrationKeys {
  return normalizeIntegrationRecord(raw, EMPTY_INTEGRATION_KEYS);
}

export function normalizeIntegrationEndpoints(raw: unknown): IntegrationEndpoints {
  return normalizeIntegrationRecord(raw, DEFAULT_INTEGRATION_ENDPOINTS);
}

export function searchProviderNeedsKey(
  provider: SearchProvider,
  endpoint = "",
): boolean {
  if (provider === "duckduckgo" || provider === "searxng") return false;
  if (provider === "firecrawl") {
    return usesCloudEndpoint(endpoint, DEFAULT_INTEGRATION_ENDPOINTS.firecrawl);
  }
  return true;
}

export function scrapeProviderNeedsKey(
  provider: ScrapeProvider,
  endpoint = "",
): boolean {
  if (provider !== "firecrawl") return false;
  return usesCloudEndpoint(endpoint, DEFAULT_INTEGRATION_ENDPOINTS.firecrawl);
}

/** Prior research state for follow-up turns in the same session. */
export interface PriorResearchContext {
  rootObjective: string;
  followUp: string;
  cumulativeSynthesis: string;
  currentScore: number;
  report: string;
  openGaps: string[];
  priorQueries: string[];
  citedUrls: string[];
  uniqueDomainCount: number;
  iterationCount: number;
  hadDisconfirmingSearch: boolean;
}
