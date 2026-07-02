export interface IterationSnapshot {
  number: number;
  angle: string;
  score: number;
  scoreDelta: string;
  findings: string;
  synthesis: string;
  scoreReasoning: string;
}

export interface ParsedStream {
  confidence: number;
  iterations: IterationSnapshot[];
  report: string;
  activity: string[];
  iteration: number | null;
}

const MARKER = /@@(STATUS|SYNTHESIS|SCORE|REPORT|ITER)@@\n/g;

function extractTailSection(output: string, marker: string): string {
  const token = `@@${marker}@@\n`;
  const idx = output.lastIndexOf(token);
  if (idx < 0) return "";

  const tail = output.slice(idx + token.length);
  const nextIdx = tail.search(/\n@@(?:STATUS|SYNTHESIS|SCORE|REPORT|ITER)@@\n/);
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
    const nextIdx = tail.search(/\n@@(?:STATUS|SYNTHESIS|SCORE|REPORT|ITER)@@\n/);
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

export function parseStream(output: string): ParsedStream {
  const iterations = parseIterations(output);
  const report = prepareMarkdown(extractTailSection(output, "REPORT"));
  const activity = extractAllSections(output, "STATUS");
  const scoreText = extractTailSection(output, "SCORE");

  let confidence = scoreText ? Number(scoreText.split(/\s/)[0]) : 0;

  if (confidence === 0 && iterations.length > 0) {
    confidence = iterations.at(-1)!.score;
  }

  if (confidence === 0) {
    const legacy = [
      ...output.matchAll(/confian[aç]a acumulada:\s*\*\*(\d+(?:\.\d+)?)%\*\*/gi),
    ];
    if (legacy.length > 0) {
      confidence = Number(legacy.at(-1)![1]);
    }
  }

  const iterationMatches = [...activity.join("\n").matchAll(/Iteração\s+(\d+)/gi)];
  const iteration =
    iterationMatches.length > 0
      ? Number(iterationMatches.at(-1)![1])
      : iterations.at(-1)?.number ?? null;

  return {
    confidence,
    iterations,
    report,
    activity,
    iteration,
  };
}

export function hasStreamMarkers(output: string): boolean {
  MARKER.lastIndex = 0;
  return MARKER.test(output);
}
