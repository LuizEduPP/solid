import { Accordion, Anchor, PasswordInput, Select, Stack, Text, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import {
  DEFAULT_INTEGRATION_ENDPOINTS,
  type IntegrationEndpoints,
  type IntegrationField,
  type IntegrationKeys,
  isScrapeProvider,
  isSearchProvider,
  type Locale,
  SCRAPE_I18N,
  SCRAPE_PROVIDERS,
  type ScrapeProvider,
  SEARCH_I18N,
  SEARCH_INTEGRATION_FIELD,
  SEARCH_PROVIDERS,
  type SearchProvider,
  SUPPORTED_LOCALES,
  scrapeProviderNeedsKey,
  searchProviderEndpoint,
  searchProviderNeedsKey,
} from "../shared";
import { LOCALE_LABEL_KEYS } from "./i18n";
import type { WebSettings } from "./types";

interface SettingsFormProps {
  settings: WebSettings;
  running: boolean;
  models: string[];
  modelsLoading: boolean;
  modelsError: string | null;
  onChange: (next: WebSettings) => void;
}

const SEARCH_DOCS: Partial<Record<SearchProvider, string>> = {
  searxng: "https://docs.searxng.org/",
  exa: "https://dashboard.exa.ai",
  tavily: "https://app.tavily.com",
  brave: "https://brave.com/search/api/",
  firecrawl: "https://docs.firecrawl.dev/contributing/self-host",
};

const SCRAPE_DOCS: Partial<Record<ScrapeProvider, string>> = {
  firecrawl: "https://docs.firecrawl.dev/contributing/self-host",
  jina: "https://jina.ai/reader",
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
  const current = settings;

  const localeOptions = SUPPORTED_LOCALES.map((locale) => ({
    value: locale,
    label: t(LOCALE_LABEL_KEYS[locale]),
  }));

  const modelOptions =
    models.length > 0
      ? models.map((modelId) => ({ value: modelId, label: modelId }))
      : [{ value: "", label: modelsError ?? t("noModelsAvailable") }];

  const searchOptions = SEARCH_PROVIDERS.map((value) => ({
    value,
    label: t(SEARCH_I18N[value]),
  }));

  const scrapeOptions = SCRAPE_PROVIDERS.map((value) => ({
    value,
    label: t(SCRAPE_I18N[value]),
  }));

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
  const searchField = SEARCH_INTEGRATION_FIELD[current.searchProvider];
  const searchKeyField = searchField && searchField !== "firecrawl" ? searchField : null;

  const searchNeedsKey = searchProviderNeedsKey(
    current.searchProvider,
    searchProviderEndpoint(current.searchProvider, current.integrationEndpoints),
  );
  const scrapeNeedsKey = scrapeProviderNeedsKey(
    current.scrapeProvider,
    current.integrationEndpoints.firecrawl,
  );
  const firecrawlKeyOptional = !searchProviderNeedsKey(
    "firecrawl",
    current.integrationEndpoints.firecrawl,
  );
  const selectedSearchKey = searchField ? current.integrationKeys[searchField] : "";
  const searchKeyMissing = searchNeedsKey && !selectedSearchKey.trim();
  const scrapeKeyMissing = scrapeNeedsKey && !current.integrationKeys.firecrawl.trim();

  const connect = (field: IntegrationField, docsUrl?: string, keyOptional?: boolean) => (
    <ProviderConnectionFields
      endpoint={current.integrationEndpoints[field]}
      endpointPlaceholder={DEFAULT_INTEGRATION_ENDPOINTS[field]}
      keyLabel={t(`${field}ApiKey`)}
      keyValue={current.integrationKeys[field]}
      disabled={running}
      docsUrl={docsUrl}
      keyOptional={keyOptional}
      onEndpointChange={(value) => patchEndpoint(field, value)}
      onKeyChange={(value) => patchKey(field, value)}
    />
  );

  return (
    <Accordion
      multiple
      defaultValue={["model", "search"]}
      className="settings-accordion"
      variant="default"
    >
      <Accordion.Item value="general">
        <Accordion.Control>{t("settingsGeneral")}</Accordion.Control>
        <Accordion.Panel>
          <Select
            label={t("language")}
            value={current.locale}
            data={localeOptions}
            disabled={running}
            onChange={(value) => value && patch({ locale: value as Locale })}
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
              onChange={(value) => isSearchProvider(value) && patch({ searchProvider: value })}
            />
            {searchKeyField
              ? connect(
                  searchKeyField,
                  SEARCH_DOCS[current.searchProvider],
                  current.searchProvider === "searxng",
                )
              : null}
            {showFirecrawlInSearch
              ? connect("firecrawl", SEARCH_DOCS.firecrawl, firecrawlKeyOptional)
              : null}
            {searchKeyMissing ? (
              <Text size="xs" c="dimmed">
                {t("providerMissingKey", {
                  provider: searchOptions.find((item) => item.value === current.searchProvider)
                    ?.label,
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
              onChange={(value) => isScrapeProvider(value) && patch({ scrapeProvider: value })}
            />
            {showFirecrawlInScrape
              ? connect("firecrawl", SCRAPE_DOCS.firecrawl, firecrawlKeyOptional)
              : null}
            {showJina ? connect("jina", SCRAPE_DOCS.jina, true) : null}
            {scrapeUsesReader &&
            current.searchProvider === "firecrawl" &&
            current.scrapeProvider === "firecrawl" ? (
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
        description={keyOptional ? t("providerKeyOptionalSelfHosted") : undefined}
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
