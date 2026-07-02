export type ResearchMode = "rigorous" | "fast";

export interface ScoreRubric {
  direct_evidence: number;
  source_diversity: number;
  gap_coverage: number;
  risk_contradiction: number;
}
