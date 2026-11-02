import { createParser } from "eventsource-parser";

import i18n from "./i18n";
import type { WebSettings } from "./types";
import {
  countUniqueHostnames,
  INTEGRATION_FIELDS,
  llmRequiresApiKey,
  MODE_THRESHOLDS,
  STREAM_MARKER_RE,
  streamToken,
  type EvidenceType,
  type PriorResearchContext,
  type ReflectionSnapshot,
  type ScoreRubric,
  type SearchHit,
  type StreamMarker,
} from "../shared";

export type { EntityVerdict, InvestigationQuality, ReflectionSnapshot } from "../shared";
export type SourceSnapshot = SearchHit;

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
  gaps?: string[];
  disconfirming?: boolean;
  evidenceType?: EvidenceType;
  directEntityEvidence?: boolean;
  disambiguationNotes?: string;
}

export interface ResearchRound {
  followUpMessage?: string;
  iterations: IterationSnapshot[];
  report: string;
}

interface ParsedStream {
  confidence: number;
  iterations: IterationSnapshot[];
  report: string;
  activity: string[];
  iteration: number | null;
  rubric: ScoreRubric | null;
  reflection: ReflectionSnapshot | null;
  rounds: ResearchRound[];
}

function sectionBody(output: string, start: number): string {
  const tail = output.slice(start);
  const nextIdx = tail.search(STREAM_MARKER_RE);
  return (nextIdx >= 0 ? tail.slice(0, nextIdx) : tail).trim();
}

function extractSections(output: string, marker: StreamMarker): string[] {
  const token = streamToken(marker);
  const results: string[] = [];
  let start = 0;

  while (start < output.length) {
    const idx = output.indexOf(token, start);
    if (idx < 0) break;

    const body = sectionBody(output, idx + token.length);
    if (body) results.push(body);

    const tail = output.slice(idx + token.length);
    const nextIdx = tail.search(STREAM_MARKER_RE);
    start = idx + token.length + (nextIdx >= 0 ? nextIdx : tail.length);
  }

  return results;
}

function extractTailSection(output: string, marker: StreamMarker): string {
  const token = streamToken(marker);
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
      gaps: payload.gaps?.map(String),
      evidenceType: payload.evidenceType as EvidenceType | undefined,
      directEntityEvidence: payload.directEntityEvidence,
      disambiguationNotes: payload.disambiguationNotes,
    };
  } catch {
    return null;
  }
}

function parseReflectionSnapshot(output: string): ReflectionSnapshot | null {
  const raw = extractTailSection(output, "REFLECTION");
  if (!raw) return null;
  try {
    const payload = JSON.parse(raw) as Partial<ReflectionSnapshot>;
    if (!payload.entity_verdict) return null;
    return {
      entity_verdict: payload.entity_verdict ?? "uncertain",
      entity_confidence: Number(payload.entity_confidence ?? 50),
      entity_reasoning: String(payload.entity_reasoning ?? ""),
      investigation_quality: payload.investigation_quality ?? "progressing",
      quality_reasoning: String(payload.quality_reasoning ?? ""),
      recommendation: payload.recommendation ?? "continue",
      recommendation_reasoning: String(payload.recommendation_reasoning ?? ""),
      pivot_suggestion: String(payload.pivot_suggestion ?? ""),
      key_observations: Array.isArray(payload.key_observations)
        ? payload.key_observations.map(String)
        : [],
      should_continue: payload.should_continue ?? true,
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

const FOLLOWUP_TOKEN = streamToken("FOLLOWUP");

function parseRounds(output: string): ResearchRound[] {
  const parts: { followUpMessage?: string; raw: string }[] = [];
  let pos = 0;

  while (pos < output.length) {
    const nextFollowUp = output.indexOf(FOLLOWUP_TOKEN, pos);
    if (nextFollowUp < 0) {
      parts.push({ raw: output.slice(pos) });
      break;
    }

    const beforeChunk = output.slice(pos, nextFollowUp);
    if (beforeChunk.trim()) {
      parts.push({ raw: beforeChunk });
    }

    const msgStart = nextFollowUp + FOLLOWUP_TOKEN.length;
    const msgBody = sectionBody(output, msgStart);

    const chunkStart = msgStart + msgBody.length;
    const nextFollowUp2 = output.indexOf(FOLLOWUP_TOKEN, chunkStart);
    const chunkEnd = nextFollowUp2 >= 0 ? nextFollowUp2 : output.length;

    parts.push({
      followUpMessage: msgBody,
      raw: output.slice(chunkStart, chunkEnd),
    });
    pos = chunkEnd;
  }

  if (parts.length === 0) {
    parts.push({ raw: output });
  }

  return parts.map((part) => ({
    followUpMessage: part.followUpMessage,
    iterations: parseIterations(part.raw),
    report: extractTailSection(part.raw, "REPORT"),
  }));
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

  const reflection = parseReflectionSnapshot(output);
  const rounds = parseRounds(output);

  return {
    confidence,
    iterations,
    report,
    activity,
    iteration,
    rubric,
    reflection,
    rounds,
  };
}

export function uniqueSourceCount(iterations: IterationSnapshot[]): number {
  const urls = iterations.flatMap((iteration) => iteration.citedUrls ?? []);
  return countUniqueHostnames(urls);
}

export function canFollowUp(
  session: { id: string; status: string } | null | undefined,
  sessionId: string | undefined,
  parsed: Pick<ParsedStream, "report" | "iterations">,
): boolean {
  return Boolean(
    session &&
      sessionId === session.id &&
      session.status !== "running" &&
      (parsed.report || parsed.iterations.length > 0),
  );
}

function llmFields(settings: WebSettings): Record<string, string> {
  return {
    llm_api_key: settings.apiKey,
    llm_base_url: settings.baseUrl,
  };
}

function integrationFields(settings: WebSettings): Record<string, string> {
  return Object.fromEntries(
    INTEGRATION_FIELDS.flatMap((field) => [
      [`${field}_api_key`, settings.integrationKeys[field]],
      [`${field}_base_url`, settings.integrationEndpoints[field]],
    ]),
  );
}

async function postJson<T>(
  url: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<{ ok: boolean; status: number; payload: T | null }> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const payload = (await response.json().catch(() => null)) as T | null;
  return { ok: response.ok, status: response.status, payload };
}

export async function fetchTitle(
  settings: WebSettings,
  objective: string,
): Promise<string | null> {
  if (!settings.model.trim()) return null;

  try {
    const { ok, payload } = await postJson<{ title?: string | null }>("/v1/title", {
      ...llmFields(settings),
      llm_model: settings.model,
      objective,
      locale: settings.locale,
    });
    return ok ? (payload?.title ?? null) : null;
  } catch {
    return null;
  }
}

export async function fetchSuggestions(settings: WebSettings, signal?: AbortSignal): Promise<string[]> {
  if (llmRequiresApiKey(settings.apiKey, settings.baseUrl)) {
    return [];
  }
  if (!settings.model.trim()) return [];

  const { ok, payload } = await postJson<{ suggestions?: string[] }>(
    "/v1/suggestions",
    {
      ...llmFields(settings),
      llm_model: settings.model,
      locale: settings.locale,
    },
    signal,
  );

  return ok && Array.isArray(payload?.suggestions) ? payload.suggestions : [];
}

export async function fetchLlmModels(settings: WebSettings): Promise<string[]> {
  const { ok, status, payload } = await postJson<{
    models?: string[];
    error?: string;
  }>("/v1/llm/models", llmFields(settings));

  if (!ok) {
    throw new Error(
      typeof payload?.error === "string"
        ? payload.error
        : `Failed to list models (${status})`,
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
  priorContext?: PriorResearchContext,
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
      ...llmFields(settings),
      llm_model: settings.model,
      search_provider: settings.searchProvider,
      scrape_provider: settings.scrapeProvider,
      ...integrationFields(settings),
      messages: [{ role: "user", content: objective }],
      prior_context: priorContext,
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

  const abortReader = () => {
    void reader.cancel().catch(() => undefined);
  };
  if (signal.aborted) {
    abortReader();
  } else {
    signal.addEventListener("abort", abortReader, { once: true });
  }

  const parser = createParser({
    onEvent: (event) => {
      if (signal.aborted) return;

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
    if (signal.aborted) {
      abortReader();
      throw new DOMException("Aborted", "AbortError");
    }

    const { done, value } = await reader.read();
    if (done) break;
    parser.feed(decoder.decode(value, { stream: true }));
  }

  const tail = decoder.decode();
  if (tail) parser.feed(tail);
}
