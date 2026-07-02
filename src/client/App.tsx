import { useMemo, useState } from "react";

import "./App.css";

function renderMarkdownLite(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(
      /(https?:\/\/[^\s<]+)/g,
      '<a href="$1" target="_blank" rel="noreferrer">$1</a>',
    );
}

async function streamResearch(
  objective: string,
  targetScore: number,
  maxIterations: number,
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
      target_score: targetScore,
      max_iterations: maxIterations,
      messages: [{ role: "user", content: objective }],
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message =
      payload && typeof payload.error === "string"
        ? payload.error
        : `Request failed (${response.status})`;
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

export default function App() {
  const [objective, setObjective] = useState(
    "Validar se um SaaS de gestão de obras para construtoras pequenas no Brasil tem mercado viável em 2026",
  );
  const [targetScore, setTargetScore] = useState(85);
  const [maxIterations, setMaxIterations] = useState(6);
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [controller, setController] = useState<AbortController | null>(null);

  const rendered = useMemo(() => renderMarkdownLite(output), [output]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!objective.trim() || running) return;

    controller?.abort();
    const nextController = new AbortController();
    setController(nextController);
    setRunning(true);
    setError(null);
    setOutput("");

    try {
      await streamResearch(
        objective.trim(),
        targetScore,
        maxIterations,
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

  return (
    <div className="app">
      <header className="hero">
        <div className="eyebrow">DeepSearch</div>
        <h1>Pesquisa iterativa com validação de confiança</h1>
        <p>
          Descreva seu objetivo, o agente busca na web em várias rodadas, reavalia
          a ideia sob ângulos diferentes e converge para um score de 0,01% a 100%.
        </p>
      </header>

      <div className="layout">
        <form className="panel" onSubmit={handleSubmit}>
          <h2>Objetivo</h2>

          <div className="field">
            <label htmlFor="objective">O que você quer validar?</label>
            <textarea
              id="objective"
              value={objective}
              onChange={(event) => setObjective(event.target.value)}
              placeholder="Ex.: Avaliar viabilidade de um app de delivery de marmitas fitness em Campinas"
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
                value={targetScore}
                onChange={(event) => setTargetScore(Number(event.target.value))}
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
                value={maxIterations}
                onChange={(event) => setMaxIterations(Number(event.target.value))}
                disabled={running}
              />
            </div>
          </div>

          <div className="actions">
            <button className="primary" type="submit" disabled={running || !objective.trim()}>
              {running ? "Pesquisando..." : "Iniciar pesquisa"}
            </button>
            {running ? (
              <button className="ghost" type="button" onClick={handleStop}>
                Parar
              </button>
            ) : null}
          </div>

          <p className="status">
            {running
              ? "Recebendo resultados em tempo real..."
              : "A API OpenAI-compatible continua disponível em /v1."}
          </p>
          {error ? <p className="error">{error}</p> : null}
        </form>

        <section className="panel">
          <h2>Resultado</h2>
          <div
            className={`output ${output ? "" : "empty"}`}
            dangerouslySetInnerHTML={{
              __html: output
                ? rendered
                : "O relatório aparece aqui conforme o agente pesquisa, pontua e sintetiza as evidências.",
            }}
          />
        </section>
      </div>
    </div>
  );
}
