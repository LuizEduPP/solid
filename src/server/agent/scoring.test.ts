import {
  applyCumulativeScore,
  canReachTargetScore,
  computeEvidenceScore,
  MODE_THRESHOLDS,
  normalizeRubric,
  rubricTotal,
  uniqueDomainsFromHits,
} from "./scoring.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("scoring", () => {
  it("caps first iteration score", () => {
    const rubric = normalizeRubric({
      direct_evidence: 20,
      source_diversity: 20,
      gap_coverage: 20,
      risk_contradiction: 20,
    });
    const score = applyCumulativeScore(null, 85, rubric, {
      contradictionFound: false,
      minScore: 0,
      maxDelta: 6,
      firstIterationCap: 40,
      isFirstIteration: true,
    });
    assert.equal(score, 40);
  });

  it("limits score increase per iteration", () => {
    const rubric = normalizeRubric({
      direct_evidence: 25,
      source_diversity: 25,
      gap_coverage: 25,
      risk_contradiction: 25,
    });
    const score = applyCumulativeScore(50, 95, rubric, {
      contradictionFound: false,
      minScore: 0,
      maxDelta: 6,
      firstIterationCap: 40,
      isFirstIteration: false,
    });
    assert.equal(score, 56);
  });

  it("blocks 100 when gaps remain", () => {
    const gate = canReachTargetScore({
      score: 100,
      targetScore: 100,
      openGaps: ["missing clinical trial"],
      iteration: 8,
      thresholds: MODE_THRESHOLDS.rigorous,
      uniqueDomainCount: 6,
      hadDisconfirmingSearch: true,
    });
    assert.equal(gate.allowed, false);
  });

  it("computes evidence score from domains", () => {
    const hits = [
      { title: "a", url: "https://a.com/x", snippet: "s" },
      { title: "b", url: "https://b.org/y", snippet: "s" },
    ];
    assert.equal(uniqueDomainsFromHits(hits).length, 2);
    const evidence = computeEvidenceScore(2, 1, 2, 3);
    assert.ok(evidence < 50);
  });

  it("sums rubric to 100 max", () => {
    const total = rubricTotal(
      normalizeRubric({
        direct_evidence: 25,
        source_diversity: 25,
        gap_coverage: 25,
        risk_contradiction: 25,
      }),
    );
    assert.equal(total, 100);
  });
});
