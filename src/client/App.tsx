import { useEffect, useMemo, useRef, useState } from "react";

import {
  applyParsedStream,
  createSession,
  deleteSession,
  groupSessionsByDate,
  loadHistory,
  sessionPreview,
  upsertSession,
  type ResearchSession,
} from "./history";
import MarkdownContent from "./MarkdownContent";
import { downloadSession } from "./export";
import {
  createTranslator,
  LOCALES,
  LOCALE_LABEL_KEYS,
  localeToHtmlLang,
  translateActivityLine,
  type Locale,
} from "./i18n/index.js";
import {
  loadWebSettings,
  MODE_TARGETS,
  saveWebSettings,
  type WebSettings,
} from "./settings";
import { fetchLlmModels, pickDefaultModel } from "./models";
import RubricBars from "./RubricBars";
import { parseStream, uniqueSourceCount } from "./stream";
import "./App.css";

const WEAK_EVIDENCE_BELOW: Record<WebSettings["mode"], number> = {
  rigorous: 60,
  fast: 45,
};

async function streamResearch(
  settings: WebSettings,
  objective: string,
  onChunk: (chunk: string) => void,
  signal: AbortSignal,
  t: ReturnType<typeof createTranslator>["t"],
): Promise<void> {
  const response = await fetch("/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      model: "solid",
      stream: true,
      target_score: MODE_TARGETS[settings.mode],
      research_mode: settings.mode,
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
    throw new Error(t("errorStreaming"));
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

function isLocalLlmBaseUrl(baseUrl: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(baseUrl.trim());
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
  const [models, setModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [controller, setController] = useState<AbortController | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const tr = useMemo(
    () => createTranslator(settings.locale),
    [settings.locale],
  );
  const { t, historyGroupLabel } = tr;

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeId) ?? null,
    [sessions, activeId],
  );

  const parsed = useMemo(
    () => parseStream(activeSession?.rawStream ?? ""),
    [activeSession?.rawStream],
  );

  const historyGroups = useMemo(
    () => groupSessionsByDate(sessions),
    [sessions],
  );

  useEffect(() => {
    saveWebSettings(settings);
  }, [settings]);

  useEffect(() => {
    document.documentElement.lang = localeToHtmlLang(settings.locale);
  }, [settings.locale]);

  useEffect(() => {
    if (!showConfig || !settings.baseUrl.trim()) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setModelsLoading(true);
      setModelsError(null);

      try {
        const nextModels = await fetchLlmModels(settings);
        if (cancelled) return;

        setModels(nextModels);
        setSettings((current) => {
          const model = pickDefaultModel(nextModels, current.model);
          return model === current.model ? current : { ...current, model };
        });
      } catch (err) {
        if (cancelled) return;
        setModels([]);
        setModelsError(
          err instanceof Error ? err.message : t("errorLoadModels"),
        );
      } finally {
        if (!cancelled) setModelsLoading(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [showConfig, settings.baseUrl, settings.apiKey, t]);

  useEffect(() => {
    if (!running) return;
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [parsed.iterations.length, parsed.report, running]);

  useEffect(() => {
    if (!running) return;
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [parsed.activity.length, running]);

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

    if (!settings.apiKey.trim() && !isLocalLlmBaseUrl(settings.baseUrl)) {
      setError(t("errorApiKey"));
      setShowConfig(true);
      return;
    }

    if (!settings.model.trim()) {
      setError(t("errorSelectModel"));
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
          syncSession(
            applyParsedStream(
              { ...session, status: "running" },
              parseStream(rawStream),
              rawStream,
            ),
          );
        },
        nextController.signal,
        t,
      );

      syncSession({
        ...applyParsedStream(session, parseStream(rawStream), rawStream),
        status: "completed",
        updatedAt: Date.now(),
      });
    } catch (err) {
      const finalParsed = parseStream(rawStream);
      if (err instanceof DOMException && err.name === "AbortError") {
        rawStream += `\n\n@@STATUS@@\n${t("cancelled")}\n\n`;
        syncSession({
          ...applyParsedStream(session, parseStream(rawStream), rawStream),
          status: "cancelled",
          updatedAt: Date.now(),
        });
      } else {
        const message = err instanceof Error ? err.message : t("errorUnexpected");
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

  function handleToggleMode() {
    if (running) return;
    setSettings((current) =>
      updateSettings(
        current,
        "mode",
        current.mode === "fast" ? "rigorous" : "fast",
      ),
    );
  }

  function handleStop() {
    controller?.abort();
  }

  const isActiveRunning = running && activeSession?.status === "running";
  const confidence = parsed.confidence;
  const targetScore = MODE_TARGETS[settings.mode];
  const sourceCount = uniqueSourceCount(parsed.iterations);
  const weakEvidence =
    confidence > 0 &&
    (confidence < WEAK_EVIDENCE_BELOW[settings.mode] || sourceCount < 3);
  const hasContent =
    parsed.iterations.length > 0 || Boolean(parsed.report) || isActiveRunning;
  const showLogSidebar = parsed.activity.length > 0;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">solid</div>

        <button
          className="new-thread-btn"
          type="button"
          onClick={handleNewResearch}
          disabled={running}
        >
          {t("newResearch")}
        </button>

        <div className="history-scroll">
          {historyGroups.length === 0 ? (
            <p className="muted-copy">{t("noResearchYet")}</p>
          ) : (
            historyGroups.map((group) => (
              <section key={group.key} className="history-group">
                <h2>{historyGroupLabel(group.key)}</h2>
                <ul>
                  {group.sessions.map((session) => (
                    <li key={session.id}>
                      <button
                        type="button"
                        className={`thread-row ${session.id === activeId ? "active" : ""}`}
                        onClick={() => handleSelectSession(session.id)}
                      >
                        <span className="thread-title">
                          {sessionPreview(session, t("untitledResearch"))}
                        </span>
                        {session.status === "running" ? (
                          <span className="thread-dot running" />
                        ) : null}
                      </button>
                      <button
                        type="button"
                        className="thread-delete"
                        onClick={(event) =>
                          handleDeleteSession(session.id, event)
                        }
                        aria-label={t("delete")}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>

        <div className="sidebar-footer">
          {showConfig ? (
            <section className="config-sheet sidebar-config">
              <label className="field">
                <span>{t("language")}</span>
                <select
                  value={settings.locale}
                  onChange={(event) =>
                    setSettings((current) =>
                      updateSettings(
                        current,
                        "locale",
                        event.target.value as Locale,
                      ),
                    )
                  }
                  disabled={running}
                >
                  {LOCALES.map((locale) => (
                    <option key={locale} value={locale}>
                      {t(LOCALE_LABEL_KEYS[locale])}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>{t("apiKey")}</span>
                <input
                  type="password"
                  value={settings.apiKey}
                  onChange={(event) =>
                    setSettings((current) =>
                      updateSettings(current, "apiKey", event.target.value),
                    )
                  }
                  placeholder={t("apiKeyPlaceholder")}
                  disabled={running}
                  autoComplete="off"
                />
              </label>
              <label className="field">
                <span>{t("baseUrl")}</span>
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
                <span>{t("model")}</span>
                <select
                  value={settings.model}
                  onChange={(event) =>
                    setSettings((current) =>
                      updateSettings(current, "model", event.target.value),
                    )
                  }
                  disabled={running || modelsLoading}
                >
                  {modelsLoading ? (
                    <option value="">{t("loadingModels")}</option>
                  ) : models.length === 0 ? (
                    <option value="">
                      {modelsError ?? t("noModelsAvailable")}
                    </option>
                  ) : (
                    models.map((modelId) => (
                      <option key={modelId} value={modelId}>
                        {modelId}
                      </option>
                    ))
                  )}
                  {!modelsLoading &&
                  settings.model &&
                  !models.includes(settings.model) ? (
                    <option value={settings.model}>{settings.model}</option>
                  ) : null}
                </select>
                {modelsError ? (
                  <span className="field-hint">{modelsError}</span>
                ) : null}
              </label>
            </section>
          ) : null}

          <button
            className={`sidebar-config-btn ${showConfig ? "active" : ""}`}
            type="button"
            onClick={() => setShowConfig((value) => !value)}
            aria-label={t("settings")}
            aria-expanded={showConfig}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
                stroke="currentColor"
                strokeWidth="1.6"
              />
              <path
                d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>{t("settings")}</span>
          </button>
        </div>
      </aside>

      <div className="main-shell">
        {hasContent ? (
          <header className="thread-header">
            <div className="thread-header-actions">
              {weakEvidence ? (
                <span className="weak-badge">{t("weakEvidence")}</span>
              ) : null}
              {(isActiveRunning || confidence > 0) && (
                <span className="confidence-badge">
                  {t("solidness")} {confidence.toFixed(0)}%
                  {parsed.iteration ? ` · ${parsed.iteration}` : ""}
                  {` / ${targetScore}%`}
                </span>
              )}
              {activeSession && !running ? (
                <button
                  className="text-btn"
                  type="button"
                  onClick={() => downloadSession(activeSession, tr)}
                >
                  {t("export")}
                </button>
              ) : null}
              {isActiveRunning ? (
                <button className="text-btn danger" type="button" onClick={handleStop}>
                  {t("stop")}
                </button>
              ) : null}
            </div>
          </header>
        ) : null}

        {parsed.rubric ? (
          <div className="rubric-panel">
            <RubricBars rubric={parsed.rubric} tr={tr} />
          </div>
        ) : null}

        <div className={`chat-body ${showLogSidebar ? "has-log" : ""}`}>
          <div ref={threadRef} className="thread-scroll">
            <div className="thread-column">
              {!hasContent ? (
                <div className="home-hero">
                  <h1 className="wordmark">solid</h1>
                </div>
              ) : (
                <>
                  {activeSession?.objective ? (
                    <div className="user-message">
                      <p>{activeSession.objective}</p>
                    </div>
                  ) : null}

                  {parsed.iterations.map((iteration) => (
                    <article key={iteration.number} className="answer-block">
                      <header className="step-header">
                        <span className="step-label">
                          {t("step")} {iteration.number}
                          {iteration.angle ? ` · ${iteration.angle}` : ""}
                        </span>
                        <span className="step-score">
                          {iteration.score.toFixed(0)}%
                        </span>
                      </header>

                      {iteration.findings ? (
                        <MarkdownContent
                          content={iteration.findings}
                          className="prose"
                        />
                      ) : null}

                      {iteration.scoreReasoning ? (
                        <p className="step-note">{iteration.scoreReasoning}</p>
                      ) : null}

                      {iteration.synthesis ? (
                        <details className="step-details">
                          <summary>{t("cumulativeSynthesis")}</summary>
                          <MarkdownContent
                            content={iteration.synthesis}
                            className="prose"
                          />
                        </details>
                      ) : null}

                      {iteration.sources && iteration.sources.length > 0 ? (
                        <div className="sources-block">
                          <h4>{t("sources")}</h4>
                          <ul>
                            {iteration.sources.map((source) => (
                              <li key={source.url}>
                                <a href={source.url} target="_blank" rel="noreferrer">
                                  {source.title || source.url}
                                </a>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </article>
                  ))}

                  {isActiveRunning && !parsed.report ? (
                    <div className="thinking">
                      <span className="thinking-dot" />
                      {t("analyzing")}
                    </div>
                  ) : null}

                  {parsed.report ? (
                    <article className="answer-block final-answer">
                      <header className="step-header">
                        <span className="step-label">{t("answer")}</span>
                      </header>
                      <MarkdownContent content={parsed.report} className="prose" />
                    </article>
                  ) : null}

                  {activeSession?.error ? (
                    <p className="inline-error">{activeSession.error}</p>
                  ) : null}
                </>
              )}
            </div>
          </div>

          {showLogSidebar ? (
            <aside className="log-sidebar">
              <div className="log-sidebar-head">
                <h2>{t("steps")}</h2>
                <span className="log-count">{parsed.activity.length}</span>
              </div>
              <div ref={logRef} className="log-sidebar-scroll">
                <ol className="log-list">
                  {parsed.activity.map((line, index) => (
                    <li
                      key={`${index}-${line.slice(0, 24)}`}
                      className={
                        isActiveRunning && index === parsed.activity.length - 1
                          ? "active"
                          : undefined
                      }
                    >
                      {translateActivityLine(line, tr)}
                    </li>
                  ))}
                </ol>
              </div>
            </aside>
          ) : null}
        </div>

        <footer className="ask-dock">
          <div className="ask-dock-inner">
            {error ? <p className="inline-error">{error}</p> : null}

            <form className="ask-bar" onSubmit={handleSubmit}>
              <button
                className={`ask-action mode-toggle ${settings.mode === "fast" ? "active" : ""}`}
                type="button"
                onClick={handleToggleMode}
                disabled={running}
                aria-label={
                  settings.mode === "fast" ? t("modeFast") : t("modeRigorous")
                }
                title={
                  settings.mode === "fast" ? t("modeFast") : t("modeRigorous")
                }
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M13 2 3 14h8l-1 8 10-12h-8l1-8z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                    fill={settings.mode === "fast" ? "currentColor" : "none"}
                  />
                </svg>
              </button>

              <textarea
                value={objective}
                onChange={(event) => setObjective(event.target.value)}
                placeholder={t("askPlaceholder")}
                rows={1}
                disabled={running}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
              />

              <button
                className="ask-submit"
                type="submit"
                disabled={running || !objective.trim()}
                aria-label={running ? t("researching") : t("research")}
              >
                {running ? (
                  <span className="spinner" />
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M12 19V5M5 12l7-7 7 7"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
            </form>
          </div>
        </footer>
      </div>
    </div>
  );
}
