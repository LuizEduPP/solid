import { countUniqueHostnames } from "../shared/domains.js";
import type { ScoreRubric } from "../shared/types.js";

export type { ScoreRubric } from "../shared/types.js";

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

function prepareMarkdown(text: string): string {
  return text
    .replace(/\$\\rightarrow\$/g, "→")
    .replace(/\$\\leftrightarrow\$/g, "↔")
    .replace(/\$\\leftarrow\$/g, "←");
}

function parseIterations(output: string): IterationSnapshot[] {
  return extractSections(output, "ITER")
    .map(parseIterationPayload)
    .filter((item): item is IterationSnapshot => item !== null)
    .map((item) => ({
      ...item,
      findings: prepareMarkdown(item.findings),
      synthesis: prepareMarkdown(item.synthesis),
      scoreReasoning: prepareMarkdown(item.scoreReasoning),
    }));
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
  const report = prepareMarkdown(extractTailSection(output, "REPORT"));
  const activity = extractSections(output, "STATUS");
  const scoreText = extractTailSection(output, "SCORE");

  let confidence = scoreText ? Number(scoreText.split(/\s/)[0]) : 0;

  if (confidence === 0 && iterations.length > 0) {
    confidence = iterations.at(-1)!.score;
  }

  const iterationMatches = [...activity.join("\n").matchAll(/Iteration\s+(\d+)/gi)];
  const iteration =
    iterationMatches.length > 0
      ? Number(iterationMatches.at(-1)![1])
      : iterations.at(-1)?.number ?? null;

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
