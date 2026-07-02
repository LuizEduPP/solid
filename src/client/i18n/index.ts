import {
  HISTORY_GROUP_KEYS,
  LOCALES,
  translations,
  type HistoryGroupKey,
  type Locale,
  type TranslationKey,
} from "./translations.js";

export {
  HISTORY_GROUP_KEYS,
  LOCALES,
  LOCALE_LABEL_KEYS,
  translations,
  type HistoryGroupKey,
  type Locale,
  type TranslationKey,
} from "./translations.js";

export type TranslateParams = Record<string, string | number>;

function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    String(params[key] ?? ""),
  );
}

export function normalizeLocale(value: unknown): Locale {
  if (typeof value === "string" && LOCALES.includes(value as Locale)) {
    return value as Locale;
  }
  return "en";
}

export function createTranslator(locale: Locale) {
  const table = translations[locale] ?? translations.en;

  function t(key: TranslationKey, params?: TranslateParams): string {
    const template = table[key] ?? translations.en[key] ?? key;
    return interpolate(template, params);
  }

  function historyGroupLabel(key: HistoryGroupKey): string {
    return t(HISTORY_GROUP_KEYS[key]);
  }

  return { t, historyGroupLabel, locale };
}

export type Translator = ReturnType<typeof createTranslator>;

export function translateActivityLine(line: string, tr: Translator): string {
  const { t } = tr;
  const trimmed = line.trim();
  if (!trimmed) return line;

  if (trimmed === "Research started") return t("activityResearchStarted");
  if (trimmed === "Cancelled.") return t("cancelled");
  if (trimmed === "Generating final report...") {
    return t("activityGeneratingReport");
  }
  if (
    trimmed ===
    "Model stopped — diminishing returns from search"
  ) {
    return t("activityModelStopped");
  }

  let match = trimmed.match(/^Search failed: (.+)$/);
  if (match) return t("activitySearchFailed", { query: match[1]! });

  match = trimmed.match(/^(\d+) page\(s\) fetched$/);
  if (match) return t("activityPagesFetched", { count: match[1]! });

  match = trimmed.match(/^(\d+) results · analyzing$/);
  if (match) return t("activityResultsAnalyzing", { count: match[1]! });

  match = trimmed.match(/^Score capped: (.+)$/);
  if (match) {
    return t("activityScoreCapped", {
      reason: translateGateReason(match[1]!, tr),
    });
  }

  match = trimmed.match(/^Target (\d+)% reached$/);
  if (match) return t("activityTargetReached", { target: match[1]! });

  match = trimmed.match(
    /^Iteration (\d+) · (.+?)( · disconfirmation)?$/,
  );
  if (match) {
    const suffix = match[3]
      ? ` · ${t("activityDisconfirmation")}`
      : "";
    return `${t("activityIteration", { n: match[1]!, angle: match[2]! })}${suffix}`;
  }

  return line;
}

function translateGateReason(reason: string, tr: Translator): string {
  const { t } = tr;

  let match = reason.match(/^(\d+) open gap\(s\)$/);
  if (match) return t("gateOpenGaps", { count: match[1]! });

  match = reason.match(/^minimum (\d+) iterations$/);
  if (match) return t("gateMinIterations", { count: match[1]! });

  match = reason.match(/^minimum (\d+) unique domains$/);
  if (match) return t("gateMinDomains", { count: match[1]! });

  if (reason === "missing disconfirmation round") {
    return t("gateDisconfirmation");
  }

  return reason;
}

export function localeToHtmlLang(locale: Locale): string {
  return locale;
}
