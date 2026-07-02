import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseAnalysisPayload, parsePlanPayload } from "./schemas.js";
import { rubricTotal, uniqueHostnamesFromHits, MODE_THRESHOLDS } from "../../shared.js";
import {
  applyCumulativeScore,
  canReachTargetScore,
  capScoreForCitedDomains,
  computeEvidenceScore,
  extractCitedUrls,
  normalizeRubric,
} from "./scoring.js";

describe("agent", () => {
  describe("schemas", () => {
    it("parses plan payload with ai-json-repair", () => {
      const parsed = parsePlanPayload(`{
        "queries": ["tinyml market", "edge ai assistant"],
        "angle": "technical viability",
        "disconfirming": false
      }`);

      assert.equal(parsed.queries.length, 2);
      assert.equal(parsed.angle, "technical viability");
      assert.equal(parsed.disconfirming, false);
    });

    it("repairs cited_urls closed with brace instead of bracket", () => {
      const broken = `{
  "iteration_findings": "Findings",
  "cumulative_synthesis": "Synthesis",
  "cited_urls": [
    "https://example.com/a",
    "https://example.com/b"
  },
  "score_rubric": {
    "direct_evidence": 18,
    "source_diversity": 20,
    "gap_coverage": 15,
    "risk_contradiction": 25
  },
  "score": 63,
  "should_continue": true
}`;

      const parsed = parseAnalysisPayload(broken, []);
      assert.deepEqual(parsed.cited_urls, [
        "https://example.com/a",
        "https://example.com/b",
      ]);
      assert.equal(parsed.score, 63);
      assert.equal(parsed.score_rubric.direct_evidence, 18);
    });

    it("accepts camelCase analysis fields", () => {
      const parsed = parseAnalysisPayload(
        `{
          "iterationFindings": "Step findings",
          "cumulativeSynthesis": "Running synthesis",
          "scoreDelta": "+5",
          "scoreReasoning": "Improved",
          "score": 55
        }`,
        [],
      );

      assert.equal(parsed.iteration_findings, "Step findings");
      assert.equal(parsed.cumulative_synthesis, "Running synthesis");
      assert.equal(parsed.score_delta, "+5");
    });

    it("merges cited urls from findings text", () => {
      const known = ["https://example.com/report"];
      const parsed = parseAnalysisPayload(
        `{
          "iteration_findings": "See https://example.com/report for details",
          "cumulative_synthesis": "Synthesis",
          "score": 40
        }`,
        known,
      );

      assert.deepEqual(parsed.cited_urls, ["https://example.com/report"]);
    });
  });

  describe("scoring", () => {
    it("clamps rubric values to 0-25", () => {
      const rubric = normalizeRubric({
        direct_evidence: 99,
        source_diversity: -5,
        gap_coverage: 12,
        risk_contradiction: 25,
      });

      assert.deepEqual(rubric, {
        direct_evidence: 25,
        source_diversity: 0,
        gap_coverage: 12,
        risk_contradiction: 25,
      });
    });

    it("extracts cited urls from text and known list", () => {
      const urls = extractCitedUrls(
        "Source https://a.com/x and https://b.org/y.",
        ["https://a.com/x"],
      );

      assert.deepEqual(urls, ["https://a.com/x", "https://b.org/y"]);
    });

    it("caps score above 90 without three cited domains", () => {
      const capped = capScoreForCitedDomains(95, [
        "https://a.com/1",
        "https://b.com/2",
      ]);
      assert.equal(capped, 90);

      const allowed = capScoreForCitedDomains(95, [
        "https://a.com/1",
        "https://b.com/2",
        "https://c.org/3",
      ]);
      assert.equal(allowed, 95);
    });
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

    it("blocks 100 without disconfirmation round", () => {
      const gate = canReachTargetScore({
        score: 100,
        targetScore: 100,
        openGaps: [],
        iteration: 8,
        thresholds: MODE_THRESHOLDS.rigorous,
        uniqueDomainCount: 6,
        hadDisconfirmingSearch: false,
      });
      assert.equal(gate.allowed, false);
      assert.equal(gate.reason, "missing disconfirmation round");
    });

    it("computes evidence score from domains", () => {
      const hits = [
        { title: "a", url: "https://a.com/x", snippet: "s" },
        { title: "b", url: "https://b.org/y", snippet: "s" },
      ];
      assert.equal(uniqueHostnamesFromHits(hits).length, 2);
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
});
