import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MODE_THRESHOLDS,
  rubricTotal,
  scoreTone,
  uniqueHostnamesFromHits,
} from "../../shared.js";
import {
  parseAnalysisPayload,
  parsePlanPayload,
  parseReflectionPayload,
} from "./schemas.js";
import {
  anchorQueryToObjective,
  applyCumulativeScore,
  extractCitedUrls,
  normalizeRubric,
  objectiveCoverage,
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

    it("normalizes granite keys with stray spaces", () => {
      const parsed = parseAnalysisPayload(
        `{
          "iteration_findings": "Gemini edge benchmarks",
          "cumulative_synthesis": "Running synthesis",
          "resolved_ gaps": ["Operational efficiency"],
          "open_gaps": ["Latency under edge constraints"],
          "cited_urls": ["https://mljourney.com/...", "https://cloud.google.com/blog/post"],
          "score_ rubric": {
            "direct_evidence": 15,
            "source_diversity": 10,
            "gap_coverage": 5,
            "risk_contradiction": 0
          },
          "score": 57.5,
          "should_continue": true
        }`,
        [],
      );

      assert.deepEqual(parsed.resolved_gaps, ["Operational efficiency"]);
      assert.deepEqual(parsed.open_gaps, ["Latency under edge constraints"]);
      assert.equal(parsed.score_rubric.direct_evidence, 15);
      assert.equal(parsed.score, 57.5);
      assert.deepEqual(parsed.cited_urls, [
        "https://cloud.google.com/blog/post",
      ]);
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

    it("uses the proposed score on the first iteration", () => {
      const rubric = normalizeRubric({
        direct_evidence: 20,
        source_diversity: 20,
        gap_coverage: 20,
        risk_contradiction: 20,
      });
      assert.equal(applyCumulativeScore(null, 85, rubric, 0), 85);
    });

    it("blends proposed score with the rubric after the first iteration", () => {
      const rubric = normalizeRubric({
        direct_evidence: 25,
        source_diversity: 25,
        gap_coverage: 25,
        risk_contradiction: 25,
      });
      assert.equal(applyCumulativeScore(50, 95, rubric, 0), 97.25);
    });

    it("counts unique hostnames from hits", () => {
      const hits = [
        { title: "a", url: "https://a.com/x", snippet: "s" },
        { title: "b", url: "https://b.org/y", snippet: "s" },
      ];
      assert.equal(uniqueHostnamesFromHits(hits).length, 2);
    });

    it("measures coverage of distinctive objective terms", () => {
      const coverage = objectiveCoverage(
        "NexaRAG Studio latency benchmarks",
        "General notes about search engines",
      );
      assert.ok(coverage < 0.4);
      assert.equal(
        objectiveCoverage(
          "NexaRAG Studio latency",
          "NexaRAG Studio latency results",
        ),
        1,
      );
    });

    it("re-anchors a drifted query to the root objective", () => {
      assert.equal(
        anchorQueryToObjective(
          "latency benchmark edge",
          "NexaRAG Studio latency",
        ),
        "latency benchmark edge",
      );
      assert.equal(
        anchorQueryToObjective("unrelated weather forecast", "NexaRAG Studio"),
        "nexarag unrelated weather forecast",
      );
    });

    it("gives fast mode a shorter run budget than rigorous", () => {
      assert.ok(
        MODE_THRESHOLDS.fast.maxIterations < MODE_THRESHOLDS.rigorous.maxIterations,
      );
      assert.ok(
        MODE_THRESHOLDS.fast.maxLlmCalls < MODE_THRESHOLDS.rigorous.maxLlmCalls,
      );
    });

    it("maps scores to the same color tones used in the UI", () => {
      assert.equal(scoreTone(0), "gray");
      assert.equal(scoreTone(39), "red");
      assert.equal(scoreTone(40), "yellow");
      assert.equal(scoreTone(70), "teal");
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

  describe("analysis evidence fields", () => {
    it("parses direct_entity_evidence and evidence_type", () => {
      const parsed = parseAnalysisPayload(
        `{
          "iteration_findings": "Found direct benchmark data",
          "cumulative_synthesis": "Synthesis",
          "score": 55,
          "direct_entity_evidence": true,
          "evidence_type": "direct",
          "disambiguation_notes": ""
        }`,
        [],
      );
      assert.equal(parsed.direct_entity_evidence, true);
      assert.equal(parsed.evidence_type, "direct");
      assert.equal(parsed.disambiguation_notes, "");
    });

    it("defaults evidence_type to contextual when absent", () => {
      const parsed = parseAnalysisPayload(
        `{
          "iteration_findings": "Generic RAG info",
          "cumulative_synthesis": "Synthesis",
          "score": 30
        }`,
        [],
      );
      assert.equal(parsed.evidence_type, "contextual");
      assert.equal(parsed.direct_entity_evidence, false);
    });

    it("parses disambiguation_notes", () => {
      const parsed = parseAnalysisPayload(
        `{
          "iteration_findings": "Found Snowflake Cortex",
          "cumulative_synthesis": "Synthesis",
          "score": 28,
          "evidence_type": "contextual",
          "disambiguation_notes": "Found Snowflake Cortex Search but it is NOT DeepContext AI's Cortex Retriever"
        }`,
        [],
      );
      assert.ok(parsed.disambiguation_notes.includes("Snowflake Cortex"));
    });
  });

  describe("reflection schema", () => {
    it("parses a complete reflection payload", () => {
      const reflection = parseReflectionPayload(`{
        "entity_verdict": "unlikely",
        "entity_confidence": 12,
        "entity_reasoning": "After 4 iterations, no direct evidence found for the entity",
        "investigation_quality": "circular",
        "quality_reasoning": "Same types of contextual results repeating",
        "recommendation": "stop",
        "recommendation_reasoning": "Entity likely does not exist",
        "pivot_suggestion": "",
        "key_observations": ["Only contextual evidence found", "Similar entities confused with target"],
        "should_continue": false
      }`);

      assert.equal(reflection.entity_verdict, "unlikely");
      assert.equal(reflection.entity_confidence, 12);
      assert.equal(reflection.investigation_quality, "circular");
      assert.equal(reflection.recommendation, "stop");
      assert.equal(reflection.should_continue, false);
      assert.equal(reflection.key_observations.length, 2);
    });

    it("defaults to safe values when fields are missing", () => {
      const reflection = parseReflectionPayload(`{
        "entity_verdict": "confirmed",
        "entity_confidence": 85,
        "recommendation": "continue"
      }`);

      assert.equal(reflection.entity_verdict, "confirmed");
      assert.equal(reflection.entity_confidence, 85);
      assert.equal(reflection.should_continue, true);
      assert.equal(reflection.investigation_quality, "progressing");
    });

    it("infers should_continue from recommendation when absent", () => {
      const stop = parseReflectionPayload(`{
        "recommendation": "stop",
        "entity_verdict": "nonexistent",
        "entity_confidence": 5
      }`);
      assert.equal(stop.should_continue, false);

      const pivot = parseReflectionPayload(`{
        "recommendation": "pivot",
        "entity_verdict": "uncertain",
        "entity_confidence": 40
      }`);
      assert.equal(pivot.should_continue, true);
    });

    it("clamps entity_confidence to 0-100", () => {
      const r = parseReflectionPayload(`{
        "entity_verdict": "confirmed",
        "entity_confidence": 150,
        "recommendation": "continue"
      }`);
      assert.equal(r.entity_confidence, 100);
    });

    it("accepts camelCase fields", () => {
      const r = parseReflectionPayload(`{
        "entityVerdict": "likely",
        "entityConfidence": 72,
        "investigationQuality": "progressing",
        "recommendationReasoning": "Good progress",
        "recommendation": "continue",
        "keyObservations": ["found official docs"]
      }`);

      assert.equal(r.entity_verdict, "likely");
      assert.equal(r.entity_confidence, 72);
      assert.equal(r.investigation_quality, "progressing");
      assert.equal(r.key_observations[0], "found official docs");
    });
  });
});
