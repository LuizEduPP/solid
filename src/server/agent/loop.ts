import OpenAI from "openai";

import type { AgentConfig } from "../config.js";
import { parseAnalysisPayload, parsePlanPayload, type AnalysisPayload, type PlanPayload } from "./schemas.js";
import { ANALYST_SYSTEM, FINAL_SYSTEM, PLANNER_SYSTEM } from "./prompts.js";
import {
  applyCumulativeScore,
  canReachTargetScore,
  computeEvidenceScore,
  MODE_THRESHOLDS,
  rubricTotal,
  uniqueDomainsFromHits,
  type ScoreRubric,
} from "./scoring.js";
import { fetchPages } from "../search/fetch.js";
import { cacheFaviconsForUrls } from "../favicon/cache.js";
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
  fetchedPages: Array<{ url: string; text: string }>;
  iterationFindings: string;
  cumulativeSynthesis: string;
  resolvedGaps: string[];
  gaps: string[];
  citedUrls: string[];
  rubric: ScoreRubric;
  score: number;
  scoreDelta: string;
  scoreReasoning: string;
  disconfirming: boolean;
  nextVariation: string;
}

export interface AgentRun {
  objective: string;
  targetScore: number;
  cumulativeSynthesis: string;
  currentScore: number | null;
  iterations: IterationRecord[];
  allHits: SearchHit[];
  fetchedUrlCache: Set<string>;
  hadDisconfirmingSearch: boolean;
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

function collectPriorQueries(run: AgentRun): string[] {
  return run.iterations.flatMap((record) => record.queries);
}

function collectOpenGaps(run: AgentRun): string[] {
  return run.iterations.at(-1)?.gaps ?? [];
}

function event(kind: "status" | "score" | "report" | "iter" | "rubric", content: string): string {
  return `@@${kind.toUpperCase()}@@\n${content}\n\n`;
}

function eventIteration(record: {
  number: number;
  angle: string;
  score: number;
  scoreDelta: string;
  findings: string;
  synthesis: string;
  scoreReasoning: string;
  rubric: ScoreRubric;
  citedUrls: string[];
  readUrls?: string[];
  sources: SearchHit[];
  disconfirming: boolean;
}): string {
  return event("iter", JSON.stringify(record));
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
    "Model returned empty content — disable reasoning in LM Studio or use another model",
  );
}

function finalizeScore(
  run: AgentRun,
  analysis: AnalysisPayload,
  iteration: number,
  settings: AgentConfig,
): number {
  const thresholds = MODE_THRESHOLDS[settings.mode];
  const rubric = analysis.score_rubric;
  const isFirstIteration = iteration === 1;

  let score = applyCumulativeScore(run.currentScore, analysis.score, rubric, {
    contradictionFound: Boolean(analysis.contradiction_found),
    minScore: settings.minScore,
    maxDelta: thresholds.maxScoreDelta,
    firstIterationCap: thresholds.firstIterationCap,
    isFirstIteration,
  });

  const uniqueDomains = uniqueDomainsFromHits(run.allHits).length;
  const evidenceScore = computeEvidenceScore(
    uniqueDomains,
    analysis.cited_urls?.length ?? 0,
    iteration,
    analysis.open_gaps?.length ?? 0,
  );

  score = Math.min(score, evidenceScore + 8);

  if ((analysis.open_gaps?.length ?? 0) > 0) {
    score = Math.min(score, 94);
  }

  if (score > 90 && (analysis.cited_urls?.length ?? 0) < 2) {
    score = Math.min(score, 90);
  }

  return score;
}

export class SolidAgent {
  private readonly client: OpenAI;
  private readonly settings: AgentConfig;

  constructor(settings: AgentConfig) {
    this.settings = settings;
    this.client = new OpenAI({
      apiKey: settings.openaiApiKey,
      baseURL: settings.openaiBaseUrl,
    });
  }

  private async chat(system: string, user: string, json = false): Promise<string> {
    const request = {
      model: this.settings.model,
      messages: [
        { role: "system" as const, content: system },
        { role: "user" as const, content: user },
      ],
      temperature: 0.3,
      ...(json ? { response_format: { type: "json_object" as const } } : {}),
    };

    try {
      const response = await this.client.chat.completions.create(request);
      return extractMessageContent(response.choices[0]!.message);
    } catch (error) {
      if (!json) throw error;

      const response = await this.client.chat.completions.create({
        model: this.settings.model,
        messages: request.messages,
        temperature: 0.3,
      });
      return extractMessageContent(response.choices[0]!.message);
    }
  }

  private async chatJson<T>(
    system: string,
    user: string,
    parse: (raw: string) => T,
  ): Promise<T> {
    let lastRaw = "";

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const prompt =
        attempt === 0
          ? user
          : `${user}\n\nYour previous reply was invalid JSON:\n${lastRaw}\n\nReply with ONLY a valid JSON object. Close every array with ], never }. Use \\n for line breaks inside strings.`;

      lastRaw = await this.chat(system, prompt, true);

      try {
        return parse(lastRaw);
      } catch {
        // retry
      }
    }

    throw new Error("LLM returned invalid JSON after retries");
  }

  private async plan(objective: string, run: AgentRun): Promise<PlanPayload> {
    const thresholds = MODE_THRESHOLDS[this.settings.mode];
    const priorQueries = collectPriorQueries(run);
    const openGaps = collectOpenGaps(run);
    const requireDisconfirm =
      (run.currentScore ?? 0) >= thresholds.disconfirmThreshold &&
      !run.hadDisconfirmingSearch;

    const user =
      `Objective:\n${objective}\n\n` +
      `Current cumulative evidence score: ${run.currentScore?.toFixed(2) ?? "not scored yet"}%\n\n` +
      `Disconfirming search REQUIRED this round: ${requireDisconfirm ? "YES — you MUST set disconfirming: true" : "no"}\n\n` +
      `Cumulative synthesis so far:\n${run.cumulativeSynthesis || "(first iteration)"}\n\n` +
      `Open gaps:\n${openGaps.length ? openGaps.map((gap) => `- ${gap}`).join("\n") : "(none yet)"}\n\n` +
      `Prior queries (do not repeat):\n${priorQueries.length ? priorQueries.map((q) => `- ${q}`).join("\n") : "(none)"}`;

    const plan = await this.chatJson(PLANNER_SYSTEM, user, parsePlanPayload);
    if (requireDisconfirm) plan.disconfirming = true;
    return plan;
  }

  private async analyze(
    objective: string,
    run: AgentRun,
    angle: string,
    queryResults: Array<[string, SearchHit[]]>,
    fetchedPages: Array<{ url: string; text: string }>,
  ): Promise<AnalysisPayload> {
    const hits = queryResults.flatMap(([, queryHits]) => queryHits);
    const knownUrls = [...hits.map((hit) => hit.url), ...fetchedPages.map((p) => p.url)];

    const evidence =
      queryResults
        .map(([query, queryHits]) => `Query: ${query}\n${formatHits(queryHits)}`)
        .join("\n\n") +
      (fetchedPages.length
        ? `\n\nFetched page excerpts:\n${fetchedPages
            .map(
              (page) =>
                `URL: ${page.url}\nExcerpt: ${page.text.slice(0, 1200)}`,
            )
            .join("\n\n")}`
        : "");

    const user =
      `Objective:\n${objective}\n\n` +
      `Previous cumulative evidence score: ${run.currentScore?.toFixed(2) ?? "null (first iteration)"}\n\n` +
      `Unique domains seen so far: ${uniqueDomainsFromHits(run.allHits).length}\n\n` +
      `Cumulative synthesis so far:\n${run.cumulativeSynthesis || "(none)"}\n\n` +
      `Current angle: ${angle}\n\n` +
      `New web results this iteration:\n${evidence}`;

    return this.chatJson(ANALYST_SYSTEM, user, (raw) =>
      parseAnalysisPayload(raw, knownUrls),
    );
  }

  private async finalReport(objective: string, run: AgentRun): Promise<string> {
    const user =
      `Objective:\n${objective}\n\n` +
      `Final cumulative evidence score: ${run.currentScore?.toFixed(2) ?? "0.00"}%\n\n` +
      `Cumulative synthesis:\n${run.cumulativeSynthesis}\n\n` +
      `Remaining gaps:\n${collectOpenGaps(run).map((gap) => `- ${gap}`).join("\n") || "(none)"}`;
    return this.chat(FINAL_SYSTEM, user);
  }

  async *run(
    objective: string,
    targetScore: number,
  ): AsyncGenerator<string> {
    const thresholds = MODE_THRESHOLDS[this.settings.mode];
    const effectiveTarget = Math.min(targetScore, thresholds.targetScore);

    const agentRun: AgentRun = {
      objective,
      targetScore: effectiveTarget,
      cumulativeSynthesis: "",
      currentScore: null,
      iterations: [],
      allHits: [],
      fetchedUrlCache: new Set<string>(),
      hadDisconfirmingSearch: false,
    };

    yield event("status", "Research started");

    let iteration = 0;
    while (true) {
      iteration += 1;
      const plan = await this.plan(objective, agentRun);
      const queries = plan.queries;
      const angle = plan.angle;

      yield event(
        "status",
        `Iteration ${iteration} · ${angle}${plan.disconfirming ? " · disconfirmation" : ""}`,
      );

      const queryResults: Array<[string, SearchHit[]]> = [];
      let totalHits = 0;

      for (const query of queries) {
        const result = await searchWeb(query, this.settings.resultsPerQuery);

        if (result.error) {
          yield event("status", `Search failed: ${query}`);
        }

        queryResults.push([query, result.hits]);
        totalHits += result.hits.length;
        agentRun.allHits.push(...result.hits);
      }

      const hits = queryResults.flatMap(([, queryHits]) => queryHits);
      const fetchCandidates = hits.map((hit) => hit.url);
      const fetchedPages = await fetchPages(
        fetchCandidates,
        this.settings.pagesPerIteration,
        agentRun.fetchedUrlCache,
      );

      void cacheFaviconsForUrls([
        ...fetchedPages.map((page) => page.url),
        ...hits.map((hit) => hit.url),
      ]);

      if (fetchedPages.length > 0) {
        yield event("status", `${fetchedPages.length} page(s) fetched`);
      }

      yield event("status", `${totalHits} results · analyzing`);

      const analysis = await this.analyze(
        objective,
        agentRun,
        angle,
        queryResults,
        fetchedPages,
      );

      if (plan.disconfirming) {
        agentRun.hadDisconfirmingSearch = true;
      }

      const rubric = analysis.score_rubric;
      let score = finalizeScore(agentRun, analysis, iteration, this.settings);

      const gate = canReachTargetScore({
        score,
        targetScore: effectiveTarget,
        openGaps: analysis.open_gaps ?? [],
        iteration,
        thresholds,
        uniqueDomainCount: uniqueDomainsFromHits(agentRun.allHits).length,
        hadDisconfirmingSearch: agentRun.hadDisconfirmingSearch,
      });

      if (score >= effectiveTarget && !gate.allowed) {
        score = Math.min(score, effectiveTarget - 1);
        yield event("status", `Score capped: ${gate.reason}`);
        analysis.should_continue = true;
      }

      const record: IterationRecord = {
        number: iteration,
        angle,
        queries,
        hits,
        fetchedPages,
        iterationFindings: analysis.iteration_findings,
        cumulativeSynthesis: analysis.cumulative_synthesis,
        resolvedGaps: (analysis.resolved_gaps ?? []).map(String),
        gaps: (analysis.open_gaps ?? []).map(String),
        citedUrls: analysis.cited_urls ?? [],
        rubric,
        score,
        scoreDelta: analysis.score_delta,
        scoreReasoning: analysis.score_reasoning,
        disconfirming: plan.disconfirming,
        nextVariation: String(analysis.next_variation ?? ""),
      };
      agentRun.iterations.push(record);
      agentRun.cumulativeSynthesis = analysis.cumulative_synthesis;
      agentRun.currentScore = score;

      yield eventIteration({
        number: iteration,
        angle,
        score,
        scoreDelta: analysis.score_delta,
        findings: analysis.iteration_findings,
        synthesis: analysis.cumulative_synthesis,
        scoreReasoning: analysis.score_reasoning,
        rubric,
        citedUrls: analysis.cited_urls ?? [],
        readUrls: fetchedPages.map((page) => page.url),
        sources: hits.slice(0, 6),
        disconfirming: plan.disconfirming,
      });
      yield event("rubric", JSON.stringify({ iteration, rubric, total: rubricTotal(rubric) }));
      yield event("score", score.toFixed(2));

      if (score >= effectiveTarget && gate.allowed) {
        yield event("status", `Target ${effectiveTarget}% reached`);
        break;
      }

      if (!analysis.should_continue) {
        yield event(
          "status",
          analysis.stop_reason || "Model stopped — diminishing returns from search",
        );
        break;
      }
    }

    yield event("status", "Generating final report...");
    const report = await this.finalReport(objective, agentRun);
    yield event("report", report);
  }
}
