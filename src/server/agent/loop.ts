import OpenAI from "openai";

import type { AgentConfig } from "../config.js";
import {
  parseAnalysisPayload,
  parsePlanPayload,
  parseReflectionPayload,
  type AnalysisPayload,
  type PlanPayload,
  type ReflectionPayload,
} from "./schemas.js";
import { ANALYST_SYSTEM, FINAL_SYSTEM, PLANNER_SYSTEM, REFLECTOR_SYSTEM } from "./prompts.js";
import {
  applyCumulativeScore,
  canReachTargetScore,
  capScoreForCitedDomains,
  capScoreForEntityConfidence,
  computeEvidenceScore,
} from "./scoring.js";
import {
  countUniqueHostnames,
  MODE_THRESHOLDS,
  rubricTotal,
  type EvidenceType,
  type PriorResearchContext,
  type ScoreRubric,
} from "../../shared.js";
import { cacheFaviconsForUrls } from "../favicon.js";
import {
  fetchPages,
  formatHits,
  searchWeb,
  type SearchHit,
} from "../search.js";

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
  evidenceType: EvidenceType;
  directEntityEvidence: boolean;
  disambiguationNotes: string;
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
  lastReflection: ReflectionPayload | null;
  followUp?: string;
  priorReport?: string;
  seedOpenGaps?: string[];
  seedQueries?: string[];
  seedCitedUrls?: string[];
  seedUniqueDomainCount?: number;
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
  return [
    ...(run.seedQueries ?? []),
    ...run.iterations.flatMap((record) => record.queries),
  ];
}

function collectOpenGaps(run: AgentRun): string[] {
  if (run.iterations.length) return run.iterations.at(-1)?.gaps ?? [];
  return run.seedOpenGaps ?? [];
}

function totalUniqueDomainCount(run: AgentRun): number {
  const urls = [
    ...(run.seedCitedUrls ?? []),
    ...run.iterations.flatMap((record) => record.citedUrls),
    ...run.allHits.map((hit) => hit.url),
  ];
  return countUniqueHostnames(urls);
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
  gaps?: string[];
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

  const uniqueDomains = totalUniqueDomainCount(run);
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

  const cumulativeCitedUrls = [
    ...(run.seedCitedUrls ?? []),
    ...run.iterations.flatMap((record) => record.citedUrls),
    ...(analysis.cited_urls ?? []),
  ];
  score = capScoreForCitedDomains(score, cumulativeCitedUrls);

  return score;
}

/**
 * Builds a compact summary of all iteration records for the reflector to
 * review. Includes evidence types, scores, disambiguation notes, and
 * findings — everything the reflector needs to reason holistically.
 */
function buildIterationSummary(run: AgentRun): string {
  if (run.iterations.length === 0) return "(no iterations yet)";

  return run.iterations
    .map((iter) => {
      const lines = [
        `--- Iteration ${iter.number} (score: ${iter.score.toFixed(1)}, evidence: ${iter.evidenceType}) ---`,
        `Angle: ${iter.angle}`,
        `Queries: ${iter.queries.join(" | ")}`,
        `Findings: ${iter.iterationFindings.slice(0, 600)}`,
      ];
      if (iter.disambiguationNotes) {
        lines.push(`Disambiguation: ${iter.disambiguationNotes}`);
      }
      if (iter.gaps.length > 0) {
        lines.push(`Open gaps: ${iter.gaps.join("; ")}`);
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

export class SolidAgent {
  private readonly client: OpenAI;
  private readonly settings: AgentConfig;
  private runSignal?: AbortSignal;

  constructor(settings: AgentConfig) {
    this.settings = settings;
    this.client = new OpenAI({
      apiKey: settings.openaiApiKey,
      baseURL: settings.openaiBaseUrl,
    });
  }

  private throwIfAborted(): void {
    if (this.runSignal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
  }

  private async chat(system: string, user: string, json = false): Promise<string> {
    this.throwIfAborted();
    const request = {
      model: this.settings.model,
      messages: [
        { role: "system" as const, content: system },
        { role: "user" as const, content: user },
      ],
      temperature: this.settings.temperature,
      ...(json ? { response_format: { type: "json_object" as const } } : {}),
    };
    const options = this.runSignal ? { signal: this.runSignal } : undefined;

    try {
      const response = await this.client.chat.completions.create(request, options);
      return extractMessageContent(response.choices[0]!.message);
    } catch (error) {
      if (this.runSignal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      if (!json) throw error;

      this.throwIfAborted();
      const response = await this.client.chat.completions.create(
        {
          model: this.settings.model,
          messages: request.messages,
          temperature: this.settings.temperature,
        },
        options,
      );
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
      this.throwIfAborted();
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

  private formatReflectionContext(reflection: ReflectionPayload | null): string {
    if (!reflection) return "SUPERVISOR REFLECTION: Not available yet (first iteration).\n";

    return [
      `SUPERVISOR REFLECTION:`,
      `- Entity verdict: ${reflection.entity_verdict} (confidence: ${reflection.entity_confidence}%)`,
      `- Entity reasoning: ${reflection.entity_reasoning}`,
      `- Investigation quality: ${reflection.investigation_quality}`,
      `- Quality reasoning: ${reflection.quality_reasoning}`,
      `- Recommendation: ${reflection.recommendation}`,
      `- Recommendation reasoning: ${reflection.recommendation_reasoning}`,
      ...(reflection.pivot_suggestion
        ? [`- Pivot suggestion: ${reflection.pivot_suggestion}`]
        : []),
      ...(reflection.key_observations.length
        ? [`- Key observations:\n${reflection.key_observations.map((o) => `  • ${o}`).join("\n")}`]
        : []),
    ].join("\n") + "\n";
  }

  private async reflect(objective: string, run: AgentRun): Promise<ReflectionPayload> {
    const scoreTrajectory = run.iterations.map((i) => i.score.toFixed(1)).join(" → ");
    const evidenceTrajectory = run.iterations.map((i) => i.evidenceType).join(" → ");

    const user =
      `Objective:\n${objective}\n\n` +
      `Total iterations completed: ${run.iterations.length}\n` +
      `Score trajectory: ${scoreTrajectory || "(none)"}\n` +
      `Evidence type trajectory: ${evidenceTrajectory || "(none)"}\n` +
      `Current score: ${run.currentScore?.toFixed(2) ?? "not scored"}%\n\n` +
      `Complete iteration-by-iteration record:\n${buildIterationSummary(run)}\n\n` +
      `Current cumulative synthesis:\n${run.cumulativeSynthesis || "(none)"}`;

    return this.chatJson(REFLECTOR_SYSTEM, user, parseReflectionPayload);
  }

  private async plan(objective: string, run: AgentRun): Promise<PlanPayload> {
    const thresholds = MODE_THRESHOLDS[this.settings.mode];
    const priorQueries = collectPriorQueries(run);
    const openGaps = collectOpenGaps(run);
    const requireDisconfirm =
      (run.currentScore ?? 0) >= thresholds.disconfirmThreshold &&
      !run.hadDisconfirmingSearch;

    const reflectionContext = this.formatReflectionContext(run.lastReflection);

    const user =
      `Objective:\n${objective}\n\n` +
      (run.followUp
        ? `Follow-up request:\n${run.followUp}\n\nPrior report excerpt:\n${run.priorReport?.slice(0, 4000) || "(none)"}\n\n`
        : "") +
      `Current cumulative evidence score: ${run.currentScore?.toFixed(2) ?? "not scored yet"}%\n\n` +
      `Disconfirming search REQUIRED this round: ${requireDisconfirm ? "YES — you MUST set disconfirming: true" : "no"}\n\n` +
      `${reflectionContext}\n` +
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

    const reflectionContext = this.formatReflectionContext(run.lastReflection);

    const user =
      `Objective:\n${objective}\n\n` +
      `Previous cumulative evidence score: ${run.currentScore?.toFixed(2) ?? "null (first iteration)"}\n\n` +
      `Unique domains seen so far: ${totalUniqueDomainCount(run)}\n\n` +
      `${reflectionContext}\n` +
      `Cumulative synthesis so far:\n${run.cumulativeSynthesis || "(none)"}\n\n` +
      `Current angle: ${angle}\n\n` +
      `New web results this iteration:\n${evidence}`;

    return this.chatJson(ANALYST_SYSTEM, user, (raw) =>
      parseAnalysisPayload(raw, knownUrls),
    );
  }

  private async finalReport(objective: string, run: AgentRun): Promise<string> {
    const reflection = run.lastReflection;
    const reflectionSummary = reflection
      ? `Entity verdict: ${reflection.entity_verdict} (confidence: ${reflection.entity_confidence}%)\n` +
        `Entity reasoning: ${reflection.entity_reasoning}\n` +
        `Investigation quality: ${reflection.investigation_quality}\n` +
        `Key observations:\n${reflection.key_observations.map((o) => `- ${o}`).join("\n") || "(none)"}\n`
      : "";

    const user =
      `Objective:\n${objective}\n\n` +
      (run.followUp ? `Follow-up request:\n${run.followUp}\n\n` : "") +
      `Final cumulative evidence score: ${run.currentScore?.toFixed(2) ?? "0.00"}%\n\n` +
      `${reflectionSummary}\n` +
      `Cumulative synthesis:\n${run.cumulativeSynthesis}\n\n` +
      `Remaining gaps:\n${collectOpenGaps(run).map((gap) => `- ${gap}`).join("\n") || "(none)"}`;
    return this.chat(FINAL_SYSTEM, user);
  }

  async *run(
    objective: string,
    targetScore: number,
    signal?: AbortSignal,
    prior?: PriorResearchContext,
  ): AsyncGenerator<string> {
    this.runSignal = signal;
    const throwIfAborted = () => {
      if (signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
    };

    try {

    const thresholds = MODE_THRESHOLDS[this.settings.mode];
    const effectiveTarget = Math.min(targetScore, thresholds.targetScore);
    const rootObjective = prior?.rootObjective ?? objective;

    const agentRun: AgentRun = {
      objective: rootObjective,
      targetScore: effectiveTarget,
      cumulativeSynthesis: prior?.cumulativeSynthesis ?? "",
      currentScore: prior?.currentScore ?? null,
      iterations: [],
      allHits: [],
      fetchedUrlCache: new Set<string>(),
      hadDisconfirmingSearch: prior?.hadDisconfirmingSearch ?? false,
      lastReflection: null,
      followUp: prior?.followUp,
      priorReport: prior?.report,
      seedOpenGaps: prior?.openGaps,
      seedQueries: prior?.priorQueries,
      seedCitedUrls: prior?.citedUrls,
      seedUniqueDomainCount: prior?.uniqueDomainCount ?? 0,
    };

    yield event(
      "status",
      prior ? `Follow-up: ${prior.followUp}` : "Research started",
    );

    let iteration = prior?.iterationCount ?? 0;
    while (true) {
      throwIfAborted();
      iteration += 1;
      const plan = await this.plan(rootObjective, agentRun);
      throwIfAborted();
      const queries = plan.queries;
      const angle = plan.angle;

      yield event(
        "status",
        `Iteration ${iteration} · ${angle}${plan.disconfirming ? " · disconfirmation" : ""}`,
      );

      const queryResults: Array<[string, SearchHit[]]> = [];
      let totalHits = 0;

      for (const query of queries) {
        throwIfAborted();
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
      throwIfAborted();

      void cacheFaviconsForUrls([
        ...fetchedPages.map((page) => page.url),
        ...hits.map((hit) => hit.url),
      ]);

      if (fetchedPages.length > 0) {
        yield event("status", `${fetchedPages.length} page(s) fetched`);
      }

      yield event("status", `${totalHits} results · analyzing`);

      const analysis = await this.analyze(
        rootObjective,
        agentRun,
        angle,
        queryResults,
        fetchedPages,
      );
      throwIfAborted();

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
        uniqueDomainCount: totalUniqueDomainCount(agentRun),
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
        evidenceType: analysis.evidence_type,
        directEntityEvidence: analysis.direct_entity_evidence,
        disambiguationNotes: analysis.disambiguation_notes,
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
        gaps: (analysis.open_gaps ?? []).map(String),
      });
      yield event("rubric", JSON.stringify({ iteration, rubric, total: rubricTotal(rubric) }));
      yield event("score", score.toFixed(2));

      if (score >= effectiveTarget && gate.allowed) {
        yield event("status", `Target ${effectiveTarget}% reached`);
        break;
      }

      // --- Reflection: the LLM reviews the entire investigation and decides ---
      yield event("status", "Reflecting on investigation...");
      const reflection = await this.reflect(rootObjective, agentRun);
      throwIfAborted();
      agentRun.lastReflection = reflection;

      if (reflection.entity_confidence < 50) {
        score = capScoreForEntityConfidence(score, reflection.entity_confidence);
        agentRun.currentScore = score;
        yield event("score", score.toFixed(2));
      }

      if (!reflection.should_continue) {
        const reason = reflection.recommendation === "stop"
          ? `${reflection.recommendation_reasoning} (entity: ${reflection.entity_verdict}, confidence: ${reflection.entity_confidence}%)`
          : reflection.recommendation_reasoning || "Investigation concluded by supervisor";
        yield event("status", reason);
        break;
      }

      if (reflection.recommendation === "pivot") {
        yield event(
          "status",
          `Pivoting strategy: ${reflection.pivot_suggestion || reflection.recommendation_reasoning}`,
        );
      }

      if (!analysis.should_continue && reflection.should_continue) {
        yield event("status", "Analyst recommended stopping, but supervisor sees value in continuing");
      } else if (!analysis.should_continue) {
        yield event(
          "status",
          analysis.stop_reason || "Model stopped — diminishing returns from search",
        );
        break;
      }
    }

    yield event("status", "Generating final report...");
    throwIfAborted();
    const report = await this.finalReport(rootObjective, agentRun);
    throwIfAborted();
    yield event("report", report);
    } finally {
      this.runSignal = undefined;
    }
  }
}
