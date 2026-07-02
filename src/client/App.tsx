import { useEffect, useMemo, useRef, useState } from "react";

import {
  applyParsedStream,
  createSession,
  deleteSession,
  formatSessionDate,
  loadHistory,
  sessionPreview,
  upsertSession,
  type ResearchSession,
} from "./history";
import MarkdownContent from "./MarkdownContent";
import {
  loadWebSettings,
  saveWebSettings,
  type WebSettings,
} from "./settings";
import { parseStream } from "./stream";
import "./App.css";

const TARGET_SCORE = 100;

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

function statusLabel(status: ResearchSession["status"]): string {
  switch (status) {
    case "running":
      return "Em andamento";
    case "completed":
      return "Concluída";
    case "cancelled":
      return "Cancelada";
    case "error":
      return "Erro";
    default:
      return status;
  }
}

export default function App() {
  const [settings, setSettings] = useState<WebSettings>(loadWebSettings);
  const [sessions, setSessions] = useState<ResearchSession[]>(() => loadHistory());
  const [activeId, setActiveId] = useState<string | null>(
    () => loadHistory()[0]?.id ?? null,
  );
  const [objective, setObjective] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [controller, setController] = useState<AbortController | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeId) ?? null,
    [sessions, activeId],
  );

  const parsed = useMemo(
    () => parseStream(activeSession?.rawStream ?? ""),
    [activeSession?.rawStream],
  );

  useEffect(() => {
    saveWebSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (!running) return;
    const el = timelineRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [parsed.iterations.length, parsed.report, running]);

  function syncSession(nextSession: ResearchSession) {
    setSessions((current) => upsertSession(current, nextSession));
  }

  function handleSelectSession(id: string) {
    setActiveId(id);
    setError(null);
    const session = sessions.find((item) => item.id === id);
    if (session && session.status !== "running") {
      setObjective(session.objective);
    }
  }

  function handleDeleteSession(id: string, event: React.MouseEvent) {
    event.stopPropagation();
    setSessions((current) => {
      const next = deleteSession(current, id);
      if (activeId === id) {
        setActiveId(next[0]?.id ?? null);
      }
      return next;
    });
  }

  function handleNewResearch() {
    setActiveId(null);
    setObjective("");
    setError(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!objective.trim() || running) return;

    if (!settings.apiKey.trim()) {
      setError("Informe a API key nas configurações.");
      setShowConfig(true);
      return;
    }

    controller?.abort();
    const nextController = new AbortController();
    setController(nextController);
    setRunning(true);
    setError(null);

    const session = createSession(objective.trim());
    setActiveId(session.id);
    syncSession(session);

    let rawStream = "";

    try {
      await streamResearch(
        settings,
        session.objective,
        (chunk) => {
          rawStream += chunk;
          const parsedChunk = parseStream(rawStream);
          syncSession(
            applyParsedStream(
              { ...session, status: "running" },
              parsedChunk,
              rawStream,
            ),
          );
        },
        nextController.signal,
      );

      const finalParsed = parseStream(rawStream);
      syncSession({
        ...applyParsedStream(session, finalParsed, rawStream),
        status: "completed",
        updatedAt: Date.now(),
      });
    } catch (err) {
      const finalParsed = parseStream(rawStream);
      if (err instanceof DOMException && err.name === "AbortError") {
        rawStream += "\n\n@@STATUS@@\nCancelado.\n\n";
        syncSession({
          ...applyParsedStream(session, parseStream(rawStream), rawStream),
          status: "cancelled",
          updatedAt: Date.now(),
        });
      } else {
        const message = err instanceof Error ? err.message : "Erro inesperado";
        setError(message);
        syncSession({
          ...applyParsedStream(session, finalParsed, rawStream),
          status: "error",
          error: message,
          updatedAt: Date.now(),
        });
      }
    } finally {
      setRunning(false);
      setController(null);
    }
  }

  function handleStop() {
    controller?.abort();
  }

  const isActiveRunning = running && activeSession?.status === "running";
  const confidence = parsed.confidence;
  const hasContent =
    parsed.iterations.length > 0 || Boolean(parsed.report) || isActiveRunning;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-head">
          <div>
            <p className="eyebrow">DeepSearch</p>
            <h1>Histórico</h1>
          </div>
          <div className="sidebar-actions">
            <button
              className="btn btn-secondary"
              type="button"
              onClick={handleNewResearch}
              disabled={running}
            >
              Nova
            </button>
          </div>
        </div>

        <div className="history-list">
          {sessions.length === 0 ? (
            <p className="empty-copy">Nenhuma pesquisa salva ainda.</p>
          ) : (
            sessions.map((session) => {
              const selected = session.id === activeId;
              return (
                <div
                  key={session.id}
                  className={`history-item ${selected ? "selected" : ""}`}
                  onClick={() => handleSelectSession(session.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      handleSelectSession(session.id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="history-item-top">
                    <span className={`status-pill status-${session.status}`}>
                      {statusLabel(session.status)}
                    </span>
                    <span className="history-score">
                      {session.confidence.toFixed(0)}%
                    </span>
                  </div>
                  <strong>{sessionPreview(session)}</strong>
                  <span className="history-meta">
                    {formatSessionDate(session.updatedAt)}
                    {session.iterations.length
                      ? ` · ${session.iterations.length} iterações`
                      : ""}
                  </span>
                  <button
                    type="button"
                    className="history-delete"
                    onClick={(event) => handleDeleteSession(session.id, event)}
                    aria-label="Excluir pesquisa"
                  >
                    ×
                  </button>
                </div>
              );
            })
          )}
        </div>
      </aside>

      <div className="content-column">
        <main className="main">
          <header className="main-header">
            <div className="main-header-copy">
              <p className="eyebrow">Investigação</p>
              <h2>
                {activeSession?.objective.trim() ||
                  "Descreva o que você quer validar"}
              </h2>
            </div>

            <div className="main-header-actions">
              {(isActiveRunning || confidence > 0) && (
                <div className="confidence-chip">
                  <span>
                    Confiança
                    {parsed.iteration ? ` · iteração ${parsed.iteration}` : ""}
                  </span>
                  <strong>{confidence.toFixed(1)}%</strong>
                  <div className="confidence-bar">
                    <div
                      className="confidence-bar-fill"
                      style={{ width: `${Math.min(confidence, TARGET_SCORE)}%` }}
                    />
                  </div>
                </div>
              )}

              {isActiveRunning ? (
                <button className="btn btn-danger" type="button" onClick={handleStop}>
                  Parar
                </button>
              ) : null}
            </div>
          </header>

          <section ref={timelineRef} className="timeline">
          {!hasContent ? (
            <div className="timeline-empty">
              <h3>Linha do tempo vazia</h3>
              <p>
                Cada iteração aparece aqui em ordem cronológica — descobertas,
                scores e sínteses acumuladas, sem sobrescrever o histórico.
              </p>
            </div>
          ) : (
            <>
              {parsed.activity.length > 0 ? (
                <details className="activity-log">
                  <summary>Log da execução ({parsed.activity.length})</summary>
                  <pre>{parsed.activity.join("\n")}</pre>
                </details>
              ) : null}

              <ol className="timeline-list">
                {parsed.iterations.map((iteration) => (
                  <li key={iteration.number} className="timeline-item">
                    <div className="timeline-marker" aria-hidden="true" />
                    <article className="iteration-card">
                      <header className="iteration-head">
                        <div>
                          <span className="iteration-index">
                            Iteração {iteration.number}
                          </span>
                          {iteration.angle ? (
                            <h3>{iteration.angle}</h3>
                          ) : null}
                        </div>
                        <div className="iteration-score">
                          <strong>{iteration.score.toFixed(1)}%</strong>
                          {iteration.scoreDelta ? (
                            <span>{iteration.scoreDelta}</span>
                          ) : null}
                        </div>
                      </header>

                      {iteration.findings ? (
                        <section className="iteration-block">
                          <h4>Novidades desta rodada</h4>
                          <MarkdownContent
                            content={iteration.findings}
                            className="markdown"
                          />
                        </section>
                      ) : null}

                      {iteration.scoreReasoning ? (
                        <section className="iteration-block muted">
                          <h4>Justificativa do score</h4>
                          <MarkdownContent
                            content={iteration.scoreReasoning}
                            className="markdown"
                          />
                        </section>
                      ) : null}

                      {iteration.synthesis ? (
                        <details className="iteration-synthesis">
                          <summary>Síntese acumulada até aqui</summary>
                          <MarkdownContent
                            content={iteration.synthesis}
                            className="markdown"
                          />
                        </details>
                      ) : null}
                    </article>
                  </li>
                ))}

                {isActiveRunning && parsed.iterations.length === 0 ? (
                  <li className="timeline-item pending">
                    <div className="timeline-marker" aria-hidden="true" />
                    <article className="iteration-card">
                      <p className="pending-copy">Planejando a primeira iteração…</p>
                    </article>
                  </li>
                ) : null}

                {isActiveRunning &&
                parsed.iterations.length > 0 &&
                !parsed.report ? (
                  <li className="timeline-item pending">
                    <div className="timeline-marker" aria-hidden="true" />
                    <article className="iteration-card">
                      <p className="pending-copy">Analisando próxima iteração…</p>
                    </article>
                  </li>
                ) : null}
              </ol>

              {parsed.report ? (
                <section className="report-card">
                  <header>
                    <span className="iteration-index">Relatório final</span>
                    <h3>Conclusão da investigação</h3>
                  </header>
                  <MarkdownContent content={parsed.report} className="markdown" />
                </section>
              ) : isActiveRunning && parsed.iterations.length > 0 ? (
                <section className="report-card pending">
                  <p className="pending-copy">Gerando relatório final…</p>
                </section>
              ) : null}
            </>
          )}
        </section>
        </main>

        <footer className="composer-footer">
          {showConfig ? (
            <section className="footer-config">
              <label className="field">
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
              <label className="field">
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
              <label className="field">
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

          {error ? <p className="form-error">{error}</p> : null}
          {activeSession?.error ? (
            <p className="form-error">{activeSession.error}</p>
          ) : null}

          <form className="composer" onSubmit={handleSubmit}>
            <button
              className={`btn btn-secondary btn-icon ${showConfig ? "active" : ""}`}
              type="button"
              onClick={() => setShowConfig((value) => !value)}
              aria-label={showConfig ? "Fechar configurações" : "Configurações"}
              title={showConfig ? "Fechar configurações" : "Configurações"}
            >
              Config
            </button>
            <textarea
              value={objective}
              onChange={(event) => setObjective(event.target.value)}
              placeholder="Ex.: Viabilidade de IA em saúde primária rural com SLM 4B..."
              rows={2}
              disabled={running}
            />
            <button
              className="btn btn-primary"
              type="submit"
              disabled={running || !objective.trim()}
            >
              {running ? "Pesquisando..." : "Iniciar pesquisa"}
            </button>
          </form>
        </footer>
      </div>
    </div>
  );
}
