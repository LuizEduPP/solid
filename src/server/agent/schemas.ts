import { loads } from "ai-json-repair";
import { z } from "zod";

import { extractCitedUrls, normalizeRubric } from "./scoring.js";
import type { ScoreRubric } from "../../shared.js";

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
  })
  .transform((payload) => {
    const synthesis =
      payload.cumulative_synthesis ??
      payload.cumulativeSynthesis ??
      payload.findings ??
      "";
    const findings =
      payload.iteration_findings ?? payload.iterationFindings ?? synthesis;

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

export function parseLlmJson(raw: string): unknown {
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
