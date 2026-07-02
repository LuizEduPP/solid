import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import de from "./locales/de.json";
import en from "./locales/en.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import it from "./locales/it.json";
import ptBR from "./locales/pt-BR.json";
import ptPT from "./locales/pt-PT.json";

export const SUPPORTED_LOCALES = [
  "en",
  "es",
  "pt-BR",
  "pt-PT",
  "fr",
  "de",
  "it",
] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const LOCALE_LABEL_KEYS: Record<Locale, string> = {
  en: "langEn",
  es: "langEs",
  "pt-BR": "langPtBr",
  "pt-PT": "langPtPt",
  fr: "langFr",
  de: "langDe",
  it: "langIt",
};

export const HISTORY_GROUP_KEYS = {
  today: "historyToday",
  yesterday: "historyYesterday",
  last7: "historyLast7Days",
  earlier: "historyEarlier",
} as const;

export type HistoryGroupKey = keyof typeof HISTORY_GROUP_KEYS;

export function normalizeLocale(value: unknown): Locale {
  if (typeof value === "string" && SUPPORTED_LOCALES.includes(value as Locale)) {
    return value as Locale;
  }
  return "en";
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
    "pt-BR": { translation: ptBR },
    "pt-PT": { translation: ptPT },
    fr: { translation: fr },
    de: { translation: de },
    it: { translation: it },
  },
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
