import { isAfter, isToday, isYesterday, subDays } from "date-fns";

import { parseStream } from "./stream.js";
import { readLocalStorageJson } from "./storage.js";
import type { HistoryGroupKey } from "./i18n.js";

export interface ResearchSession {
  id: string;
  objective: string;
  createdAt: number;
  updatedAt: number;
  status: "running" | "completed" | "cancelled" | "error";
  rawStream: string;
  error?: string;
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
  const parsed = parseStream(session.rawStream);
  const text =
    session.objective.trim() ||
    parsed.iterations[0]?.findings ||
    untitled;
  return text.length > 56 ? `${text.slice(0, 56)}…` : text;
}

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
