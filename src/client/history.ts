import type { ParsedStream } from "./stream";

export interface ResearchSession {
  id: string;
  objective: string;
  createdAt: number;
  updatedAt: number;
  status: "running" | "completed" | "cancelled" | "error";
  confidence: number;
  iterations: ParsedStream["iterations"];
  report: string;
  activity: string[];
  rawStream: string;
  error?: string;
}

const HISTORY_KEY = "solid-history";
const LEGACY_HISTORY_KEYS = ["rigor-history", "deepsearch-history"] as const;
const MAX_SESSIONS = 40;

export function loadHistory(): ResearchSession[] {
  try {
    let raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) {
      for (const key of LEGACY_HISTORY_KEYS) {
        raw = localStorage.getItem(key);
        if (raw) break;
      }
    }
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ResearchSession[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveHistory(sessions: ResearchSession[]): void {
  localStorage.setItem(
    HISTORY_KEY,
    JSON.stringify(sessions.slice(0, MAX_SESSIONS)),
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
    confidence: 0,
    iterations: [],
    report: "",
    activity: [],
    rawStream: "",
  };
}

export function applyParsedStream(
  session: ResearchSession,
  parsed: ParsedStream,
  rawStream: string,
): ResearchSession {
  return {
    ...session,
    updatedAt: Date.now(),
    confidence: parsed.confidence,
    iterations: parsed.iterations,
    report: parsed.report,
    activity: parsed.activity,
    rawStream,
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
  saveHistory(next);
  return next;
}

export function deleteSession(
  sessions: ResearchSession[],
  id: string,
): ResearchSession[] {
  const next = sessions.filter((item) => item.id !== id);
  saveHistory(next);
  return next;
}

export function sessionPreview(session: ResearchSession, untitled: string): string {
  const text =
    session.objective.trim() ||
    session.iterations[0]?.findings ||
    untitled;
  return text.length > 56 ? `${text.slice(0, 56)}…` : text;
}

export interface HistoryGroup {
  key: HistoryGroupKey;
  sessions: ResearchSession[];
}

export type HistoryGroupKey = "today" | "yesterday" | "last7" | "earlier";

export function groupSessionsByDate(
  sessions: ResearchSession[],
): HistoryGroup[] {
  const groups = new Map<HistoryGroupKey, ResearchSession[]>();
  const now = new Date();
  const today = startOfDay(now);
  const yesterday = today - 86_400_000;
  const weekAgo = today - 7 * 86_400_000;

  for (const session of sessions) {
    const day = startOfDay(new Date(session.updatedAt));
    let key: HistoryGroupKey;

    if (day >= today) key = "today";
    else if (day >= yesterday) key = "yesterday";
    else if (day >= weekAgo) key = "last7";
    else key = "earlier";

    const bucket = groups.get(key) ?? [];
    bucket.push(session);
    groups.set(key, bucket);
  }

  const order: HistoryGroupKey[] = ["today", "yesterday", "last7", "earlier"];
  return order
    .filter((key) => groups.has(key))
    .map((key) => ({ key, sessions: groups.get(key)! }));
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
