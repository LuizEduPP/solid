import type { ScoreRubric } from "./types.js";

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

export function weakestRubricKey(rubric: ScoreRubric): keyof ScoreRubric {
  let weakest: keyof ScoreRubric = RUBRIC_DIMENSIONS[0].key;

  for (const dimension of RUBRIC_DIMENSIONS) {
    if (rubric[dimension.key] < rubric[weakest]) {
      weakest = dimension.key;
    }
  }

  return weakest;
}
