import { loads } from "ai-json-repair";
import { z } from "zod";

import { extractCitedUrls, normalizeRubric } from "./scoring.js";
import type { EntityVerdict, EvidenceType, InvestigationQuality, ScoreRubric } from "../../shared.js";

export interface PlanPayload {
  queries: string[];
  angle: string;
  disconfirming: boolean;
}

export interface AnalysisPayload {
  iteration_findings: string;
  cumulative_synthesis: string;
  resolved_gaps: string[];
  open_gaps: string[];
  cited_urls: string[];
  score_rubric: ScoreRubric;
  score: number;
  score_delta: string;
  score_reasoning: string;
  contradiction_found: boolean;
  should_continue: boolean;
  stop_reason: string;
  next_variation: string;
  direct_entity_evidence: boolean;
  evidence_type: EvidenceType;
  disambiguation_notes: string;
}

const scoreRubricSchema = z
  .object({
    direct_evidence: z.coerce.number().optional(),
    source_diversity: z.coerce.number().optional(),
    gap_coverage: z.coerce.number().optional(),
    risk_contradiction: z.coerce.number().optional(),
  })
  .optional()
  .transform((raw) => normalizeRubric(raw));

const planSchema = z
  .object({
    queries: z.array(z.coerce.string()).optional(),
    angle: z.coerce.string().optional(),
    disconfirming: z.coerce.boolean().optional(),
  })
  .transform((payload) => ({
    queries: (payload.queries ?? []).filter(Boolean).slice(0, 2),
    angle: payload.angle ?? "",
    disconfirming: payload.disconfirming ?? false,
  }));

const evidenceTypeSchema = z
  .enum(["direct", "contextual", "none"])
  .catch("contextual");

const analysisSchema = z
  .object({
    iteration_findings: z.coerce.string().optional(),
    iterationFindings: z.coerce.string().optional(),
    cumulative_synthesis: z.coerce.string().optional(),
    cumulativeSynthesis: z.coerce.string().optional(),
    findings: z.coerce.string().optional(),
    resolved_gaps: z.array(z.coerce.string()).optional(),
    open_gaps: z.array(z.coerce.string()).optional(),
    gaps: z.array(z.coerce.string()).optional(),
    cited_urls: z.array(z.coerce.string()).optional(),
    score_rubric: scoreRubricSchema,
    score: z.coerce.number().optional(),
    confidence: z.coerce.number().optional(),
    score_delta: z.coerce.string().optional(),
    scoreDelta: z.coerce.string().optional(),
    score_reasoning: z.coerce.string().optional(),
    scoreReasoning: z.coerce.string().optional(),
    contradiction_found: z.coerce.boolean().optional(),
    contradictionFound: z.coerce.boolean().optional(),
    should_continue: z.coerce.boolean().optional(),
    shouldContinue: z.coerce.boolean().optional(),
    stop_reason: z.coerce.string().optional(),
    stopReason: z.coerce.string().optional(),
    next_variation: z.coerce.string().optional(),
    nextVariation: z.coerce.string().optional(),
    direct_entity_evidence: z.coerce.boolean().optional(),
    directEntityEvidence: z.coerce.boolean().optional(),
    evidence_type: evidenceTypeSchema.optional(),
    evidenceType: evidenceTypeSchema.optional(),
    disambiguation_notes: z.coerce.string().optional(),
    disambiguationNotes: z.coerce.string().optional(),
  })
  .transform((payload) => {
    const synthesis =
      payload.cumulative_synthesis ??
      payload.cumulativeSynthesis ??
      payload.findings ??
      "";
    const findings =
      payload.iteration_findings ?? payload.iterationFindings ?? synthesis;

    const evidenceType =
      payload.evidence_type ?? payload.evidenceType ?? "contextual";
    const directEntity =
      payload.direct_entity_evidence ??
      payload.directEntityEvidence ??
      evidenceType === "direct";

    return {
      iteration_findings: findings,
      cumulative_synthesis: synthesis,
      resolved_gaps: payload.resolved_gaps ?? [],
      open_gaps: payload.open_gaps ?? payload.gaps ?? [],
      cited_urls: payload.cited_urls ?? [],
      score_rubric: payload.score_rubric ?? normalizeRubric(undefined),
      score: payload.score ?? payload.confidence ?? 0,
      score_delta: payload.score_delta ?? payload.scoreDelta ?? "",
      score_reasoning: payload.score_reasoning ?? payload.scoreReasoning ?? "",
      contradiction_found:
        payload.contradiction_found ?? payload.contradictionFound ?? false,
      should_continue:
        payload.should_continue !== false && payload.shouldContinue !== false,
      stop_reason: payload.stop_reason ?? payload.stopReason ?? "",
      next_variation: payload.next_variation ?? payload.nextVariation ?? "",
      direct_entity_evidence: directEntity,
      evidence_type: evidenceType as EvidenceType,
      disambiguation_notes:
        payload.disambiguation_notes ?? payload.disambiguationNotes ?? "",
    };
  });

function normalizeLlmKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeLlmKeys);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => [
        key.replace(/\s+/g, ""),
        normalizeLlmKeys(val),
      ]),
    );
  }

  return value;
}

function isValidCitationUrl(url: string): boolean {
  if (!url.trim() || url.includes("...")) return false;

  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function parseLlmJson(raw: string): unknown {
  return normalizeLlmKeys(loads(raw));
}

export function parsePlanPayload(raw: string): PlanPayload {
  return planSchema.parse(parseLlmJson(raw));
}

export function parseAnalysisPayload(raw: string, knownUrls: string[]): AnalysisPayload {
  const parsed = analysisSchema.parse(parseLlmJson(raw));
  const cited_urls = [
    ...new Set([
      ...parsed.cited_urls.filter(isValidCitationUrl),
      ...extractCitedUrls(parsed.iteration_findings, knownUrls).filter(isValidCitationUrl),
      ...extractCitedUrls(parsed.cumulative_synthesis, knownUrls).filter(isValidCitationUrl),
    ]),
  ];

  return { ...parsed, cited_urls };
}

type ReflectionRecommendation = "continue" | "pivot" | "stop";

export interface ReflectionPayload {
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

const entityVerdictEnum = z.enum(["confirmed", "likely", "uncertain", "unlikely", "nonexistent"]);
const investigationQualityEnum = z.enum(["progressing", "stagnating", "circular", "exhausted"]);

const reflectionSchema = z
  .object({
    entity_verdict: entityVerdictEnum.optional(),
    entityVerdict: entityVerdictEnum.optional(),
    entity_confidence: z.coerce.number().optional(),
    entityConfidence: z.coerce.number().optional(),
    entity_reasoning: z.coerce.string().optional(),
    entityReasoning: z.coerce.string().optional(),
    investigation_quality: investigationQualityEnum.optional(),
    investigationQuality: investigationQualityEnum.optional(),
    quality_reasoning: z.coerce.string().optional(),
    qualityReasoning: z.coerce.string().optional(),
    recommendation: z.enum(["continue", "pivot", "stop"]).catch("continue"),
    recommendation_reasoning: z.coerce.string().optional(),
    recommendationReasoning: z.coerce.string().optional(),
    pivot_suggestion: z.coerce.string().optional(),
    pivotSuggestion: z.coerce.string().optional(),
    key_observations: z.array(z.coerce.string()).optional(),
    keyObservations: z.array(z.coerce.string()).optional(),
    should_continue: z.coerce.boolean().optional(),
    shouldContinue: z.coerce.boolean().optional(),
  })
  .transform((p) => {
    const verdict = p.entity_verdict ?? p.entityVerdict ?? "uncertain" as const;
    const recommendation = p.recommendation ?? "continue";
    const shouldContinue =
      p.should_continue ?? p.shouldContinue ?? recommendation !== "stop";

    return {
      entity_verdict: verdict,
      entity_confidence: Math.max(
        0,
        Math.min(100, p.entity_confidence ?? p.entityConfidence ?? 50),
      ),
      entity_reasoning: p.entity_reasoning ?? p.entityReasoning ?? "",
      investigation_quality:
        p.investigation_quality ?? p.investigationQuality ?? "progressing",
      quality_reasoning: p.quality_reasoning ?? p.qualityReasoning ?? "",
      recommendation,
      recommendation_reasoning:
        p.recommendation_reasoning ?? p.recommendationReasoning ?? "",
      pivot_suggestion: p.pivot_suggestion ?? p.pivotSuggestion ?? "",
      key_observations: p.key_observations ?? p.keyObservations ?? [],
      should_continue: shouldContinue,
    } satisfies ReflectionPayload;
  });

export function parseReflectionPayload(raw: string): ReflectionPayload {
  return reflectionSchema.parse(parseLlmJson(raw));
}
