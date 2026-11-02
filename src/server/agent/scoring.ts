import { RUBRIC_MAX, rubricTotal, type ScoreRubric } from "../../shared.js";

const PROPOSED_WEIGHT = 0.55;
const RUBRIC_WEIGHT = 0.45;

const STOPWORDS = new Set([
  "about",
  "after",
  "also",
  "and",
  "are",
  "been",
  "como",
  "com",
  "das",
  "dos",
  "does",
  "for",
  "from",
  "have",
  "how",
  "into",
  "para",
  "por",
  "quais",
  "qual",
  "que",
  "that",
  "the",
  "this",
  "uma",
  "uns",
  "what",
  "when",
  "which",
  "with",
  "une",
  "des",
  "les",
  "und",
  "der",
  "die",
  "das",
  "con",
  "una",
]);

export function normalizeRubric(
  raw: Partial<ScoreRubric> | undefined,
): ScoreRubric {
  const clamp = (value: unknown) =>
    Math.max(0, Math.min(RUBRIC_MAX, Number(value) || 0));

  return {
    direct_evidence: clamp(raw?.direct_evidence),
    source_diversity: clamp(raw?.source_diversity),
    gap_coverage: clamp(raw?.gap_coverage),
    risk_contradiction: clamp(raw?.risk_contradiction),
  };
}

function clampScore(value: number, minScore: number): number {
  return Math.max(minScore, Math.min(100, value));
}

export function applyCumulativeScore(
  previous: number | null,
  proposed: number,
  rubric: ScoreRubric,
  minScore: number,
): number {
  const rubricScore = rubricTotal(rubric);
  const blended =
    previous === null
      ? proposed
      : proposed * PROPOSED_WEIGHT + rubricScore * RUBRIC_WEIGHT;
  return clampScore(blended, minScore);
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

export function distinctiveTerms(text: string): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const raw of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < 4 || STOPWORDS.has(raw) || seen.has(raw)) continue;
    seen.add(raw);
    terms.push(raw);
  }
  return terms;
}

export function objectiveCoverage(objective: string, text: string): number {
  const terms = distinctiveTerms(objective);
  if (terms.length === 0) return 1;
  const haystack = text.toLowerCase();
  const hits = terms.filter((term) => haystack.includes(term)).length;
  return hits / terms.length;
}

export function anchorQueryToObjective(
  query: string,
  objective: string,
): string {
  const terms = distinctiveTerms(objective);
  if (terms.length === 0) return query;
  const lower = query.toLowerCase();
  if (terms.some((term) => lower.includes(term))) return query;
  return `${terms[0]} ${query}`.trim();
}
