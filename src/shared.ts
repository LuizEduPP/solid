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
  minDomainsFor100: number;
  maxScoreDelta: number;
  firstIterationCap: number;
  disconfirmThreshold: number;
}

export const MODE_THRESHOLDS: Record<ResearchMode, ModeThresholds> = {
  rigorous: {
    targetScore: 100,
    minIterations: 6,
    minDomainsFor100: 5,
    maxScoreDelta: 6,
    firstIterationCap: 40,
    disconfirmThreshold: 70,
  },
  fast: {
    targetScore: 85,
    minIterations: 3,
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
