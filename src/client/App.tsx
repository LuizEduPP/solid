import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import {
  DEFAULT_WEB_SETTINGS,
  loadWebSettings,
  saveWebSettings,
  type WebSettings,
} from "./settings";
import "./App.css";

const TARGET_SCORE = 100;

function parseConfidence(output: string): number {
  const matches = [
    ...output.matchAll(/confian[aç]a acumulada:\s*\*\*(\d+(?:\.\d+)?)%\*\*/gi),
  ];
  if (matches.length === 0) return 0;
  return Number(matches.at(-1)![1]);
}

function splitOutput(output: string): { main: string; activity: string } {
  const blocks = output.split(/\n\n+/).filter(Boolean);
  const mainBlocks: string[] = [];
  const activityBlocks: string[] = [];

  for (const block of blocks) {
    if (block.startsWith("🧠") || block.startsWith("📄")) {
      mainBlocks.push(block.replace(/^[🧠📄]\s*/, ""));
    } else {
      activityBlocks.push(block);
    }
  }

  return {
    main: mainBlocks.join("\n\n"),
    activity: activityBlocks.join("\n\n"),
  };
}

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
      target_score: TARGET_SCORE,
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
  const [objective, setObjective] = useState("");
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [controller, setController] = useState<AbortController | null>(null);

  useEffect(() => {
    saveWebSettings(settings);
  }, [settings]);

  const confidence = useMemo(() => parseConfidence(output), [output]);
  const { main, activity } = useMemo(() => splitOutput(output), [output]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!objective.trim() || running) return;

    if (!settings.apiKey.trim()) {
      setError("Informe a API key.");
      setShowConfig(true);
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
        setOutput((current) => `${current}\n\n⏹ Cancelado.`);
      } else {
        setError(err instanceof Error ? err.message : "Erro inesperado");
      }
    } finally {
      setRunning(false);
      setController(null);
    }
  }

  function handleStop() {
    controller?.abort();
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">DeepSearch</div>

        <div className="progress-wrap">
          <div className="progress-meta">
            <span>Confiança</span>
            <strong>{confidence.toFixed(1)}%</strong>
          </div>
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{ width: `${Math.min(confidence, TARGET_SCORE)}%` }}
            />
          </div>
        </div>

        <div className="topbar-actions">
          <button
            className="ghost"
            type="button"
            onClick={() => setShowConfig((value) => !value)}
          >
            Config
          </button>
          {running ? (
            <button className="ghost" type="button" onClick={handleStop}>
              Parar
            </button>
          ) : null}
        </div>
      </header>

      {showConfig ? (
        <section className="config-bar">
          <label className="config-field">
            <span>API key</span>
            <input
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
          </label>
          <label className="config-field">
            <span>Base URL</span>
            <input
              type="url"
              value={settings.baseUrl}
              onChange={(event) =>
                setSettings((current) =>
                  updateSettings(current, "baseUrl", event.target.value),
                )
              }
              disabled={running}
            />
          </label>
          <label className="config-field">
            <span>Modelo</span>
            <input
              type="text"
              value={settings.model}
              onChange={(event) =>
                setSettings((current) =>
                  updateSettings(current, "model", event.target.value),
                )
              }
              disabled={running}
            />
          </label>
        </section>
      ) : null}

      <form className="prompt-bar" onSubmit={handleSubmit}>
        <textarea
          value={objective}
          onChange={(event) => setObjective(event.target.value)}
          placeholder="Descreva o que você quer validar..."
          rows={2}
          disabled={running}
        />
        <button className="primary" type="submit" disabled={running || !objective.trim()}>
          {running ? "..." : "Pesquisar"}
        </button>
      </form>

      {error ? <p className="error">{error}</p> : null}

      <div className="workspace">
        <section className="main-panel">
          <div className="panel-head">
            <h2>Síntese</h2>
            {activity ? (
              <button
                className="ghost small"
                type="button"
                onClick={() => setShowLog((value) => !value)}
              >
                {showLog ? "Ocultar log" : "Ver log"}
              </button>
            ) : null}
          </div>
          <div className={`output ${main ? "" : "empty"}`}>
            {main ? (
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
                {main}
              </ReactMarkdown>
            ) : (
              <p>{running ? "Analisando..." : "A síntese aparece aqui."}</p>
            )}
          </div>
        </section>

        {showLog && activity ? (
          <aside className="log-panel">
            <h2>Log</h2>
            <pre>{activity}</pre>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
