const STORAGE_KEY = "deepsearch-settings";

export interface WebSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
  targetScore: number;
  maxIterations: number;
}

export const DEFAULT_WEB_SETTINGS: WebSettings = {
  apiKey: "",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  targetScore: 85,
  maxIterations: 6,
};

export function loadWebSettings(): WebSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_WEB_SETTINGS;
    return { ...DEFAULT_WEB_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_WEB_SETTINGS;
  }
}

export function saveWebSettings(settings: WebSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
