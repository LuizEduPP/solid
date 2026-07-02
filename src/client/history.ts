import { isAfter, isToday, isYesterday, subDays } from "date-fns";

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

export const HISTORY_KEY = "solid-history";
const LEGACY_HISTORY_KEYS = ["rigor-history", "deepsearch-history"] as const;
export const MAX_SESSIONS = 40;

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
  return next.slice(0, MAX_SESSIONS);
}

export function deleteSession(
  sessions: ResearchSession[],
  id: string,
): ResearchSession[] {
  return sessions.filter((item) => item.id !== id);
}

export function sessionPreview(session: ResearchSession, untitled: string): string {
  const text =
    session.objective.trim() ||
    session.iterations[0]?.findings ||
    untitled;
  return text.length > 56 ? `${text.slice(0, 56)}…` : text;
}

export type HistoryGroupKey = "today" | "yesterday" | "last7" | "earlier";

export interface HistoryGroup {
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
