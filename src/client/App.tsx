import {
  Accordion,
  ActionIcon,
  AppShell,
  Badge,
  Box,
  Button,
  Drawer,
  Group,
  Loader,
  Modal,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import { useDisclosure, useLocalStorage } from "@mantine/hooks";
import { ArrowUp, Settings, X, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";

import ActivityLine from "./ActivityLine";
import {
  applyParsedStream,
  createSession,
  deleteSession,
  groupSessionsByDate,
  HISTORY_KEY,
  loadHistory,
  sessionPreview,
  upsertSession,
  type ResearchSession,
} from "./history";
import i18n, { HISTORY_GROUP_KEYS } from "./i18n";
import MarkdownContent from "./MarkdownContent";
import { downloadSession } from "./export";
import { fetchLlmModels, pickDefaultModel } from "./models";
import RubricBars from "./RubricBars";
import { HOME_PATH, chatPath } from "./routes";
import SettingsForm from "./SettingsForm";
import SiteLink from "./SiteLink";
import {
  loadWebSettings,
  MODE_TARGETS,
  SETTINGS_KEY,
  type WebSettings,
} from "./settings";
import { streamResearch } from "./stream-client";
import { parseStream, uniqueSourceCount } from "./stream";

const WEAK_EVIDENCE_BELOW: Record<WebSettings["mode"], number> = {
  rigorous: 60,
  fast: 45,
};

function updateSettings<K extends keyof WebSettings>(
  current: WebSettings,
  key: K,
  value: WebSettings[K],
): WebSettings {
  return { ...current, [key]: value };
}

function isLocalLlmBaseUrl(baseUrl: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(baseUrl.trim());
}

export default function App() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId?: string }>();
  const [settings, setSettings] = useLocalStorage<WebSettings>({
    key: SETTINGS_KEY,
    defaultValue: loadWebSettings(),
  });
  const [sessions, setSessions] = useLocalStorage<ResearchSession[]>({
    key: HISTORY_KEY,
    defaultValue: loadHistory(),
  });
  const [objective, setObjective] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configOpened, { open: openConfig, close: closeConfig }] = useDisclosure(false);
  const [stepsOpened, { close: closeSteps, toggle: toggleSteps }] = useDisclosure(false);
  const [models, setModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [controller, setController] = useState<AbortController | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const activeSession = useMemo(
    () =>
      sessionId
        ? (sessions.find((session) => session.id === sessionId) ?? null)
        : null,
    [sessions, sessionId],
  );

  const parsed = useMemo(
    () => parseStream(activeSession?.rawStream ?? ""),
    [activeSession?.rawStream],
  );

  const historyGroups = useMemo(
    () => groupSessionsByDate(sessions),
    [sessions],
  );

  useEffect(() => {
    void i18n.changeLanguage(settings.locale);
    document.documentElement.lang = settings.locale;
  }, [settings.locale]);

  useEffect(() => {
    if (!sessionId) {
      if (!running) setObjective("");
      return;
    }

    const exists = sessions.some((session) => session.id === sessionId);
    if (!exists && !running) {
      navigate(HOME_PATH, { replace: true });
      return;
    }

    if (activeSession && activeSession.status !== "running") {
      setObjective(activeSession.objective);
    }
  }, [sessionId, sessions, activeSession, running, navigate]);

  useEffect(() => {
    if (!configOpened || !settings.baseUrl.trim()) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setModelsLoading(true);
      setModelsError(null);

      try {
        const nextModels = await fetchLlmModels(settings);
        if (cancelled) return;

        setModels(nextModels);
        setSettings((current) => {
          const model = pickDefaultModel(nextModels, current.model);
          return model === current.model ? current : { ...current, model };
        });
      } catch (err) {
        if (cancelled) return;
        setModels([]);
        setModelsError(
          err instanceof Error ? err.message : t("errorLoadModels"),
        );
      } finally {
        if (!cancelled) setModelsLoading(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [configOpened, settings.baseUrl, settings.apiKey, t]);

  useEffect(() => {
    if (!running) return;
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [parsed.iterations.length, parsed.report, running]);

  useEffect(() => {
    if (!running) return;
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [parsed.activity.length, running, stepsOpened]);

  function syncSession(nextSession: ResearchSession) {
    setSessions((current) => upsertSession(current, nextSession));
  }

  function handleSelectSession(id: string) {
    navigate(chatPath(id));
    setError(null);
  }

  function handleDeleteSession(id: string) {
    const deletingCurrent = sessionId === id;
    setSessions((current) => deleteSession(current, id));
    if (deletingCurrent) {
      navigate(HOME_PATH);
    }
  }

  function handleNewResearch() {
    navigate(HOME_PATH);
    setObjective("");
    setError(null);
    closeSteps();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!objective.trim() || running) return;

    if (!settings.apiKey.trim() && !isLocalLlmBaseUrl(settings.baseUrl)) {
      setError(t("errorApiKey"));
      openConfig();
      return;
    }

    if (!settings.model.trim()) {
      setError(t("errorSelectModel"));
      openConfig();
      return;
    }

    controller?.abort();
    const nextController = new AbortController();
    setController(nextController);
    setRunning(true);
    setError(null);
    closeSteps();

    const session = createSession(objective.trim());
    syncSession(session);
    navigate(chatPath(session.id), { replace: true });

    let rawStream = "";

    try {
      await streamResearch(
        settings,
        session.objective,
        (chunk) => {
          rawStream += chunk;
          syncSession(
            applyParsedStream(
              { ...session, status: "running" },
              parseStream(rawStream),
              rawStream,
            ),
          );
        },
        nextController.signal,
      );

      syncSession({
        ...applyParsedStream(session, parseStream(rawStream), rawStream),
        status: "completed",
        updatedAt: Date.now(),
      });
    } catch (err) {
      const finalParsed = parseStream(rawStream);
      if (err instanceof DOMException && err.name === "AbortError") {
        rawStream += `\n\n@@STATUS@@\n${t("cancelled")}\n\n`;
        syncSession({
          ...applyParsedStream(session, parseStream(rawStream), rawStream),
          status: "cancelled",
          updatedAt: Date.now(),
        });
      } else {
        const message = err instanceof Error ? err.message : t("errorUnexpected");
        setError(message);
        syncSession({
          ...applyParsedStream(session, finalParsed, rawStream),
          status: "error",
          error: message,
          updatedAt: Date.now(),
        });
      }
    } finally {
      setRunning(false);
      setController(null);
    }
  }

  function handleToggleMode() {
    if (running) return;
    setSettings((current) =>
      updateSettings(
        current,
        "mode",
        current.mode === "fast" ? "rigorous" : "fast",
      ),
    );
  }

  function handleStop() {
    controller?.abort();
  }

  const isActiveRunning =
    running && (!activeSession || activeSession.status === "running");
  const confidence = parsed.confidence;
  const targetScore = MODE_TARGETS[settings.mode];
  const sourceCount = uniqueSourceCount(parsed.iterations);
  const weakEvidence =
    confidence > 0 &&
    (confidence < WEAK_EVIDENCE_BELOW[settings.mode] || sourceCount < 3);
  const hasContent =
    parsed.iterations.length > 0 ||
    Boolean(parsed.report) ||
    running ||
    Boolean(activeSession);
  const showLogSidebar = parsed.activity.length > 0 || running;

  return (
    <AppShell
      navbar={{ width: 260, breakpoint: "sm" }}
      padding={0}
      styles={{ main: { display: "flex", flexDirection: "column", height: "100dvh" } }}
    >
      <AppShell.Navbar p="sm" withBorder style={{ display: "flex", flexDirection: "column" }}>
        <Title order={4} px="xs" mb="sm">
          solid
        </Title>

        <Button
          fullWidth
          variant="default"
          mb="sm"
          disabled={running}
          onClick={handleNewResearch}
        >
          {t("newResearch")}
        </Button>

        <ScrollArea flex={1} type="auto" offsetScrollbars>
          {historyGroups.length === 0 ? (
            <Text size="sm" c="dimmed" px="xs">
              {t("noResearchYet")}
            </Text>
          ) : (
            <Stack gap="md" pr="xs">
              {historyGroups.map((group) => (
                <Stack key={group.key} gap={4}>
                  <Text size="xs" tt="uppercase" c="dimmed" fw={600} px="xs">
                    {t(HISTORY_GROUP_KEYS[group.key])}
                  </Text>
                  <Stack gap={2}>
                    {group.sessions.map((session) => (
                      <Group key={session.id} gap={4} wrap="nowrap">
                        <Button
                          flex={1}
                          variant={session.id === sessionId ? "light" : "subtle"}
                          color={session.id === sessionId ? "cyan" : "gray"}
                          justify="flex-start"
                          size="compact-sm"
                          onClick={() => handleSelectSession(session.id)}
                          styles={{ label: { overflow: "hidden", textOverflow: "ellipsis" } }}
                        >
                          {sessionPreview(session, t("untitledResearch"))}
                          {session.status === "running" ? " ·" : ""}
                        </Button>
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          size="sm"
                          aria-label={t("delete")}
                          onClick={() => handleDeleteSession(session.id)}
                        >
                          <X size={14} />
                        </ActionIcon>
                      </Group>
                    ))}
                  </Stack>
                </Stack>
              ))}
            </Stack>
          )}
        </ScrollArea>

        <Button
          fullWidth
          mt="sm"
          variant="default"
          leftSection={<Settings size={16} />}
          onClick={openConfig}
        >
          {t("settings")}
        </Button>
      </AppShell.Navbar>

      <Modal
        opened={configOpened}
        onClose={closeConfig}
        title={t("settings")}
        centered
        size="md"
      >
        <SettingsForm
          settings={settings}
          running={running}
          models={models}
          modelsLoading={modelsLoading}
          modelsError={modelsError}
          onChange={setSettings}
        />
      </Modal>

      <Drawer
        opened={stepsOpened}
        onClose={closeSteps}
        position="right"
        size="md"
        title={
          <Group gap="xs">
            <Text fw={600}>{t("steps")}</Text>
            <Badge size="sm" variant="light">
              {parsed.activity.length}
            </Badge>
          </Group>
        }
        overlayProps={{ backgroundOpacity: 0.35, blur: 2 }}
      >
        <ScrollArea h="calc(100dvh - 80px)" viewportRef={logRef}>
          <Stack component="ol" gap={6} style={{ listStyle: "decimal", paddingLeft: "1.1rem" }}>
            {parsed.activity.map((line, index) => (
              <ActivityLine
                key={`${index}-${line.slice(0, 24)}`}
                line={line}
                active={isActiveRunning && index === parsed.activity.length - 1}
              />
            ))}
          </Stack>
        </ScrollArea>
      </Drawer>

      <AppShell.Main>
        {hasContent ? (
          <Group justify="flex-end" gap="xs" px="lg" py="sm">
            {weakEvidence ? (
              <Badge color="red" variant="light">
                {t("weakEvidence")}
              </Badge>
            ) : null}
            {(running || confidence > 0) && (
              <Badge variant="outline" color="cyan">
                {t("solidness")} {confidence.toFixed(0)}%
                {parsed.iteration ? ` · ${parsed.iteration}` : ""}
                {` / ${targetScore}%`}
              </Badge>
            )}
            {showLogSidebar ? (
              <Button
                variant={stepsOpened ? "light" : "subtle"}
                size="compact-sm"
                onClick={toggleSteps}
              >
                {t("steps")} ({parsed.activity.length})
              </Button>
            ) : null}
            {activeSession && !running ? (
              <Button variant="subtle" size="compact-sm" onClick={() => downloadSession(activeSession)}>
                {t("export")}
              </Button>
            ) : null}
            {isActiveRunning ? (
              <Button variant="subtle" color="red" size="compact-sm" onClick={handleStop}>
                {t("stop")}
              </Button>
            ) : null}
          </Group>
        ) : null}

        {parsed.rubric ? <RubricBars rubric={parsed.rubric} /> : null}

        <Box style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
          <ScrollArea flex={1} viewportRef={threadRef} type="auto" h="100%">
            <Box maw={720} mx="auto" px="lg" pb="xl">
              {!hasContent ? (
                <Stack align="center" justify="center" mih="50vh">
                  <Title order={1}>solid</Title>
                </Stack>
              ) : (
                <Stack gap="lg">
                  {activeSession?.objective ? (
                    <Paper p="md" radius="md" bg="dark.6">
                      <Text>{activeSession.objective}</Text>
                    </Paper>
                  ) : null}

                  {parsed.iterations.map((iteration) => (
                    <Paper key={iteration.number} p="md" radius="md" withBorder>
                      <Group justify="space-between" mb="sm">
                        <Text size="sm" fw={600}>
                          {t("step")} {iteration.number}
                          {iteration.angle ? ` · ${iteration.angle}` : ""}
                        </Text>
                        <Badge variant="light">{iteration.score.toFixed(0)}%</Badge>
                      </Group>

                      {iteration.findings ? (
                        <MarkdownContent content={iteration.findings} />
                      ) : null}

                      {iteration.scoreReasoning ? (
                        <Text size="sm" c="dimmed" mt="sm">
                          {iteration.scoreReasoning}
                        </Text>
                      ) : null}

                      {iteration.synthesis ? (
                        <Accordion variant="contained" mt="sm">
                          <Accordion.Item value="synthesis">
                            <Accordion.Control>{t("cumulativeSynthesis")}</Accordion.Control>
                            <Accordion.Panel>
                              <MarkdownContent content={iteration.synthesis} />
                            </Accordion.Panel>
                          </Accordion.Item>
                        </Accordion>
                      ) : null}

                      {iteration.readUrls && iteration.readUrls.length > 0 ? (
                        <Stack gap={4} mt="md" pt="sm" style={{ borderTop: "1px solid var(--mantine-color-dark-4)" }}>
                          <Text size="xs" tt="uppercase" c="dimmed" fw={600}>
                            {t("pagesRead")}
                          </Text>
                          {iteration.readUrls.map((url) => (
                            <SiteLink key={url} url={url} />
                          ))}
                        </Stack>
                      ) : null}

                      {iteration.sources && iteration.sources.length > 0 ? (
                        <Stack gap={4} mt="md" pt="sm" style={{ borderTop: "1px solid var(--mantine-color-dark-4)" }}>
                          <Text size="xs" tt="uppercase" c="dimmed" fw={600}>
                            {t("sources")}
                          </Text>
                          {iteration.sources.map((source) => (
                            <Text
                              key={source.url}
                              component="a"
                              href={source.url}
                              target="_blank"
                              rel="noreferrer"
                              size="sm"
                              c="cyan.4"
                            >
                              {source.title || source.url}
                            </Text>
                          ))}
                        </Stack>
                      ) : null}
                    </Paper>
                  ))}

                  {isActiveRunning && !parsed.report ? (
                    <Group gap="xs">
                      <Loader size="xs" type="dots" />
                      <Text size="sm" c="dimmed">
                        {t("analyzing")}
                      </Text>
                    </Group>
                  ) : null}

                  {parsed.report ? (
                    <Paper p="md" radius="md" withBorder>
                      <Text size="sm" fw={600} mb="sm">
                        {t("answer")}
                      </Text>
                      <MarkdownContent content={parsed.report} />
                    </Paper>
                  ) : null}

                  {activeSession?.error ? (
                    <Text c="red" size="sm">
                      {activeSession.error}
                    </Text>
                  ) : null}
                </Stack>
              )}
            </Box>
          </ScrollArea>
        </Box>

        <Box px="md" pb="lg" pt="xs">
          <Box maw={720} mx="auto">
            {error ? (
              <Text c="red" size="sm" mb="xs">
                {error}
              </Text>
            ) : null}
            <Paper
              component="form"
              onSubmit={handleSubmit}
              radius="xl"
              p="xs"
              withBorder
              style={{ display: "flex", alignItems: "flex-end", gap: "0.35rem" }}
            >
              <ActionIcon
                variant={settings.mode === "fast" ? "light" : "subtle"}
                color={settings.mode === "fast" ? "yellow" : "gray"}
                size="lg"
                radius="xl"
                disabled={running}
                aria-label={settings.mode === "fast" ? t("modeFast") : t("modeRigorous")}
                title={settings.mode === "fast" ? t("modeFast") : t("modeRigorous")}
                onClick={handleToggleMode}
              >
                <Zap size={18} fill={settings.mode === "fast" ? "currentColor" : "none"} />
              </ActionIcon>
              <Textarea
                flex={1}
                variant="unstyled"
                placeholder={t("askPlaceholder")}
                value={objective}
                disabled={running}
                autosize
                minRows={1}
                maxRows={6}
                styles={{ input: { paddingTop: 8, paddingBottom: 8 } }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                onChange={(event) => setObjective(event.currentTarget.value)}
              />
              <ActionIcon
                type="submit"
                size="lg"
                radius="xl"
                variant="filled"
                color="gray.0"
                c="dark.9"
                disabled={running || !objective.trim()}
                aria-label={running ? t("researching") : t("research")}
              >
                {running ? <Loader size={18} color="dark.9" /> : <ArrowUp size={18} />}
              </ActionIcon>
            </Paper>
          </Box>
        </Box>
      </AppShell.Main>
    </AppShell>
  );
}
