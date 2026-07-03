import { isAfter, isToday, isYesterday, subDays } from "date-fns";
import { saveAs } from "file-saver";

import { compressStepsActivity, translateActivityLine } from "./activity";
import i18n, { normalizeLocale, type HistoryGroupKey } from "./i18n";
import { parseStream, uniqueSourceCount } from "./stream";
import type { PriorResearchContext } from "../shared";
import type { ResearchSession, WebSettings } from "./types";

export type { ResearchSession, WebSettings } from "./types";

function readLocalStorageJson<T>(
  key: string,
  legacyKeys: readonly string[],
  fallback: T,
): T {
  try {
    let raw = localStorage.getItem(key);
    if (!raw) {
      for (const legacyKey of legacyKeys) {
        raw = localStorage.getItem(legacyKey);
        if (raw) break;
      }
    }
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export const SETTINGS_KEY = "solid-settings";
const LEGACY_SETTINGS_KEYS = ["rigor-settings", "deepsearch-settings"] as const;

export const DEFAULT_WEB_SETTINGS: WebSettings = {
  apiKey: "",
  baseUrl: "http://127.0.0.1:1234/v1",
  model: "",
  mode: "rigorous",
  locale: "en",
};

export function isLocalLlmBaseUrl(baseUrl: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(baseUrl.trim());
}

export function loadWebSettings(): WebSettings {
  const parsed = readLocalStorageJson<Partial<WebSettings>>(
    SETTINGS_KEY,
    LEGACY_SETTINGS_KEYS,
    DEFAULT_WEB_SETTINGS,
  );

  return {
    apiKey: parsed.apiKey ?? DEFAULT_WEB_SETTINGS.apiKey,
    baseUrl: parsed.baseUrl ?? DEFAULT_WEB_SETTINGS.baseUrl,
    model: parsed.model ?? DEFAULT_WEB_SETTINGS.model,
    mode: parsed.mode === "fast" ? "fast" : "rigorous",
    locale: normalizeLocale(parsed.locale),
  };
}

export const HISTORY_KEY = "solid-history";
const LEGACY_HISTORY_KEYS = ["rigor-history", "deepsearch-history"] as const;
const MAX_SESSIONS = 40;

export function loadHistory(): ResearchSession[] {
  const parsed = readLocalStorageJson<unknown>(
    HISTORY_KEY,
    LEGACY_HISTORY_KEYS,
    [],
  );
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isResearchSession);
}

function isResearchSession(value: unknown): value is ResearchSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<ResearchSession>;
  return (
    typeof session.id === "string" &&
    typeof session.objective === "string" &&
    typeof session.createdAt === "number" &&
    typeof session.updatedAt === "number" &&
    typeof session.status === "string" &&
    typeof session.rawStream === "string"
  );
}

export function createSession(objective: string): ResearchSession {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    objective,
    createdAt: now,
    updatedAt: now,
    status: "running",
    rawStream: "",
  };
}

export function touchSession(
  session: ResearchSession,
  patch: Partial<ResearchSession>,
): ResearchSession {
  return {
    ...session,
    ...patch,
    updatedAt: Date.now(),
  };
}

export function upsertSession(
  sessions: ResearchSession[],
  session: ResearchSession,
): ResearchSession[] {
  const index = sessions.findIndex((item) => item.id === session.id);
  const next =
    index >= 0
      ? sessions.map((item, i) => (i === index ? session : item))
      : [session, ...sessions];
  return next.slice(0, MAX_SESSIONS);
}

export function deleteSession(
  sessions: ResearchSession[],
  id: string,
): ResearchSession[] {
  return sessions.filter((item) => item.id !== id);
}

export function sessionPreview(session: ResearchSession, untitled: string): string {
  if (session.title) return session.title;
  const parsed = parseStream(session.rawStream);
  const text =
    session.objective.trim() ||
    parsed.iterations[0]?.findings ||
    untitled;
  return text.length > 56 ? `${text.slice(0, 56)}…` : text;
}

export function buildPriorContext(
  session: ResearchSession,
  followUp: string,
): PriorResearchContext {
  const parsed = parseStream(session.rawStream);
  const lastIteration = parsed.iterations.at(-1);

  return {
    rootObjective: session.objective,
    followUp,
    cumulativeSynthesis: lastIteration?.synthesis ?? "",
    currentScore: parsed.confidence,
    report: parsed.report,
    openGaps: lastIteration?.gaps ?? [],
    priorQueries: parsed.iterations.map((iteration) => iteration.angle).filter(Boolean),
    citedUrls: parsed.iterations.flatMap((iteration) => iteration.citedUrls ?? []),
    uniqueDomainCount: uniqueSourceCount(parsed.iterations),
    iterationCount: parsed.iterations.length,
    hadDisconfirmingSearch: parsed.iterations.some((iteration) => iteration.disconfirming),
  };
}

interface HistoryGroup {
  key: HistoryGroupKey;
  sessions: ResearchSession[];
}

function historyBucket(date: Date): HistoryGroupKey {
  if (isToday(date)) return "today";
  if (isYesterday(date)) return "yesterday";
  if (isAfter(date, subDays(new Date(), 7))) return "last7";
  return "earlier";
}

export function groupSessionsByDate(
  sessions: ResearchSession[],
): HistoryGroup[] {
  const groups = new Map<HistoryGroupKey, ResearchSession[]>();

  for (const session of sessions) {
    const key = historyBucket(new Date(session.updatedAt));
    const bucket = groups.get(key) ?? [];
    bucket.push(session);
    groups.set(key, bucket);
  }

  const order: HistoryGroupKey[] = ["today", "yesterday", "last7", "earlier"];
  return order
    .filter((key) => groups.has(key))
    .map((key) => ({ key, sessions: groups.get(key)! }));
}

function exportSessionMarkdown(session: ResearchSession): string {
  const t = i18n.t.bind(i18n);
  const parsed = parseStream(session.rawStream);
  const lines: string[] = [
    `# ${session.objective}`,
    "",
    `- ${t("exportStatus")}: ${session.status}`,
    `- ${t("exportSolidness")}: ${parsed.confidence.toFixed(1)}%`,
    `- ${t("exportUpdated")}: ${new Date(session.updatedAt).toISOString()}`,
    "",
  ];

  if (parsed.report) {
    lines.push(`## ${t("exportAnswer")}`, "", parsed.report, "");
  }

  if (parsed.iterations.length > 0) {
    lines.push(`## ${t("exportSteps")}`, "");
    for (const iteration of parsed.iterations) {
      lines.push(
        `### ${t("exportStep")} ${iteration.number} (${iteration.score.toFixed(0)}%)`,
        "",
        iteration.angle ? `**${t("exportAngle")}:** ${iteration.angle}` : "",
        "",
        iteration.findings,
        "",
      );
    }
  }

  if (parsed.activity.length > 0) {
    const log = compressStepsActivity(parsed.activity)
      .map(translateActivityLine)
      .filter(Boolean);
    if (log.length > 0) {
      lines.push(`## ${t("exportLog")}`, "", "```", log.join("\n"), "```", "");
    }
  }

  return lines.filter(Boolean).join("\n");
}

export function downloadSession(session: ResearchSession): void {
  const markdown = exportSessionMarkdown(session);
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  saveAs(blob, `solid-${session.id.slice(0, 8)}.md`);
}
