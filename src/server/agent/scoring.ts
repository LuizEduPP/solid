import {
	countUniqueHostnames,
	type ModeThresholds,
	RUBRIC_MAX,
	rubricTotal,
	type ScoreRubric,
} from "../../shared.js";

const HIGH_SCORE_MIN_CITED_DOMAINS = 3;
const HIGH_SCORE_CAP_WITHOUT_DOMAINS = 90;

const PROPOSED_WEIGHT = 0.55;
const RUBRIC_WEIGHT = 0.45;
const MAX_DROP_WITH_CONTRADICTION = 15;
const MAX_DROP_WITHOUT_CONTRADICTION = 5;

const DOMAIN_WEIGHT = 5;
const DOMAIN_CAP = 35;
const CITATION_WEIGHT = 4;
const CITATION_CAP = 25;
const ITERATION_WEIGHT = 3;
const ITERATION_CAP = 20;
const GAP_PENALTY_WEIGHT = 8;
const GAP_PENALTY_CAP = 40;

const ENTITY_CONFIDENCE_THRESHOLD = 50;
const ENTITY_CONFIDENCE_FLOOR = 20;

const MIN_INDEPENDENT_SOURCES = 2;
const SCORE_CAP_WITHOUT_AGREEMENT = 70;
const MIN_OBJECTIVE_COVERAGE = 0.4;
const SCORE_CAP_LOW_COVERAGE = 70;
const HEDGE_FREE_COUNT = 2;
const HEDGE_PENALTY_PER_EXTRA = 4;
const HEDGE_PENALTY_CAP = 12;

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
	"para",
]);

const HEDGE_MARKERS = [
	"maybe",
	"perhaps",
	"unclear",
	"uncertain",
	"possibly",
	"unverified",
	"inconclusive",
	"unknown whether",
	"could not find",
	"no direct evidence",
	"talvez",
	"possivelmente",
	"incerto",
	"aparentemente",
	"não verificado",
	"nao verificado",
	"inconclusivo",
	"não foi possível",
	"nao foi possivel",
	"quizás",
	"posiblemente",
	"incierto",
	"peut-être",
	"possiblement",
	"incertain",
	"möglicherweise",
	"unklar",
	"unsicher",
	"forse",
	"possibilmente",
];

export const EVIDENCE_SCORE_HEADROOM = 8;
export const OPEN_GAP_SCORE_CAP = 94;

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
	options: {
		contradictionFound: boolean;
		minScore: number;
		maxDelta: number;
		firstIterationCap: number;
		isFirstIteration: boolean;
	},
): number {
	const rubricScore = rubricTotal(rubric);
	const blended =
		previous === null
			? proposed
			: proposed * PROPOSED_WEIGHT + rubricScore * RUBRIC_WEIGHT;
	let next = clampScore(blended, options.minScore);

	if (options.isFirstIteration) {
		next = Math.min(next, options.firstIterationCap);
	}

	if (previous === null) return next;

	if (next > previous) {
		next = Math.min(next, previous + options.maxDelta);
	} else if (next < previous) {
		const maxDrop = options.contradictionFound
			? MAX_DROP_WITH_CONTRADICTION
			: MAX_DROP_WITHOUT_CONTRADICTION;
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
	const domainPart = Math.min(DOMAIN_CAP, uniqueDomainCount * DOMAIN_WEIGHT);
	const citationPart = Math.min(CITATION_CAP, citedUrlCount * CITATION_WEIGHT);
	const iterationPart = Math.min(
		ITERATION_CAP,
		iterationCount * ITERATION_WEIGHT,
	);
	const gapPenalty = Math.min(
		GAP_PENALTY_CAP,
		openGapCount * GAP_PENALTY_WEIGHT,
	);
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
	if (entityConfidence >= ENTITY_CONFIDENCE_THRESHOLD) return score;
	const cap = Math.max(ENTITY_CONFIDENCE_FLOOR, entityConfidence);
	return Math.min(score, cap);
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

export function capScoreForIndependentSources(
	score: number,
	citedUrls: string[],
): number {
	if (countUniqueHostnames(citedUrls) >= MIN_INDEPENDENT_SOURCES) return score;
	return Math.min(score, SCORE_CAP_WITHOUT_AGREEMENT);
}

export function hedgePenalty(text: string): number {
	const lower = text.toLowerCase();
	let count = 0;
	for (const marker of HEDGE_MARKERS) {
		let from = 0;
		while (from < lower.length) {
			const idx = lower.indexOf(marker, from);
			if (idx < 0) break;
			count += 1;
			from = idx + marker.length;
		}
	}
	if (count <= HEDGE_FREE_COUNT) return 0;
	return Math.min(
		HEDGE_PENALTY_CAP,
		(count - HEDGE_FREE_COUNT) * HEDGE_PENALTY_PER_EXTRA,
	);
}

export function objectiveCoverage(objective: string, text: string): number {
	const terms = distinctiveTerms(objective);
	if (terms.length === 0) return 1;
	const haystack = text.toLowerCase();
	const hits = terms.filter((term) => haystack.includes(term)).length;
	return hits / terms.length;
}

export function capScoreForObjectiveCoverage(
	score: number,
	coverage: number,
): number {
	if (coverage >= MIN_OBJECTIVE_COVERAGE) return score;
	return Math.min(score, SCORE_CAP_LOW_COVERAGE);
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
