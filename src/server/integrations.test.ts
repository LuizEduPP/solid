import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_INTEGRATIONS,
  normalizeScrapeProvider,
  normalizeSearchProvider,
  scrapeProviderNeedsKey,
  searchProviderNeedsKey,
} from "../shared.js";
import { mapProviderHits, requiredSearchKey } from "./integrations.js";

describe("integrations", () => {
  it("normalizes unknown providers to free defaults", () => {
    assert.equal(normalizeSearchProvider("exa"), "exa");
    assert.equal(normalizeSearchProvider("nope"), "duckduckgo");
    assert.equal(normalizeScrapeProvider("jina"), "jina");
    assert.equal(normalizeScrapeProvider(null), "direct");
  });

  it("only paid search and Firecrawl scrape require a key", () => {
    assert.equal(searchProviderNeedsKey("duckduckgo"), false);
    assert.equal(searchProviderNeedsKey("exa"), true);
    assert.equal(scrapeProviderNeedsKey("direct"), false);
    assert.equal(scrapeProviderNeedsKey("jina"), false);
    assert.equal(scrapeProviderNeedsKey("firecrawl"), true);
  });

  it("drops invalid provider URLs", () => {
    const hits = mapProviderHits(
      [
        { title: "Good", url: "https://exa.ai/doc", snippet: "ok" },
        { title: "Bad", url: "notaurl", snippet: "no" },
      ],
      8,
    );
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.url, "https://exa.ai/doc");
  });

  it("reads the key for the selected search provider", () => {
    const keys = { ...DEFAULT_INTEGRATIONS.keys, exa: "exa-secret" };
    assert.equal(requiredSearchKey("exa", keys), "exa-secret");
    assert.equal(requiredSearchKey("duckduckgo", keys), "");
  });
});
