import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseAnalysisPayload, parsePlanPayload } from "./schemas.js";

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
});
