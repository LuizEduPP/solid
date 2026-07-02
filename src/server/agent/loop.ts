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
  iterationFindings: string;
  cumulativeSynthesis: string;
  resolvedGaps: string[];
  gaps: string[];
  score: number;
  scoreDelta: string;
  scoreReasoning: string;
  nextVariation: string;
}

export interface AgentRun {
  objective: string;
  targetScore: number;
  cumulativeSynthesis: string;
  currentScore: number | null;
  iterations: IterationRecord[];
}

interface PlanPayload {
  queries: string[];
  angle: string;
}

interface AnalysisPayload {
  iteration_findings: string;
  cumulative_synthesis: string;
  resolved_gaps?: string[];
  open_gaps?: string[];
  score: number;
  score_delta: string;
  score_reasoning: string;
  contradiction_found?: boolean;
  should_continue: boolean;
  stop_reason: string;
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
  const resolvedGaps = Array.isArray(payload.resolved_gaps)
    ? payload.resolved_gaps.map(String)
    : [];
  const openGaps = Array.isArray(payload.open_gaps)
    ? payload.open_gaps.map(String)
    : Array.isArray(payload.gaps)
      ? payload.gaps.map(String)
      : [];

  const synthesis = String(
    payload.cumulative_synthesis ?? payload.cumulativeSynthesis ?? payload.findings ?? "",
  );

  return {
    iteration_findings: String(
      payload.iteration_findings ?? payload.iterationFindings ?? synthesis,
    ),
    cumulative_synthesis: synthesis,
    resolved_gaps: resolvedGaps,
    open_gaps: openGaps,
    score: Number(payload.score ?? payload.confidence ?? 0),
    score_delta: String(payload.score_delta ?? payload.scoreDelta ?? ""),
    score_reasoning: String(
      payload.score_reasoning ?? payload.scoreReasoning ?? "",
    ),
    contradiction_found: Boolean(payload.contradiction_found ?? payload.contradictionFound),
    should_continue: payload.should_continue !== false && payload.shouldContinue !== false,
    stop_reason: String(payload.stop_reason ?? payload.stopReason ?? ""),
    next_variation: String(
      payload.next_variation ?? payload.nextVariation ?? "",
    ),
  };
}

function clampScore(value: number, minScore: number): number {
  return Math.max(minScore, Math.min(100, value));
}

function applyCumulativeScore(
  previous: number | null,
  proposed: number,
  contradictionFound: boolean,
  minScore: number,
): number {
  const next = clampScore(proposed, minScore);
  if (previous === null) return next;
  if (next >= previous) return next;

  const maxDrop = contradictionFound ? 15 : 5;
  return Math.max(next, previous - maxDrop);
}

function collectPriorQueries(run: AgentRun): string[] {
  return run.iterations.flatMap((record) => record.queries);
}

function collectOpenGaps(run: AgentRun): string[] {
  return run.iterations.at(-1)?.gaps ?? [];
}

function event(kind: "status" | "synthesis" | "score" | "report", content: string): string {
  return `@@${kind.toUpperCase()}@@\n${content}\n\n`;
}

function extractMessageContent(
  message: OpenAI.Chat.Completions.ChatCompletionMessage,
): string {
  const content = message.content?.trim();
  if (content) return content;

  const reasoning = (
    message as OpenAI.Chat.Completions.ChatCompletionMessage & {
      reasoning_content?: string;
    }
  ).reasoning_content?.trim();

  if (reasoning) {
    const jsonMatch = reasoning.match(/\{[\s\S]*\}\s*$/);
    if (jsonMatch) return jsonMatch[0];
  }

  throw new Error(
    "Modelo retornou resposta vazia — desative reasoning no LM Studio ou use outro modelo",
  );
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
      temperature: 0.3,
    });

    const content = extractMessageContent(response.choices[0]!.message);
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
    const priorQueries = collectPriorQueries(run);
    const openGaps = collectOpenGaps(run);

    const user =
      `Objective:\n${objective}\n\n` +
      `Current cumulative confidence: ${run.currentScore?.toFixed(2) ?? "not scored yet"}%\n\n` +
      `Cumulative synthesis so far:\n${run.cumulativeSynthesis || "(first iteration)"}\n\n` +
      `Open gaps:\n${openGaps.length ? openGaps.map((gap) => `- ${gap}`).join("\n") : "(none yet)"}\n\n` +
      `Prior queries (do not repeat):\n${priorQueries.length ? priorQueries.map((q) => `- ${q}`).join("\n") : "(none)"}`;

    const payload = await this.chatJson(PLANNER_SYSTEM, user);
    return normalizePlan(payload);
  }

  private async analyze(
    objective: string,
    run: AgentRun,
    angle: string,
    queryResults: Array<[string, SearchHit[]]>,
  ): Promise<AnalysisPayload> {
    const evidence = queryResults
      .map(([query, hits]) => `Query: ${query}\n${formatHits(hits)}`)
      .join("\n\n");

    const user =
      `Objective:\n${objective}\n\n` +
      `Previous cumulative confidence: ${run.currentScore?.toFixed(2) ?? "null (first iteration)"}\n\n` +
      `Cumulative synthesis so far:\n${run.cumulativeSynthesis || "(none)"}\n\n` +
      `Current angle: ${angle}\n\n` +
      `New web results this iteration:\n${evidence}`;

    const payload = normalizeAnalysis(await this.chatJson(ANALYST_SYSTEM, user));
    payload.score = applyCumulativeScore(
      run.currentScore,
      payload.score,
      Boolean(payload.contradiction_found),
      this.settings.minScore,
    );
    return payload;
  }

  private async finalReport(objective: string, run: AgentRun): Promise<string> {
    const user =
      `Objective:\n${objective}\n\n` +
      `Final cumulative confidence: ${run.currentScore?.toFixed(2) ?? "0.00"}%\n\n` +
      `Cumulative synthesis:\n${run.cumulativeSynthesis}\n\n` +
      `Remaining gaps:\n${collectOpenGaps(run).map((gap) => `- ${gap}`).join("\n") || "(none)"}`;
    return this.chat(FINAL_SYSTEM, user);
  }

  async *run(
    objective: string,
    targetScore: number,
  ): AsyncGenerator<string> {
    const agentRun: AgentRun = {
      objective,
      targetScore,
      cumulativeSynthesis: "",
      currentScore: null,
      iterations: [],
    };

    yield event("status", "Pesquisa iniciada");

    let iteration = 0;
    while (true) {
      iteration += 1;
      const plan = await this.plan(objective, agentRun);
      const queries = plan.queries;
      const angle = plan.angle;

      yield event(
        "status",
        `Iteração ${iteration} · ${angle}`,
      );

      const queryResults: Array<[string, SearchHit[]]> = [];
      let totalHits = 0;

      for (const query of queries) {
        const result = await searchWeb(query, this.settings.resultsPerQuery);

        if (result.error) {
          yield event("status", `Busca falhou: ${query}`);
        }

        queryResults.push([query, result.hits]);
        totalHits += result.hits.length;
      }

      yield event("status", `${totalHits} resultados · analisando`);

      const analysis = await this.analyze(objective, agentRun, angle, queryResults);
      const hits = queryResults.flatMap(([, queryHits]) => queryHits);
      const score = Number(analysis.score);

      const record: IterationRecord = {
        number: iteration,
        angle,
        queries,
        hits,
        iterationFindings: analysis.iteration_findings,
        cumulativeSynthesis: analysis.cumulative_synthesis,
        resolvedGaps: (analysis.resolved_gaps ?? []).map(String),
        gaps: (analysis.open_gaps ?? []).map(String),
        score,
        scoreDelta: analysis.score_delta,
        scoreReasoning: analysis.score_reasoning,
        nextVariation: String(analysis.next_variation ?? ""),
      };
      agentRun.iterations.push(record);
      agentRun.cumulativeSynthesis = analysis.cumulative_synthesis;
      agentRun.currentScore = score;

      yield event("synthesis", analysis.cumulative_synthesis);
      yield event("score", score.toFixed(2));

      if (score >= targetScore) {
        yield event("status", "Meta de 100% atingida");
        break;
      }

      if (!analysis.should_continue) {
        yield event(
          "status",
          analysis.stop_reason || "IA encerrou — retorno decrescente nas buscas",
        );
        break;
      }
    }

    yield event("status", "Gerando relatório final...");
    const report = await this.finalReport(objective, agentRun);
    yield event("report", report);
  }
}
