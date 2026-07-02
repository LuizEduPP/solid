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

export function sessionPreview(session: ResearchSession): string {
  const text =
    session.objective.trim() ||
    session.iterations[0]?.findings ||
    "Pesquisa sem título";
  return text.length > 56 ? `${text.slice(0, 56)}…` : text;
}

export interface HistoryGroup {
  label: string;
  sessions: ResearchSession[];
}

export function groupSessionsByDate(
  sessions: ResearchSession[],
): HistoryGroup[] {
  const groups = new Map<string, ResearchSession[]>();
  const now = new Date();
  const today = startOfDay(now);
  const yesterday = today - 86_400_000;
  const weekAgo = today - 7 * 86_400_000;

  for (const session of sessions) {
    const day = startOfDay(new Date(session.updatedAt));
    let label: string;

    if (day >= today) label = "Hoje";
    else if (day >= yesterday) label = "Ontem";
    else if (day >= weekAgo) label = "Últimos 7 dias";
    else label = "Anterior";

    const bucket = groups.get(label) ?? [];
    bucket.push(session);
    groups.set(label, bucket);
  }

  const order = ["Hoje", "Ontem", "Últimos 7 dias", "Anterior"];
  return order
    .filter((label) => groups.has(label))
    .map((label) => ({ label, sessions: groups.get(label)! }));
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
