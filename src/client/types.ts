import type { Locale } from "./i18n";
import type { ResearchMode } from "../shared";

export type { ResearchMode } from "../shared";

export interface WebSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
  mode: ResearchMode;
  locale: Locale;
}

export interface ResearchSession {
  id: string;
  objective: string;
  createdAt: number;
  updatedAt: number;
  status: "running" | "completed" | "cancelled" | "error";
  rawStream: string;
  error?: string;
}
