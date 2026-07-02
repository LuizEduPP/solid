# Solid

Iterative web research agent with evidence scoring. Validates ideas step by step with a **solidness** score (not optimistic confidence).

The agent responds in the user's language; the app UI supports multiple languages (default: English).

## UI languages

English (default), Español, Português (Brasil), Português (Portugal), Français, Deutsch, Italiano — change in **Settings → Language**.

## Stack

- TypeScript + Node.js
- Hono (API) + React (UI)
- OpenAI-compatible LLM (OpenAI, LM Studio, Ollama, vLLM)
- DuckDuckGo + page fetch for primary evidence

## Setup

```bash
yarn install
yarn dev
```

- UI: [http://localhost:5173](http://localhost:5173)
- API: [http://localhost:8787](http://localhost:8787)

## Modes

| Mode | Target | Min. iterations | Domains for 100% |
|------|--------|-----------------|------------------|
| **Rigorous** | 100% | 6 | 5 + disconfirmation |
| **Fast** | 85% | 3 | 3 + disconfirmation |

## Scoring

- Rubric 0–25 across 4 dimensions: evidence, sources, gaps, risks
- Per-iteration score increase cap
- Hybrid score with objective evidence (domains, citations, gaps)
- 100% blocked while open gaps remain
- Mandatory **disconfirmation** round above threshold

## API

```bash
curl -N http://localhost:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "solid",
    "stream": true,
    "research_mode": "rigorous",
    "llm_api_key": "",
    "llm_base_url": "http://127.0.0.1:1234/v1",
    "llm_model": "google/gemma-4-e4b",
    "messages": [{"role": "user", "content": "Your question"}]
  }'
```

## Tests

```bash
yarn test
```

MIT
