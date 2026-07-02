# DeepSearch

Agente de pesquisa iterativa com interface web. Recebe um objetivo, busca na web em várias rodadas, revalida a ideia sob ângulos diferentes e converge para um score de confiança de **0,01% a 100%**.

## Stack

- TypeScript + Node.js
- Hono (API) + React (UI)
- Qualquer LLM compatível com OpenAI (OpenAI, Ollama, vLLM, etc.)
- DuckDuckGo para busca web

## Setup

```bash
cd projects/027-deep-search
yarn install
cp .env.example .env
# edite .env com suas credenciais de LLM
```

### Exemplo com Ollama

```env
OPENAI_API_KEY=ollama
OPENAI_BASE_URL=http://localhost:11434/v1
DEEPSEARCH_MODEL=llama3.2
DEEPSEARCH_TARGET_SCORE=85
DEEPSEARCH_MAX_ITERATIONS=8
```

## Rodar

### Desenvolvimento

```bash
yarn dev
```

- Interface web: [http://localhost:5173](http://localhost:5173)
- API: [http://localhost:8787](http://localhost:8787)

### Produção

```bash
yarn build
yarn start
```

Abra [http://localhost:8787](http://localhost:8787) — interface e API no mesmo servidor.

## Interface web

1. Descreva o objetivo da pesquisa.
2. Ajuste a meta de confiança e o número máximo de iterações.
3. Clique em **Iniciar pesquisa** e acompanhe o streaming em tempo real.

## API (OpenAI-compatible)

| Endpoint | Descrição |
|---|---|
| `GET /health` | Health check |
| `GET /v1/models` | Lista o modelo `deepsearch` |
| `POST /v1/chat/completions` | Executa o agente de pesquisa |

### Campos extras no request

| Campo | Padrão | Descrição |
|---|---|---|
| `target_score` | `90` | Para quando a confiança atingir este valor (0,01–100) |
| `max_iterations` | `10` | Máximo de loops de pesquisa |
| `min_score` | `0.01` | Piso para scores do LLM |

### Exemplo curl (streaming)

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

## Como funciona

1. Você envia o **objetivo** como mensagem do usuário.
2. O agente planeja queries de busca com um ângulo diferente a cada iteração.
3. Busca na web e sintetiza os achados.
4. Atribui um **score de confiança** (0,01–100%) com justificativa.
5. Se estiver abaixo de `target_score`, pivota e repete (até `max_iterations`).
6. Retorna um relatório final baseado em evidências.

## License

MIT
