const STORAGE_KEY = "deepsearch-settings";

export interface WebSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export const DEFAULT_WEB_SETTINGS: WebSettings = {
  apiKey: "",
  baseUrl: "http://127.0.0.1:1234/v1",
  model: "",
};

export function loadWebSettings(): WebSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_WEB_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<WebSettings>;
    return {
      apiKey: parsed.apiKey ?? DEFAULT_WEB_SETTINGS.apiKey,
      baseUrl: parsed.baseUrl ?? DEFAULT_WEB_SETTINGS.baseUrl,
      model: parsed.model ?? DEFAULT_WEB_SETTINGS.model,
    };
  } catch {
    return DEFAULT_WEB_SETTINGS;
  }
}

export function saveWebSettings(settings: WebSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
