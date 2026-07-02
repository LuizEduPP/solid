import { normalizeLocale, type Locale } from "./i18n.js";

export const SETTINGS_KEY = "solid-settings";
const LEGACY_SETTINGS_KEYS = ["rigor-settings", "deepsearch-settings"] as const;

export type ResearchMode = "rigorous" | "fast";

export interface WebSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
  mode: ResearchMode;
  locale: Locale;
}

export const MODE_TARGETS: Record<ResearchMode, number> = {
  rigorous: 100,
  fast: 85,
};

export const DEFAULT_WEB_SETTINGS: WebSettings = {
  apiKey: "",
  baseUrl: "http://127.0.0.1:1234/v1",
  model: "",
  mode: "rigorous",
  locale: "en",
};

export function loadWebSettings(): WebSettings {
  try {
    let raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      for (const key of LEGACY_SETTINGS_KEYS) {
        raw = localStorage.getItem(key);
        if (raw) break;
      }
    }
    if (!raw) return DEFAULT_WEB_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<WebSettings>;
    return {
      apiKey: parsed.apiKey ?? DEFAULT_WEB_SETTINGS.apiKey,
      baseUrl: parsed.baseUrl ?? DEFAULT_WEB_SETTINGS.baseUrl,
      model: parsed.model ?? DEFAULT_WEB_SETTINGS.model,
      mode: parsed.mode === "fast" ? "fast" : "rigorous",
      locale: normalizeLocale(parsed.locale),
    };
  } catch {
    return DEFAULT_WEB_SETTINGS;
  }
}
