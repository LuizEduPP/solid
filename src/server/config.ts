import "dotenv/config";

export interface ServerConfig {
  host: string;
  port: number;
}

export interface AgentConfig {
  openaiApiKey: string;
  openaiBaseUrl: string;
  model: string;
  minScore: number;
  resultsPerQuery: number;
}

export const AGENT_DEFAULTS = {
  openaiBaseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  minScore: 0.01,
  resultsPerQuery: 5,
  targetScore: 85,
  maxIterations: 6,
} as const;

export function loadServerConfig(): ServerConfig {
  const port = Number(process.env.PORT);
  return {
    host: process.env.HOST ?? "0.0.0.0",
    port: Number.isFinite(port) && port > 0 ? port : 8787,
  };
}
