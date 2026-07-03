import {
  countUniqueHostnames,
  rubricTotal,
  type ModeThresholds,
  type ScoreRubric,
} from "../../shared.js";

export const HIGH_SCORE_MIN_CITED_DOMAINS = 3;
export const HIGH_SCORE_CAP_WITHOUT_DOMAINS = 90;

export function capScoreForCitedDomains(
  score: number,
  citedUrls: string[],
  minDomains = HIGH_SCORE_MIN_CITED_DOMAINS,
  cap = HIGH_SCORE_CAP_WITHOUT_DOMAINS,
): number {
  if (score <= cap) return score;
  if (countUniqueHostnames(citedUrls) >= minDomains) return score;
  return Math.min(score, cap);
}

export function normalizeRubric(raw: Partial<ScoreRubric> | undefined): ScoreRubric {
  const clamp = (value: unknown) =>
    Math.max(0, Math.min(25, Number(value) || 0));

  return {
    direct_evidence: clamp(raw?.direct_evidence),
    source_diversity: clamp(raw?.source_diversity),
    gap_coverage: clamp(raw?.gap_coverage),
    risk_contradiction: clamp(raw?.risk_contradiction),
  };
}

export function clampScore(value: number, minScore: number): number {
  return Math.max(minScore, Math.min(100, value));
}

export function applyCumulativeScore(
  previous: number | null,
  proposed: number,
  rubric: ScoreRubric,
  options: {
    contradictionFound: boolean;
    minScore: number;
    maxDelta: number;
    firstIterationCap: number;
    isFirstIteration: boolean;
  },
): number {
  const rubricScore = rubricTotal(rubric);
  const blended = previous === null ? proposed : proposed * 0.55 + rubricScore * 0.45;
  let next = clampScore(blended, options.minScore);

  if (options.isFirstIteration) {
    next = Math.min(next, options.firstIterationCap);
  }

  if (previous === null) return next;

  if (next > previous) {
    next = Math.min(next, previous + options.maxDelta);
  } else if (next < previous) {
    const maxDrop = options.contradictionFound ? 15 : 5;
    next = Math.max(next, previous - maxDrop);
  }

  return clampScore(next, options.minScore);
}

export function computeEvidenceScore(
  uniqueDomainCount: number,
  citedUrlCount: number,
  iterationCount: number,
  openGapCount: number,
): number {
  const domainPart = Math.min(35, uniqueDomainCount * 5);
  const citationPart = Math.min(25, citedUrlCount * 4);
  const iterationPart = Math.min(20, iterationCount * 3);
  const gapPenalty = Math.min(40, openGapCount * 8);
  return clampScore(domainPart + citationPart + iterationPart - gapPenalty, 0);
}

export function canReachTargetScore(params: {
  score: number;
  targetScore: number;
  openGaps: string[];
  iteration: number;
  thresholds: ModeThresholds;
  uniqueDomainCount: number;
  hadDisconfirmingSearch: boolean;
}): { allowed: boolean; reason: string } {
  if (params.score < params.targetScore) {
    return { allowed: false, reason: "below target" };
  }

  if (params.openGaps.length > 0) {
    return {
      allowed: false,
      reason: `${params.openGaps.length} open gap(s)`,
    };
  }

  if (params.iteration < params.thresholds.minIterations) {
    return {
      allowed: false,
      reason: `minimum ${params.thresholds.minIterations} iterations`,
    };
  }

  if (params.uniqueDomainCount < params.thresholds.minDomainsFor100) {
    return {
      allowed: false,
      reason: `minimum ${params.thresholds.minDomainsFor100} unique domains`,
    };
  }

  if (!params.hadDisconfirmingSearch) {
    return {
      allowed: false,
      reason: "missing disconfirmation round",
    };
  }

  return { allowed: true, reason: "ok" };
}

export function extractCitedUrls(text: string, knownUrls: string[]): string[] {
  const cited = new Set<string>();
  for (const url of knownUrls) {
    if (text.includes(url)) cited.add(url);
  }
  const urlMatches = text.match(/https?:\/\/[^\s)\]>"]+/g) ?? [];
  for (const url of urlMatches) {
    cited.add(url.replace(/[.,;]+$/, ""));
  }
  return [...cited];
}

/**
 * Caps the solidness score based on entity confidence assessed by
 * the reflector LLM. When the reflector determines the target entity
 * likely doesn't exist, this prevents inflated scores.
 */
export function capScoreForEntityConfidence(
  score: number,
  entityConfidence: number,
): number {
  if (entityConfidence >= 50) return score;
  const cap = Math.max(20, entityConfidence);
  return Math.min(score, cap);
}
