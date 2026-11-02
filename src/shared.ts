export type ResearchMode = "rigorous" | "fast";

export interface ScoreRubric {
  direct_evidence: number;
  source_diversity: number;
  gap_coverage: number;
  risk_contradiction: number;
}

export interface ModeThresholds {
  targetScore: number;
  minIterations: number;
  maxIterations: number;
  maxLlmCalls: number;
  minDomainsFor100: number;
  maxScoreDelta: number;
  firstIterationCap: number;
  disconfirmThreshold: number;
}

export const MODE_THRESHOLDS: Record<ResearchMode, ModeThresholds> = {
  rigorous: {
    targetScore: 100,
    minIterations: 6,
    maxIterations: 8,
    maxLlmCalls: 36,
    minDomainsFor100: 5,
    maxScoreDelta: 6,
    firstIterationCap: 40,
    disconfirmThreshold: 70,
  },
  fast: {
    targetScore: 85,
    minIterations: 3,
    maxIterations: 4,
    maxLlmCalls: 18,
    minDomainsFor100: 3,
    maxScoreDelta: 12,
    firstIterationCap: 55,
    disconfirmThreshold: 80,
  },
};

export type EvidenceType = "direct" | "contextual" | "none";
export type EntityVerdict = "confirmed" | "likely" | "uncertain" | "unlikely" | "nonexistent";
export type InvestigationQuality = "progressing" | "stagnating" | "circular" | "exhausted";

export const EVIDENCE_COLORS: Record<EvidenceType, string> = {
  direct: "green",
  contextual: "yellow",
  none: "gray",
};

export const EVIDENCE_I18N: Record<EvidenceType, string> = {
  direct: "evidenceDirect",
  contextual: "evidenceContextual",
  none: "evidenceNone",
};

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
  "exa",
  "tavily",
  "brave",
  "firecrawl",
] as const;

export const SCRAPE_PROVIDERS = ["direct", "firecrawl", "jina"] as const;

export type SearchProvider = (typeof SEARCH_PROVIDERS)[number];
export type ScrapeProvider = (typeof SCRAPE_PROVIDERS)[number];

export interface IntegrationKeys {
  exa: string;
  tavily: string;
  brave: string;
  firecrawl: string;
  jina: string;
}

export interface IntegrationEndpoints {
  exa: string;
  tavily: string;
  brave: string;
  firecrawl: string;
  jina: string;
}

export interface IntegrationRuntime {
  searchProvider: SearchProvider;
  scrapeProvider: ScrapeProvider;
  keys: IntegrationKeys;
  endpoints: IntegrationEndpoints;
}

export const EMPTY_INTEGRATION_KEYS: IntegrationKeys = {
  exa: "",
  tavily: "",
  brave: "",
  firecrawl: "",
  jina: "",
};

export const DEFAULT_INTEGRATION_ENDPOINTS: IntegrationEndpoints = {
  exa: "https://api.exa.ai",
  tavily: "https://api.tavily.com",
  brave: "https://api.search.brave.com",
  firecrawl: "https://api.firecrawl.dev",
  jina: "https://r.jina.ai",
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

export function firecrawlEndpoint(base: string, action: "search" | "scrape"): string {
  const root = resolveProviderUrl(base, DEFAULT_INTEGRATION_ENDPOINTS.firecrawl);
  if (root.endsWith(`/v1/${action}`)) return root;
  if (root.endsWith("/v1")) return `${root}/${action}`;
  return `${root}/v1/${action}`;
}

export function exaSearchEndpoint(base: string): string {
  return joinUrl(resolveProviderUrl(base, DEFAULT_INTEGRATION_ENDPOINTS.exa), "/search");
}

export function tavilySearchEndpoint(base: string): string {
  return joinUrl(resolveProviderUrl(base, DEFAULT_INTEGRATION_ENDPOINTS.tavily), "/search");
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

export function normalizeIntegrationEndpoints(raw: unknown): IntegrationEndpoints {
  const value = raw && typeof raw === "object" ? (raw as Partial<IntegrationEndpoints>) : {};
  return {
    exa: typeof value.exa === "string" ? value.exa.trim() : DEFAULT_INTEGRATION_ENDPOINTS.exa,
    tavily: typeof value.tavily === "string" ? value.tavily.trim() : DEFAULT_INTEGRATION_ENDPOINTS.tavily,
    brave: typeof value.brave === "string" ? value.brave.trim() : DEFAULT_INTEGRATION_ENDPOINTS.brave,
    firecrawl:
      typeof value.firecrawl === "string"
        ? value.firecrawl.trim()
        : DEFAULT_INTEGRATION_ENDPOINTS.firecrawl,
    jina: typeof value.jina === "string" ? value.jina.trim() : DEFAULT_INTEGRATION_ENDPOINTS.jina,
  };
}

export function searchProviderNeedsKey(
  provider: SearchProvider,
  endpoint = "",
): boolean {
  if (provider === "duckduckgo") return false;
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
