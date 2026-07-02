import { createParser } from "eventsource-parser";

import i18n from "./i18n";
import type { WebSettings } from "./types";
import { countUniqueHostnames } from "../shared/domains";
import { MODE_THRESHOLDS } from "../shared/thresholds";
import type { ScoreRubric } from "../shared/types";

export interface SourceSnapshot {
  title: string;
  url: string;
  snippet: string;
}

export interface IterationSnapshot {
  number: number;
  angle: string;
  score: number;
  scoreDelta: string;
  findings: string;
  synthesis: string;
  scoreReasoning: string;
  rubric?: ScoreRubric;
  citedUrls?: string[];
  readUrls?: string[];
  sources?: SourceSnapshot[];
  disconfirming?: boolean;
}

export interface ParsedStream {
  confidence: number;
  iterations: IterationSnapshot[];
  report: string;
  activity: string[];
  iteration: number | null;
  rubric: ScoreRubric | null;
}

const MARKER_RE = /@@(?:STATUS|SCORE|REPORT|ITER|RUBRIC)@@\n/;

function sectionBody(output: string, start: number): string {
  const tail = output.slice(start);
  const nextIdx = tail.search(MARKER_RE);
  return (nextIdx >= 0 ? tail.slice(0, nextIdx) : tail).trim();
}

function extractSections(output: string, marker: string): string[] {
  const token = `@@${marker}@@\n`;
  const results: string[] = [];
  let start = 0;

  while (start < output.length) {
    const idx = output.indexOf(token, start);
    if (idx < 0) break;

    const body = sectionBody(output, idx + token.length);
    if (body) results.push(body);

    const tail = output.slice(idx + token.length);
    const nextIdx = tail.search(MARKER_RE);
    start = idx + token.length + (nextIdx >= 0 ? nextIdx : tail.length);
  }

  return results;
}

function extractTailSection(output: string, marker: string): string {
  const token = `@@${marker}@@\n`;
  const idx = output.lastIndexOf(token);
  if (idx < 0) return "";
  return sectionBody(output, idx + token.length);
}

function parseIterationPayload(raw: string): IterationSnapshot | null {
  try {
    const payload = JSON.parse(raw) as Partial<IterationSnapshot>;
    if (typeof payload.number !== "number") return null;

    return {
      number: payload.number,
      angle: String(payload.angle ?? ""),
      score: Number(payload.score ?? 0),
      scoreDelta: String(payload.scoreDelta ?? ""),
      findings: String(payload.findings ?? ""),
      synthesis: String(payload.synthesis ?? ""),
      scoreReasoning: String(payload.scoreReasoning ?? ""),
      rubric: payload.rubric,
      citedUrls: payload.citedUrls,
      readUrls: payload.readUrls,
      sources: payload.sources,
      disconfirming: Boolean(payload.disconfirming),
    };
  } catch {
    return null;
  }
}

function parseIterations(output: string): IterationSnapshot[] {
  return extractSections(output, "ITER")
    .map(parseIterationPayload)
    .filter((item): item is IterationSnapshot => item !== null);
}

function parseLatestRubric(output: string): ScoreRubric | null {
  const raw = extractTailSection(output, "RUBRIC");
  if (!raw) return null;
  try {
    const payload = JSON.parse(raw) as { rubric?: ScoreRubric };
    return payload.rubric ?? null;
  } catch {
    return null;
  }
}

export function parseStream(output: string): ParsedStream {
  const iterations = parseIterations(output);
  const report = extractTailSection(output, "REPORT");
  const activity = extractSections(output, "STATUS");
  const scoreText = extractTailSection(output, "SCORE");

  let confidence = scoreText ? Number(scoreText.split(/\s/)[0]) : 0;

  if (confidence === 0 && iterations.length > 0) {
    confidence = iterations.at(-1)!.score;
  }

  const iteration = iterations.at(-1)?.number ?? null;

  const rubric =
    parseLatestRubric(output) ?? iterations.at(-1)?.rubric ?? null;

  return {
    confidence,
    iterations,
    report,
    activity,
    iteration,
    rubric,
  };
}

export function uniqueSourceCount(iterations: IterationSnapshot[]): number {
  const urls = iterations.flatMap((iteration) => iteration.citedUrls ?? []);
  return countUniqueHostnames(urls);
}

export async function fetchLlmModels(settings: WebSettings): Promise<string[]> {
  const response = await fetch("/v1/llm/models", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      llm_api_key: settings.apiKey,
      llm_base_url: settings.baseUrl,
    }),
  });

  const payload = (await response.json().catch(() => null)) as {
    models?: string[];
    error?: string;
  } | null;

  if (!response.ok) {
    throw new Error(
      typeof payload?.error === "string"
        ? payload.error
        : `Failed to list models (${response.status})`,
    );
  }

  return Array.isArray(payload?.models) ? payload.models : [];
}

export function pickDefaultModel(models: string[], current: string): string {
  if (current && models.includes(current)) return current;
  if (models.length === 0) return current;

  const preferred = models.find((id) => /gemma-4-e4b|gemma.*4b/i.test(id));
  return preferred ?? models[0]!;
}

export async function streamResearch(
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
      model: "solid",
      stream: true,
      target_score: MODE_THRESHOLDS[settings.mode].targetScore,
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
      i18n.t("errorRequestFailed", { status: response.status });
    throw new Error(message);
  }

  if (!response.body) {
    throw new Error(i18n.t("errorStreaming"));
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = createParser({
    onEvent: (event) => {
      const data = event.data.trim();
      if (!data || data === "[DONE]") return;

      const payload = JSON.parse(data) as {
        choices?: Array<{ delta?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.delta?.content;
      if (content) onChunk(content);
    },
  });

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    parser.feed(decoder.decode(value, { stream: true }));
  }

  const tail = decoder.decode();
  if (tail) parser.feed(tail);
}
