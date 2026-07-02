import "dotenv/config";

export interface Settings {
  openaiApiKey: string;
  openaiBaseUrl: string;
  model: string;
  targetScore: number;
  maxIterations: number;
  minScore: number;
  resultsPerQuery: number;
  host: string;
  port: number;
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

export function loadSettings(): Settings {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    throw new Error("OPENAI_API_KEY is required");
  }

  return {
    openaiApiKey,
    openaiBaseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    model: process.env.DEEPSEARCH_MODEL ?? "gpt-4o-mini",
    targetScore: envNumber("DEEPSEARCH_TARGET_SCORE", 90),
    maxIterations: envNumber("DEEPSEARCH_MAX_ITERATIONS", 10),
    minScore: envNumber("DEEPSEARCH_MIN_SCORE", 0.01),
    resultsPerQuery: envNumber("DEEPSEARCH_RESULTS_PER_QUERY", 5),
    host: process.env.DEEPSEARCH_HOST ?? "0.0.0.0",
    port: envNumber("DEEPSEARCH_PORT", 8787),
  };
}
