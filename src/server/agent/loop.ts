import OpenAI from "openai";

import type { AgentConfig } from "../config.js";
import { parseJsonPayload } from "./json.js";
import { ANALYST_SYSTEM, FINAL_SYSTEM, PLANNER_SYSTEM } from "./prompts.js";
import {
  formatHits,
  searchWeb,
  type SearchHit,
} from "../search/web.js";

export interface IterationRecord {
  number: number;
  angle: string;
  queries: string[];
  hits: SearchHit[];
  findings: string;
  gaps: string[];
  score: number;
  scoreReasoning: string;
  nextVariation: string;
}

export interface AgentRun {
  objective: string;
  targetScore: number;
  iterations: IterationRecord[];
}

interface PlanPayload {
  queries: string[];
  angle: string;
}

interface AnalysisPayload {
  findings: string;
  gaps?: string[];
  score: number;
  score_reasoning: string;
  next_variation?: string;
}

export function extractObjective(messages: Array<{ role: string; content: string }>): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role === "user" && message.content.trim()) {
      return message.content.trim();
    }
  }
  throw new Error("No user message with objective found");
}

function normalizePlan(payload: Record<string, unknown>): PlanPayload {
  const queries = Array.isArray(payload.queries)
    ? payload.queries.map(String).filter(Boolean)
    : [];
  return {
    queries: queries.slice(0, 2),
    angle: String(payload.angle ?? ""),
  };
}

function normalizeAnalysis(payload: Record<string, unknown>): AnalysisPayload {
  const gaps = Array.isArray(payload.gaps) ? payload.gaps.map(String) : [];
  const score = Number(payload.score ?? payload.confidence ?? 0);
  return {
    findings: String(payload.findings ?? ""),
    gaps,
    score,
    score_reasoning: String(
      payload.score_reasoning ?? payload.scoreReasoning ?? "",
    ),
    next_variation: String(
      payload.next_variation ?? payload.nextVariation ?? "",
    ),
  };
}

function formatHistory(run: AgentRun, includeFindings = false): string {
  if (run.iterations.length === 0) return "";

  return run.iterations
    .map((record) => {
      let block =
        `Iteration ${record.number} | score ${record.score.toFixed(2)}%\n` +
        `Angle: ${record.angle}\n` +
        `Queries: ${record.queries.join(", ")}\n` +
        `Reasoning: ${record.scoreReasoning}`;
      if (includeFindings) {
        block += `\nFindings: ${record.findings}`;
      }
      return block;
    })
    .join("\n\n");
}

function event(kind: string, content: string): string {
  const prefix: Record<string, string> = {
    status: "⏳",
    iteration: "🔄",
    plan: "📋",
    search: "🔍",
    search_done: "✅",
    score: "📊",
    report: "📄",
  };
  return `${prefix[kind] ?? "•"} ${content}\n\n`;
}

export class DeepSearchAgent {
  private readonly client: OpenAI;
  private readonly settings: AgentConfig;

  constructor(settings: AgentConfig) {
    this.settings = settings;
    this.client = new OpenAI({
      apiKey: settings.openaiApiKey,
      baseURL: settings.openaiBaseUrl,
    });
  }

  private async chat(system: string, user: string): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.settings.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.4,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("LLM returned empty content");
    }
    return content;
  }

  private async chatJson(
    system: string,
    user: string,
  ): Promise<Record<string, unknown>> {
    let lastRaw = "";

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const prompt =
        attempt === 0
          ? user
          : `${user}\n\nYour previous reply was invalid JSON:\n${lastRaw}\n\nReply with ONLY a valid JSON object. Use \\n for line breaks inside strings.`;

      lastRaw = await this.chat(system, prompt);

      try {
        return parseJsonPayload(lastRaw);
      } catch {
        // retry with correction prompt
      }
    }

    throw new Error("LLM returned invalid JSON after retries");
  }

  private async plan(objective: string, run: AgentRun): Promise<PlanPayload> {
    const history = formatHistory(run);
    const user = `Objective:\n${objective}\n\nPrior iterations:\n${history || "(first iteration)"}`;
    const payload = await this.chatJson(PLANNER_SYSTEM, user);
    return normalizePlan(payload);
  }

  private async analyze(
    objective: string,
    run: AgentRun,
    angle: string,
    queryResults: Array<[string, SearchHit[]]>,
  ): Promise<AnalysisPayload> {
    const history = formatHistory(run);
    const evidence = queryResults
      .map(([query, hits]) => `Query: ${query}\n${formatHits(hits)}`)
      .join("\n\n");

    const user =
      `Objective:\n${objective}\n\n` +
      `Current angle: ${angle}\n\n` +
      `Prior iterations:\n${history || "(none)"}\n\n` +
      `Web results this iteration:\n${evidence}`;

    const payload = normalizeAnalysis(await this.chatJson(ANALYST_SYSTEM, user));
    payload.score = Math.max(
      this.settings.minScore,
      Math.min(100, Number(payload.score) || 0),
    );
    return payload;
  }

  private async finalReport(objective: string, run: AgentRun): Promise<string> {
    const history = formatHistory(run, true);
    const latestScore = run.iterations.at(-1)?.score ?? 0;
    const user =
      `Objective:\n${objective}\n\n` +
      `Target confidence reached: ${latestScore.toFixed(2)}%\n\n` +
      `Research log:\n${history}`;
    return this.chat(FINAL_SYSTEM, user);
  }

  async *run(
    objective: string,
    targetScore: number,
    maxIterations: number,
  ): AsyncGenerator<string> {
    const agentRun: AgentRun = {
      objective,
      targetScore,
      iterations: [],
    };

    yield event(
      "status",
      `DeepSearch started — target: ${targetScore.toFixed(2)}%, max iterations: ${maxIterations}`,
    );

    for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
      yield event("iteration", `--- Iteration ${iteration}/${maxIterations} ---`);

      const plan = await this.plan(objective, agentRun);
      const queries = plan.queries;
      const angle = plan.angle;
      yield event("plan", `Angle: ${angle}\nQueries: ${queries.join(", ")}`);

      const queryResults: Array<[string, SearchHit[]]> = [];
      let totalHits = 0;

      for (const query of queries) {
        yield event("search", `Searching: ${query}`);
        const result = await searchWeb(query, this.settings.resultsPerQuery);

        if (result.error) {
          yield event(
            "status",
            `Busca indisponível para "${query}": ${result.error}`,
          );
        }

        queryResults.push([query, result.hits]);
        totalHits += result.hits.length;
      }

      yield event("search_done", `Collected ${totalHits} results`);

      const analysis = await this.analyze(objective, agentRun, angle, queryResults);
      const hits = queryResults.flatMap(([, queryHits]) => queryHits);
      const score = Number(analysis.score);

      const record: IterationRecord = {
        number: iteration,
        angle,
        queries,
        hits,
        findings: String(analysis.findings),
        gaps: (analysis.gaps ?? []).map(String),
        score,
        scoreReasoning: String(analysis.score_reasoning),
        nextVariation: String(analysis.next_variation ?? ""),
      };
      agentRun.iterations.push(record);

      yield event(
        "score",
        `Confidence: **${score.toFixed(2)}%** (target: ${targetScore.toFixed(2)}%)\n` +
          `Reasoning: ${record.scoreReasoning}\n` +
          `Gaps: ${record.gaps.join(", ") || "none"}`,
      );

      if (score >= targetScore) {
        yield event(
          "status",
          `Target score reached at iteration ${iteration} (${score.toFixed(2)}%)`,
        );
        break;
      }

      if (iteration < maxIterations) {
        yield event(
          "status",
          `Below target — next variation: ${record.nextVariation}`,
        );
      }
    }

    const latestScore = agentRun.iterations.at(-1)?.score ?? 0;
    if (agentRun.iterations.length === maxIterations && latestScore < targetScore) {
      yield event(
        "status",
        `Max iterations reached — final score: ${latestScore.toFixed(2)}%`,
      );
    }

    yield event("status", "Generating final report...");
    const report = await this.finalReport(objective, agentRun);
    yield event("report", report);
  }
}
