# DeepSearch

OpenAI-compatible agent that takes your objective, searches the web iteratively, revalidates the idea from multiple angles, and converges on a confidence score from **0.01% to 100%**.

## Stack

- Python 3.11+
- FastAPI + Uvicorn
- Any OpenAI-compatible LLM (OpenAI, Ollama, vLLM, etc.)
- DuckDuckGo for web search

## Setup

```bash
cd projects/027-DeepSearch
python -m venv .venv
source .venv/bin/activate
pip install -e .
cp .env.example .env
# edit .env with your LLM credentials
```

### Ollama example

```env
OPENAI_API_KEY=ollama
OPENAI_BASE_URL=http://localhost:11434/v1
DEEPSEARCH_MODEL=llama3.2
DEEPSEARCH_TARGET_SCORE=85
DEEPSEARCH_MAX_ITERATIONS=8
```

## Run

```bash
deepsearch
# or
uvicorn main:app --host 0.0.0.0 --port 8787
```

## Usage

### curl (non-streaming)

```bash
curl http://localhost:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepsearch",
    "messages": [
      {"role": "user", "content": "Validar se um SaaS de gestão de obras para construtoras pequenas no Brasil tem mercado viável em 2026"}
    ],
    "target_score": 90,
    "max_iterations": 10
  }'
```

### curl (streaming)

```bash
curl -N http://localhost:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepsearch",
    "stream": true,
    "messages": [
      {"role": "user", "content": "Avaliar viabilidade de app de delivery só de marmitas fitness em Campinas"}
    ],
    "target_score": 80,
    "max_iterations": 6
  }'
```

### OpenAI Python SDK

```python
from openai import OpenAI

client = OpenAI(base_url="http://localhost:8787/v1", api_key="local")

stream = client.chat.completions.create(
    model="deepsearch",
    stream=True,
    extra_body={"target_score": 92, "max_iterations": 12},
    messages=[
        {"role": "user", "content": "Quero lançar um curso online de IA para advogados"}
    ],
)

for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="")
```

## How it works

1. You send your **objective** as the user message.
2. The agent plans search queries with a varying angle each iteration.
3. It searches the web and synthesizes findings.
4. It assigns a **confidence score** (0.01–100%) with reasoning.
5. If below `target_score`, it pivots/varies and repeats (up to `max_iterations`).
6. It returns a final evidence-based report.

## API

| Endpoint | Description |
|---|---|
| `GET /health` | Health check |
| `GET /v1/models` | Lists `deepsearch` model |
| `POST /v1/chat/completions` | Run research agent |

### Extra request fields

| Field | Default | Description |
|---|---|---|
| `target_score` | `90` | Stop when confidence reaches this (0.01–100) |
| `max_iterations` | `10` | Max research loops |
| `min_score` | `0.01` | Floor for LLM scores |

## License

MIT
