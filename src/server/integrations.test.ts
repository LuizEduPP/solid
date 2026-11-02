import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_INTEGRATION_ENDPOINTS,
  DEFAULT_INTEGRATIONS,
  firecrawlEndpoint,
  jinaReadUrl,
  mapSearchHits,
  normalizeIntegrationEndpoints,
  normalizeScrapeProvider,
  normalizeSearchProvider,
  requiredSearchKey,
  scrapeProviderNeedsKey,
  searchProviderNeedsKey,
  searxngSearchUrl,
} from "../shared.js";

describe("integrations", () => {
  it("normalizes unknown providers to free defaults", () => {
    assert.equal(normalizeSearchProvider("exa"), "exa");
    assert.equal(normalizeSearchProvider("nope"), "duckduckgo");
    assert.equal(normalizeScrapeProvider("jina"), "jina");
    assert.equal(normalizeScrapeProvider(null), "direct");
  });

  it("only paid cloud search and Firecrawl scrape require a key", () => {
    assert.equal(searchProviderNeedsKey("duckduckgo"), false);
    assert.equal(searchProviderNeedsKey("searxng"), false);
    assert.equal(searchProviderNeedsKey("exa"), true);
    assert.equal(scrapeProviderNeedsKey("direct"), false);
    assert.equal(scrapeProviderNeedsKey("jina"), false);
    assert.equal(scrapeProviderNeedsKey("firecrawl"), true);
    assert.equal(searchProviderNeedsKey("firecrawl", "http://127.0.0.1:3002"), false);
    assert.equal(scrapeProviderNeedsKey("firecrawl", "http://localhost:3002"), false);
  });

  it("joins self-hosted provider URLs without doubling /v1", () => {
    assert.equal(firecrawlEndpoint("", "search"), "https://api.firecrawl.dev/v1/search");
    assert.equal(
      firecrawlEndpoint("http://127.0.0.1:3002/", "scrape"),
      "http://127.0.0.1:3002/v1/scrape",
    );
    assert.equal(
      firecrawlEndpoint("http://127.0.0.1:3002/v1", "search"),
      "http://127.0.0.1:3002/v1/search",
    );
    assert.equal(
      jinaReadUrl("http://reader.local", "https://example.com"),
      "http://reader.local/https://example.com",
    );
    assert.equal(
      searxngSearchUrl("http://127.0.0.1:8080/", "open source"),
      "http://127.0.0.1:8080/search?q=open+source&format=json",
    );
    assert.equal(
      searxngSearchUrl("https://search.example.com/search", "ai"),
      "https://search.example.com/search?q=ai&format=json",
    );
  });

  it("fills missing endpoints with cloud defaults", () => {
    assert.deepEqual(normalizeIntegrationEndpoints({}), DEFAULT_INTEGRATION_ENDPOINTS);
  });

  it("drops invalid provider URLs", () => {
    const hits = mapSearchHits(
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
