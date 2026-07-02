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
```

Opcional: copie `.env.example` para `.env` se quiser mudar a porta do servidor.

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

Todas as configurações ficam na própria interface (salvas no navegador):

1. **API key**, **base URL** e **modelo** do LLM (botão Config)
2. **Objetivo** da pesquisa

A meta é sempre **100%** de confiança. A IA decide a cada iteração se continua pesquisando ou encerra — com base no score e na qualidade das evidências, não em um limite fixo de rodadas.

### Exemplo com Ollama

| Campo | Valor |
|---|---|
| API key | `ollama` |
| Base URL | `http://localhost:11434/v1` |
| Modelo | `llama3.2` |

## API (OpenAI-compatible)

| Endpoint | Descrição |
|---|---|
| `GET /health` | Health check |
| `GET /v1/models` | Lista o modelo `deepsearch` |
| `POST /v1/chat/completions` | Executa o agente de pesquisa |

### Campos extras no request

| Campo | Obrigatório | Descrição |
|---|---|---|
| `llm_api_key` | sim | Chave do provedor LLM |
| `llm_base_url` | não | Padrão: `https://api.openai.com/v1` |
| `llm_model` | não | Padrão: `gpt-4o-mini` |
| `target_score` | não | Padrão: `100` |

### Exemplo curl (streaming)

```bash
curl -N http://localhost:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepsearch",
    "stream": true,
    "llm_api_key": "ollama",
    "llm_base_url": "http://localhost:11434/v1",
    "llm_model": "llama3.2",
    "messages": [
      {"role": "user", "content": "Avaliar viabilidade de app de delivery só de marmitas fitness em Campinas"}
    ]
  }'
```

## Como funciona

1. Você envia o **objetivo** como mensagem do usuário.
2. O agente planeja queries de busca com um ângulo diferente a cada iteração.
3. Busca na web e sintetiza os achados.
4. Atribui um **score de confiança** (0,01–100%) com justificativa.
5. A **IA decide** se continua ou encerra (`should_continue`), com base no score e nas lacunas pesquisáveis.
6. Retorna um relatório final baseado em evidências.

## License

MIT
