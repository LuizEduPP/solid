import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import {
  DEFAULT_WEB_SETTINGS,
  loadWebSettings,
  saveWebSettings,
  type WebSettings,
} from "./settings";
import "./App.css";

async function streamResearch(
  settings: WebSettings,
  objective: string,
  onChunk: (chunk: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const response = await fetch("/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      model: "deepsearch",
      stream: true,
      target_score: settings.targetScore,
      max_iterations: settings.maxIterations,
      llm_api_key: settings.apiKey,
      llm_base_url: settings.baseUrl,
      llm_model: settings.model,
      messages: [{ role: "user", content: objective }],
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message =
      payload?.error?.fieldErrors?.llm_api_key?.[0] ??
      (typeof payload?.error === "string" ? payload.error : null) ??
      `Request failed (${response.status})`;
    throw new Error(message);
  }

  if (!response.body) {
    throw new Error("Streaming not supported in this browser");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (!data || data === "[DONE]") continue;

      const payload = JSON.parse(data) as {
        choices?: Array<{ delta?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.delta?.content;
      if (content) onChunk(content);
    }
  }
}

function updateSettings<K extends keyof WebSettings>(
  current: WebSettings,
  key: K,
  value: WebSettings[K],
): WebSettings {
  return { ...current, [key]: value };
}

export default function App() {
  const [settings, setSettings] = useState<WebSettings>(loadWebSettings);
  const [objective, setObjective] = useState(
    "Validar se um SaaS de gestão de obras para construtoras pequenas no Brasil tem mercado viável em 2026",
  );
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [controller, setController] = useState<AbortController | null>(null);

  useEffect(() => {
    saveWebSettings(settings);
  }, [settings]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!objective.trim() || running) return;

    if (!settings.apiKey.trim()) {
      setError("Informe a API key do LLM nas configurações.");
      return;
    }

    controller?.abort();
    const nextController = new AbortController();
    setController(nextController);
    setRunning(true);
    setError(null);
    setOutput("");

    try {
      await streamResearch(
        settings,
        objective.trim(),
        (chunk) => setOutput((current) => current + chunk),
        nextController.signal,
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setOutput((current) => `${current}\n\n⏹ Pesquisa cancelada.`);
      } else {
        setError(err instanceof Error ? err.message : "Unexpected error");
      }
    } finally {
      setRunning(false);
      setController(null);
    }
  }

  function handleStop() {
    controller?.abort();
  }

  function resetSettings() {
    setSettings(DEFAULT_WEB_SETTINGS);
  }

  return (
    <div className="app">
      <header className="hero">
        <div className="eyebrow">DeepSearch</div>
        <h1>Pesquisa iterativa com validação de confiança</h1>
        <p>
          Configure o LLM, descreva seu objetivo e acompanhe o agente pesquisando
          na web até atingir a meta de confiança.
        </p>
      </header>

      <div className="layout">
        <form className="panel" onSubmit={handleSubmit}>
          <h2>Configurações</h2>

          <div className="field">
            <label htmlFor="api-key">API key</label>
            <input
              id="api-key"
              type="password"
              value={settings.apiKey}
              onChange={(event) =>
                setSettings((current) =>
                  updateSettings(current, "apiKey", event.target.value),
                )
              }
              placeholder="sk-... ou ollama"
              disabled={running}
              autoComplete="off"
            />
          </div>

          <div className="field">
            <label htmlFor="base-url">Base URL</label>
            <input
              id="base-url"
              type="url"
              value={settings.baseUrl}
              onChange={(event) =>
                setSettings((current) =>
                  updateSettings(current, "baseUrl", event.target.value),
                )
              }
              placeholder="https://api.openai.com/v1"
              disabled={running}
            />
          </div>

          <div className="field">
            <label htmlFor="model">Modelo</label>
            <input
              id="model"
              type="text"
              value={settings.model}
              onChange={(event) =>
                setSettings((current) =>
                  updateSettings(current, "model", event.target.value),
                )
              }
              placeholder="gpt-4o-mini"
              disabled={running}
            />
          </div>

          <div className="grid-2">
            <div className="field">
              <label htmlFor="target-score">Meta de confiança (%)</label>
              <input
                id="target-score"
                type="number"
                min={1}
                max={100}
                step={1}
                value={settings.targetScore}
                onChange={(event) =>
                  setSettings((current) =>
                    updateSettings(current, "targetScore", Number(event.target.value)),
                  )
                }
                disabled={running}
              />
            </div>
            <div className="field">
              <label htmlFor="max-iterations">Máx. iterações</label>
              <input
                id="max-iterations"
                type="number"
                min={1}
                max={20}
                step={1}
                value={settings.maxIterations}
                onChange={(event) =>
                  setSettings((current) =>
                    updateSettings(current, "maxIterations", Number(event.target.value)),
                  )
                }
                disabled={running}
              />
            </div>
          </div>

          <div className="field section-gap">
            <label htmlFor="objective">Objetivo da pesquisa</label>
            <textarea
              id="objective"
              value={objective}
              onChange={(event) => setObjective(event.target.value)}
              placeholder="Ex.: Avaliar viabilidade de um app de delivery de marmitas fitness em Campinas"
              disabled={running}
            />
          </div>

          <div className="actions">
            <button className="primary" type="submit" disabled={running || !objective.trim()}>
              {running ? "Pesquisando..." : "Iniciar pesquisa"}
            </button>
            {running ? (
              <button className="ghost" type="button" onClick={handleStop}>
                Parar
              </button>
            ) : (
              <button className="ghost" type="button" onClick={resetSettings}>
                Restaurar padrões
              </button>
            )}
          </div>

          <p className="status">
            {running
              ? "Recebendo resultados em tempo real..."
              : "Configurações salvas automaticamente neste navegador."}
          </p>
          {error ? <p className="error">{error}</p> : null}
        </form>

        <section className="panel">
          <h2>Resultado</h2>
          <div className={`output ${output ? "" : "empty"}`}>
            {output ? (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ href, children }) => (
                    <a href={href} target="_blank" rel="noreferrer">
                      {children}
                    </a>
                  ),
                }}
              >
                {output}
              </ReactMarkdown>
            ) : (
              <p>
                O relatório aparece aqui conforme o agente pesquisa, pontua e sintetiza
                as evidências.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
