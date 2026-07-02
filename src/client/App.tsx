import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import {
  loadWebSettings,
  saveWebSettings,
  type WebSettings,
} from "./settings";
import "./App.css";

const TARGET_SCORE = 100;

interface ParsedStream {
  confidence: number;
  main: string;
  activity: string;
  hasReport: boolean;
  iteration: number | null;
}

function extractSection(output: string, marker: string): string {
  const token = `@@${marker}@@\n`;
  const idx = output.lastIndexOf(token);
  if (idx < 0) return "";

  const tail = output.slice(idx + token.length);
  const nextIdx = tail.search(/\n@@(?:STATUS|SYNTHESIS|SCORE|REPORT)@@\n/);
  const body = nextIdx >= 0 ? tail.slice(0, nextIdx) : tail;
  return body.trim();
}

function extractAllSections(output: string, marker: string): string[] {
  const token = `@@${marker}@@\n`;
  const results: string[] = [];
  let start = 0;

  while (start < output.length) {
    const idx = output.indexOf(token, start);
    if (idx < 0) break;

    const tail = output.slice(idx + token.length);
    const nextIdx = tail.search(/\n@@(?:STATUS|SYNTHESIS|SCORE|REPORT)@@\n/);
    const body = (nextIdx >= 0 ? tail.slice(0, nextIdx) : tail).trim();
    if (body) results.push(body);

    start =
      idx +
      token.length +
      (nextIdx >= 0 ? nextIdx : tail.length);
  }

  return results;
}

function prepareMarkdown(text: string): string {
  return text
    .replace(/\$\\rightarrow\$/g, "→")
    .replace(/\$\\leftrightarrow\$/g, "↔")
    .replace(/\$\\leftarrow\$/g, "←");
}

function parseIteration(activity: string): number | null {
  const matches = [...activity.matchAll(/Iteração\s+(\d+)/gi)];
  if (matches.length === 0) return null;
  return Number(matches.at(-1)![1]);
}

function parseStream(output: string): ParsedStream {
  const synthesis = extractSection(output, "SYNTHESIS");
  const report = extractSection(output, "REPORT");
  const scoreText = extractSection(output, "SCORE");
  const activity = extractAllSections(output, "STATUS").join("\n");

  let confidence = scoreText ? Number(scoreText.split(/\s/)[0]) : 0;

  if (confidence === 0) {
    const legacy = [
      ...output.matchAll(/confian[aç]a acumulada:\s*\*\*(\d+(?:\.\d+)?)%\*\*/gi),
    ];
    if (legacy.length > 0) {
      confidence = Number(legacy.at(-1)![1]);
    }
  }

  const main = prepareMarkdown(report || synthesis);

  return {
    confidence,
    main,
    activity,
    hasReport: Boolean(report),
    iteration: parseIteration(activity),
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
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    saveWebSettings(settings);
  }, [settings]);

  const { confidence, main, activity, hasReport, iteration } = useMemo(
    () => parseStream(output),
    [output],
  );

  useEffect(() => {
    const el = outputRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [main]);

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
    setShowLog(false);

    try {
      await streamResearch(
        settings,
        objective.trim(),
        (chunk) => setOutput((current) => current + chunk),
        nextController.signal,
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setOutput((current) => `${current}\n\n@@STATUS@@\nCancelado.\n\n`);
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
            <span>
              Confiança
              {iteration ? ` · iteração ${iteration}` : ""}
            </span>
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
            <h2>{hasReport ? "Relatório" : "Síntese"}</h2>
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
          <div ref={outputRef} className={`output ${main ? "" : "empty"}`}>
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
              <p>{running ? "Analisando..." : "O resultado aparece aqui."}</p>
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
