import {
  Accordion,
  Anchor,
  PasswordInput,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useTranslation } from "react-i18next";

import {
  LOCALE_LABEL_KEYS,
  SUPPORTED_LOCALES,
  type Locale,
} from "./i18n";
import { DEFAULT_WEB_SETTINGS, type WebSettings } from "./local-store";
import {
  DEFAULT_INTEGRATION_ENDPOINTS,
  scrapeProviderNeedsKey,
  searchProviderNeedsKey,
  type IntegrationEndpoints,
  type IntegrationKeys,
  type ScrapeProvider,
  type SearchProvider,
} from "../shared";

interface SettingsFormProps {
  settings: WebSettings;
  running: boolean;
  models: string[];
  modelsLoading: boolean;
  modelsError: string | null;
  onChange: (next: WebSettings) => void;
}

const SEARCH_DOCS: Partial<Record<SearchProvider, string>> = {
  exa: "https://dashboard.exa.ai",
  tavily: "https://app.tavily.com",
  brave: "https://brave.com/search/api/",
  firecrawl: "https://docs.firecrawl.dev/contributing/self-host",
};

const SCRAPE_DOCS: Partial<Record<ScrapeProvider, string>> = {
  firecrawl: "https://docs.firecrawl.dev/contributing/self-host",
  jina: "https://jina.ai/reader",
};

const KEY_FIELD: Record<Exclude<SearchProvider, "duckduckgo"> | "jina", keyof IntegrationKeys> = {
  exa: "exa",
  tavily: "tavily",
  brave: "brave",
  firecrawl: "firecrawl",
  jina: "jina",
};

export default function SettingsForm({
  settings,
  running,
  models,
  modelsLoading,
  modelsError,
  onChange,
}: SettingsFormProps) {
  const { t } = useTranslation();
  const current = settings ?? DEFAULT_WEB_SETTINGS;

  const localeOptions = SUPPORTED_LOCALES.map((locale) => ({
    value: locale,
    label: t(LOCALE_LABEL_KEYS[locale]),
  }));

  const modelOptions =
    models.length > 0
      ? models.map((modelId) => ({ value: modelId, label: modelId }))
      : [{ value: "", label: modelsError ?? t("noModelsAvailable") }];

  const searchOptions: Array<{ value: SearchProvider; label: string }> = [
    { value: "duckduckgo", label: t("providerDuckDuckGo") },
    { value: "exa", label: t("providerExa") },
    { value: "tavily", label: t("providerTavily") },
    { value: "brave", label: t("providerBrave") },
    { value: "firecrawl", label: t("providerFirecrawl") },
  ];

  const scrapeOptions: Array<{ value: ScrapeProvider; label: string }> = [
    { value: "direct", label: t("providerDirect") },
    { value: "firecrawl", label: t("providerFirecrawl") },
    { value: "jina", label: t("providerJina") },
  ];

  const patch = (next: Partial<WebSettings>) => onChange({ ...current, ...next });
  const patchKey = (field: keyof IntegrationKeys, value: string) =>
    patch({
      integrationKeys: { ...current.integrationKeys, [field]: value },
    });
  const patchEndpoint = (field: keyof IntegrationEndpoints, value: string) =>
    patch({
      integrationEndpoints: { ...current.integrationEndpoints, [field]: value },
    });

  const scrapeUsesReader = current.scrapeProvider !== "direct";
  const showFirecrawlInSearch = current.searchProvider === "firecrawl";
  const showFirecrawlInScrape =
    current.scrapeProvider === "firecrawl" && current.searchProvider !== "firecrawl";
  const showJina = current.scrapeProvider === "jina";
  const searchKeyField =
    current.searchProvider !== "duckduckgo" && current.searchProvider !== "firecrawl"
      ? KEY_FIELD[current.searchProvider]
      : null;

  const searchNeedsKey = searchProviderNeedsKey(
    current.searchProvider,
    current.searchProvider === "exa"
      ? current.integrationEndpoints.exa
      : current.searchProvider === "tavily"
        ? current.integrationEndpoints.tavily
        : current.searchProvider === "brave"
          ? current.integrationEndpoints.brave
          : current.integrationEndpoints.firecrawl,
  );
  const scrapeNeedsKey = scrapeProviderNeedsKey(
    current.scrapeProvider,
    current.integrationEndpoints.firecrawl,
  );
  const firecrawlKeyOptional = !searchProviderNeedsKey(
    "firecrawl",
    current.integrationEndpoints.firecrawl,
  );
  const selectedSearchKey =
    current.searchProvider === "duckduckgo"
      ? ""
      : current.integrationKeys[KEY_FIELD[current.searchProvider]];
  const searchKeyMissing = searchNeedsKey && !selectedSearchKey.trim();
  const scrapeKeyMissing =
    scrapeNeedsKey && !current.integrationKeys.firecrawl.trim();

  return (
    <Accordion multiple defaultValue={["model", "search"]} variant="separated">
      <Accordion.Item value="general">
        <Accordion.Control>{t("settingsGeneral")}</Accordion.Control>
        <Accordion.Panel>
          <Select
            label={t("language")}
            value={current.locale}
            data={localeOptions}
            disabled={running}
            onChange={(value) =>
              value && patch({ locale: value as Locale })
            }
          />
        </Accordion.Panel>
      </Accordion.Item>

      <Accordion.Item value="model">
        <Accordion.Control>{t("settingsModel")}</Accordion.Control>
        <Accordion.Panel>
          <Stack gap="md">
            <PasswordInput
              label={t("apiKey")}
              placeholder={t("apiKeyPlaceholder")}
              value={current.apiKey}
              disabled={running}
              autoComplete="off"
              onChange={(event) => patch({ apiKey: event.currentTarget.value })}
            />
            <TextInput
              label={t("baseUrl")}
              value={current.baseUrl}
              disabled={running}
              onChange={(event) => patch({ baseUrl: event.currentTarget.value })}
            />
            <Select
              label={t("model")}
              value={current.model}
              data={modelOptions}
              disabled={running || modelsLoading}
              placeholder={modelsLoading ? t("loadingModels") : undefined}
              error={modelsError ?? undefined}
              searchable
              onChange={(value) => patch({ model: value ?? "" })}
            />
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      <Accordion.Item value="search">
        <Accordion.Control>{t("settingsSearch")}</Accordion.Control>
        <Accordion.Panel>
          <Stack gap="md">
            <Select
              label={t("searchProvider")}
              description={t("searchProviderHint")}
              value={current.searchProvider}
              data={searchOptions}
              disabled={running}
              onChange={(value) =>
                value && patch({ searchProvider: value as SearchProvider })
              }
            />
            {searchKeyField ? (
              <ProviderConnectionFields
                endpoint={current.integrationEndpoints[searchKeyField]}
                endpointPlaceholder={DEFAULT_INTEGRATION_ENDPOINTS[searchKeyField]}
                keyLabel={t(`${searchKeyField}ApiKey`)}
                keyValue={current.integrationKeys[searchKeyField]}
                disabled={running}
                docsUrl={SEARCH_DOCS[current.searchProvider]}
                onEndpointChange={(value) => patchEndpoint(searchKeyField, value)}
                onKeyChange={(value) => patchKey(searchKeyField, value)}
              />
            ) : null}
            {showFirecrawlInSearch ? (
              <ProviderConnectionFields
                endpoint={current.integrationEndpoints.firecrawl}
                endpointPlaceholder={DEFAULT_INTEGRATION_ENDPOINTS.firecrawl}
                keyLabel={t("firecrawlApiKey")}
                keyValue={current.integrationKeys.firecrawl}
                disabled={running}
                docsUrl={SEARCH_DOCS.firecrawl}
                keyOptional={firecrawlKeyOptional}
                onEndpointChange={(value) => patchEndpoint("firecrawl", value)}
                onKeyChange={(value) => patchKey("firecrawl", value)}
              />
            ) : null}
            {searchKeyMissing ? (
              <Text size="xs" c="dimmed">
                {t("providerMissingKey", {
                  provider: searchOptions.find((item) => item.value === current.searchProvider)?.label,
                })}
              </Text>
            ) : null}
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      <Accordion.Item value="scrape">
        <Accordion.Control>{t("settingsScrape")}</Accordion.Control>
        <Accordion.Panel>
          <Stack gap="md">
            <Select
              label={t("scrapeProvider")}
              description={t("scrapeProviderHint")}
              value={current.scrapeProvider}
              data={scrapeOptions}
              disabled={running}
              onChange={(value) =>
                value && patch({ scrapeProvider: value as ScrapeProvider })
              }
            />
            {showFirecrawlInScrape ? (
              <ProviderConnectionFields
                endpoint={current.integrationEndpoints.firecrawl}
                endpointPlaceholder={DEFAULT_INTEGRATION_ENDPOINTS.firecrawl}
                keyLabel={t("firecrawlApiKey")}
                keyValue={current.integrationKeys.firecrawl}
                disabled={running}
                docsUrl={SCRAPE_DOCS.firecrawl}
                keyOptional={firecrawlKeyOptional}
                onEndpointChange={(value) => patchEndpoint("firecrawl", value)}
                onKeyChange={(value) => patchKey("firecrawl", value)}
              />
            ) : null}
            {showJina ? (
              <ProviderConnectionFields
                endpoint={current.integrationEndpoints.jina}
                endpointPlaceholder={DEFAULT_INTEGRATION_ENDPOINTS.jina}
                keyLabel={t("jinaApiKey")}
                keyValue={current.integrationKeys.jina}
                disabled={running}
                docsUrl={SCRAPE_DOCS.jina}
                keyOptional
                onEndpointChange={(value) => patchEndpoint("jina", value)}
                onKeyChange={(value) => patchKey("jina", value)}
              />
            ) : null}
            {scrapeUsesReader && current.searchProvider === "firecrawl" && current.scrapeProvider === "firecrawl" ? (
              <Text size="xs" c="dimmed">
                {t("providerSharedFirecrawl")}
              </Text>
            ) : null}
            {scrapeKeyMissing ? (
              <Text size="xs" c="dimmed">
                {t("providerMissingScrapeKey", { provider: t("providerFirecrawl") })}
              </Text>
            ) : null}
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}

function ProviderConnectionFields({
  endpoint,
  endpointPlaceholder,
  keyLabel,
  keyValue,
  disabled,
  docsUrl,
  keyOptional,
  onEndpointChange,
  onKeyChange,
}: {
  endpoint: string;
  endpointPlaceholder: string;
  keyLabel: string;
  keyValue: string;
  disabled: boolean;
  docsUrl?: string;
  keyOptional?: boolean;
  onEndpointChange: (value: string) => void;
  onKeyChange: (value: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <Stack gap="sm">
      <TextInput
        label={t("providerBaseUrl")}
        description={t("providerBaseUrlHint")}
        placeholder={endpointPlaceholder}
        value={endpoint}
        disabled={disabled}
        onChange={(event) => onEndpointChange(event.currentTarget.value)}
      />
      <PasswordInput
        label={keyLabel}
        description={
          keyOptional
            ? t("providerKeyOptionalSelfHosted")
            : undefined
        }
        value={keyValue}
        disabled={disabled}
        autoComplete="off"
        onChange={(event) => onKeyChange(event.currentTarget.value)}
      />
      {docsUrl ? (
        <Anchor href={docsUrl} target="_blank" rel="noreferrer" size="xs">
          {t("providerDocs")}
        </Anchor>
      ) : null}
    </Stack>
  );
}
