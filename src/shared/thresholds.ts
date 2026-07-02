import type { ResearchMode } from "./types.js";

export interface ModeThresholds {
  targetScore: number;
  minIterations: number;
  minDomainsFor100: number;
  maxScoreDelta: number;
  firstIterationCap: number;
  disconfirmThreshold: number;
  weakEvidenceBelow: number;
}

export const MODE_THRESHOLDS: Record<ResearchMode, ModeThresholds> = {
  rigorous: {
    targetScore: 100,
    minIterations: 6,
    minDomainsFor100: 5,
    maxScoreDelta: 6,
    firstIterationCap: 40,
    disconfirmThreshold: 70,
    weakEvidenceBelow: 60,
  },
  fast: {
    targetScore: 85,
    minIterations: 3,
    minDomainsFor100: 3,
    maxScoreDelta: 12,
    firstIterationCap: 55,
    disconfirmThreshold: 80,
    weakEvidenceBelow: 45,
  },
};
