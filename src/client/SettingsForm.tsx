import {
  PasswordInput,
  Select,
  Stack,
  TextInput,
} from "@mantine/core";
import { useTranslation } from "react-i18next";

import {
  LOCALE_LABEL_KEYS,
  SUPPORTED_LOCALES,
  type Locale,
} from "./i18n.js";
import {
  DEFAULT_WEB_SETTINGS,
  type WebSettings,
} from "./settings.js";

function updateSettings<K extends keyof WebSettings>(
  current: WebSettings,
  key: K,
  value: WebSettings[K],
): WebSettings {
  return { ...current, [key]: value };
}

interface SettingsFormProps {
  settings: WebSettings;
  running: boolean;
  models: string[];
  modelsLoading: boolean;
  modelsError: string | null;
  onChange: (next: WebSettings) => void;
}

export default function SettingsForm({
  settings,
  running,
  models,
  modelsLoading,
  modelsError,
  onChange,
}: SettingsFormProps) {
  const { t } = useTranslation();

  const localeOptions = SUPPORTED_LOCALES.map((locale) => ({
    value: locale,
    label: t(LOCALE_LABEL_KEYS[locale]),
  }));

  const modelOptions =
    models.length > 0
      ? models.map((modelId) => ({ value: modelId, label: modelId }))
      : [{ value: "", label: modelsError ?? t("noModelsAvailable") }];

  const current = settings ?? DEFAULT_WEB_SETTINGS;

  return (
    <Stack gap="md">
      <Select
        label={t("language")}
        value={current.locale}
        data={localeOptions}
        disabled={running}
        onChange={(value) =>
          value && onChange(updateSettings(current, "locale", value as Locale))
        }
      />
      <PasswordInput
        label={t("apiKey")}
        placeholder={t("apiKeyPlaceholder")}
        value={current.apiKey}
        disabled={running}
        autoComplete="off"
        onChange={(event) =>
          onChange(updateSettings(current, "apiKey", event.currentTarget.value))
        }
      />
      <TextInput
        label={t("baseUrl")}
        value={current.baseUrl}
        disabled={running}
        onChange={(event) =>
          onChange(updateSettings(current, "baseUrl", event.currentTarget.value))
        }
      />
      <Select
        label={t("model")}
        value={current.model}
        data={modelOptions}
        disabled={running || modelsLoading}
        placeholder={modelsLoading ? t("loadingModels") : undefined}
        error={modelsError ?? undefined}
        searchable
        onChange={(value) =>
          onChange(updateSettings(current, "model", value ?? ""))
        }
      />
    </Stack>
  );
}
