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

const STORAGE_KEY = "deepsearch-history";
const MAX_SESSIONS = 40;

export function loadHistory(): ResearchSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ResearchSession[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveHistory(sessions: ResearchSession[]): void {
  localStorage.setItem(
    STORAGE_KEY,
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

export function formatSessionDate(timestamp: number): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

export function sessionPreview(session: ResearchSession): string {
  const text =
    session.objective.trim() ||
    session.iterations[0]?.findings ||
    "Pesquisa sem título";
  return text.length > 72 ? `${text.slice(0, 72)}…` : text;
}
