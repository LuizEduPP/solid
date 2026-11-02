import type {
  IntegrationEndpoints,
  IntegrationKeys,
  Locale,
  ResearchMode,
  ScrapeProvider,
  SearchProvider,
} from "../shared";

export interface WebSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
  mode: ResearchMode;
  locale: Locale;
  searchProvider: SearchProvider;
  scrapeProvider: ScrapeProvider;
  integrationKeys: IntegrationKeys;
  integrationEndpoints: IntegrationEndpoints;
}

export interface ResearchSession {
  id: string;
  objective: string;
  title?: string;
  createdAt: number;
  updatedAt: number;
  status: "running" | "completed" | "cancelled" | "error";
  rawStream: string;
  error?: string;
}
