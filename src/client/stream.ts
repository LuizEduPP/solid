export interface ScoreRubric {
  direct_evidence: number;
  source_diversity: number;
  gap_coverage: number;
  risk_contradiction: number;
}

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

const MARKER_RE =
  /@@(?:STATUS|SYNTHESIS|SCORE|REPORT|ITER|RUBRIC)@@\n/;

function extractTailSection(output: string, marker: string): string {
  const token = `@@${marker}@@\n`;
  const idx = output.lastIndexOf(token);
  if (idx < 0) return "";

  const tail = output.slice(idx + token.length);
  const nextIdx = tail.search(MARKER_RE);
  return (nextIdx >= 0 ? tail.slice(0, nextIdx) : tail).trim();
}

function extractAllSections(output: string, marker: string): string[] {
  const token = `@@${marker}@@\n`;
  const results: string[] = [];
  let start = 0;

  while (start < output.length) {
    const idx = output.indexOf(token, start);
    if (idx < 0) break;

    const tail = output.slice(idx + token.length);
    const nextIdx = tail.search(MARKER_RE);
    const body = (nextIdx >= 0 ? tail.slice(0, nextIdx) : tail).trim();
    if (body) results.push(body);

    start =
      idx +
      token.length +
      (nextIdx >= 0 ? nextIdx : tail.length);
  }

  return results;
}

function parseIterationPayload(raw: string): IterationSnapshot | null {
  try {
    const payload = JSON.parse(raw) as Partial<IterationSnapshot> & {
      citedUrls?: string[];
    };
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

function parseLegacySynthesis(output: string): IterationSnapshot[] {
  const blocks = extractAllSections(output, "SYNTHESIS");
  const scores = extractAllSections(output, "SCORE").map((value) =>
    Number(value.split(/\s/)[0]),
  );

  return blocks.map((synthesis, index) => ({
    number: index + 1,
    angle: "",
    score: scores[index] ?? scores.at(-1) ?? 0,
    scoreDelta: "",
    findings: "",
    synthesis: prepareMarkdown(synthesis),
    scoreReasoning: "",
  }));
}

export function prepareMarkdown(text: string): string {
  return text
    .replace(/\$\\rightarrow\$/g, "→")
    .replace(/\$\\leftrightarrow\$/g, "↔")
    .replace(/\$\\leftarrow\$/g, "←");
}

function parseIterations(output: string): IterationSnapshot[] {
  const structured = extractAllSections(output, "ITER")
    .map(parseIterationPayload)
    .filter((item): item is IterationSnapshot => item !== null)
    .map((item) => ({
      ...item,
      findings: prepareMarkdown(item.findings),
      synthesis: prepareMarkdown(item.synthesis),
      scoreReasoning: prepareMarkdown(item.scoreReasoning),
    }));

  if (structured.length > 0) return structured;
  return parseLegacySynthesis(output);
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
  const activity = extractAllSections(output, "STATUS");
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
  const domains = new Set<string>();
  for (const iteration of iterations) {
    for (const url of iteration.citedUrls ?? []) {
      try {
        domains.add(new URL(url).hostname.replace(/^www\./, ""));
      } catch {
        // ignore invalid urls
      }
    }
  }
  return domains.size;
}
