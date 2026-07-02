import { normalizeLocale, type Locale } from "./i18n";
import { readLocalStorageJson } from "./storage";
import type { ResearchMode } from "../shared/types";

export type { ResearchMode } from "../shared/types";

export const SETTINGS_KEY = "solid-settings";
const LEGACY_SETTINGS_KEYS = ["rigor-settings", "deepsearch-settings"] as const;

export interface WebSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
  mode: ResearchMode;
  locale: Locale;
}

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
