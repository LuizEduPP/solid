import {
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
  type BoxProps,
} from "@mantine/core";
import { useDisclosure, useLocalStorage } from "@mantine/hooks";
import { ArrowDown, ArrowUp, Settings, Square, X, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";

import ActivityLine, { compressStepsActivity } from "./activity";
import SolidLogo from "./SolidLogo";
import i18n, { HISTORY_GROUP_KEYS } from "./i18n";
import {
  createSession,
  deleteSession,
  downloadSession,
  groupSessionsByDate,
  HISTORY_KEY,
  isLocalLlmBaseUrl,
  loadHistory,
  loadWebSettings,
  sessionPreview,
  SETTINGS_KEY,
  touchSession,
  upsertSession,
  type ResearchSession,
  type WebSettings,
} from "./local-store";
import MarkdownContent from "./MarkdownContent";
import IterationCard from "./IterationCard";
import SolidnessPanel from "./SolidnessPanel";
import SettingsForm from "./SettingsForm";
import {
  fetchLlmModels,
  parseStream,
  pickDefaultModel,
  streamResearch,
  uniqueSourceCount,
} from "./stream";
import { MODE_THRESHOLDS } from "../shared";

export const HOME_PATH = "/";
export const CHAT_SESSION_PATH = "/c/:sessionId";

export function chatPath(sessionId: string): string {
  return `/c/${sessionId}`;
}

const CHAT_MAX_WIDTH = 720;
const SCROLL_BOTTOM_TOLERANCE = 64;

function ChatColumn({ children, ...props }: BoxProps & { children: ReactNode }) {
  return (
    <Box maw={CHAT_MAX_WIDTH} mx="auto" px="lg" w="100%" {...props}>
      {children}
    </Box>
  );
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
  const solidnessSentinelRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const ignoreScrollPauseRef = useRef(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [scrollPinned, setScrollPinned] = useState(false);
  const [solidnessExpanded, setSolidnessExpanded] = useState(false);

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

  const stepsActivity = useMemo(
    () => compressStepsActivity(parsed.activity),
    [parsed.activity],
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
    autoScrollRef.current = true;
    setAutoScroll(true);
  }, [running, sessionId]);

  useEffect(() => {
    if (!autoScrollRef.current) return;
    const viewport = threadRef.current;
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [
    parsed.iterations.length,
    parsed.report,
    parsed.confidence,
    parsed.activity.length,
    running,
  ]);

  useEffect(() => {
    if (!running || !stepsOpened) return;
    const viewport = logRef.current;
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [stepsActivity.length, running, stepsOpened]);

  function handleThreadScroll() {
    const viewport = threadRef.current;
    if (!viewport) return;

    const atBottom =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <=
      SCROLL_BOTTOM_TOLERANCE;

    if (atBottom) {
      ignoreScrollPauseRef.current = false;
      if (!autoScrollRef.current) {
        autoScrollRef.current = true;
        setAutoScroll(true);
      }
      return;
    }

    if (!ignoreScrollPauseRef.current && autoScrollRef.current) {
      autoScrollRef.current = false;
      setAutoScroll(false);
    }
  }

  function resumeAutoScroll() {
    autoScrollRef.current = true;
    setAutoScroll(true);
    ignoreScrollPauseRef.current = true;

    const viewport = threadRef.current;
    if (!viewport) return;

    viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });

    window.setTimeout(() => {
      const node = threadRef.current;
      if (!node) {
        ignoreScrollPauseRef.current = false;
        return;
      }

      const atBottom =
        node.scrollHeight - node.scrollTop - node.clientHeight <= SCROLL_BOTTOM_TOLERANCE;

      ignoreScrollPauseRef.current = false;
      if (atBottom) {
        autoScrollRef.current = true;
        setAutoScroll(true);
      }
    }, 400);
  }

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
            touchSession({ ...session, status: "running" }, { rawStream }),
          );
        },
        nextController.signal,
      );

      syncSession(touchSession(session, { rawStream, status: "completed" }));
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        rawStream += `\n\n@@STATUS@@\n${t("cancelled")}\n\n`;
        syncSession(touchSession(session, { rawStream, status: "cancelled" }));
      } else {
        const message = err instanceof Error ? err.message : t("errorUnexpected");
        setError(message);
        syncSession(
          touchSession(session, { rawStream, status: "error", error: message }),
        );
      }
    } finally {
      setRunning(false);
      setController(null);
    }
  }

  function handleToggleMode() {
    if (running) return;
    setSettings((current) => ({
      ...current,
      mode: current.mode === "fast" ? "rigorous" : "fast",
    }));
  }

  function handleStop() {
    controller?.abort();
  }

  const isActiveRunning =
    running && (!activeSession || activeSession.status === "running");
  const confidence = parsed.confidence;
  const targetScore = MODE_THRESHOLDS[settings.mode].targetScore;
  const sourceCount = uniqueSourceCount(parsed.iterations);
  const modeThresholds = MODE_THRESHOLDS[settings.mode];
  const hasContent =
    parsed.iterations.length > 0 ||
    Boolean(parsed.report) ||
    running ||
    Boolean(activeSession);
  const showLogSidebar = stepsActivity.length > 0 || running;
  const showSolidness = running || confidence > 0;

  useEffect(() => {
    if (!showSolidness) {
      setScrollPinned(false);
      return;
    }

    const root = threadRef.current;
    const sentinel = solidnessSentinelRef.current;
    if (!root || !sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const pinned = !entry.isIntersecting;
        setScrollPinned(pinned);
        if (!pinned) setSolidnessExpanded(false);
      },
      { root, threshold: 0 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [showSolidness, sessionId]);

  return (
    <AppShell
      navbar={{ width: 260, breakpoint: "sm" }}
      padding={0}
      styles={{ main: { display: "flex", flexDirection: "column", height: "100dvh" } }}
    >
      <AppShell.Navbar
        p="sm"
        withBorder={false}
        styles={{ navbar: { borderRight: "none" } }}
        style={{ display: "flex", flexDirection: "column" }}
      >
        <SolidLogo px="xs" mb="sm" wordmarkSize="md" />

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
                          color={session.id === sessionId ? "indigo" : "gray"}
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
              {stepsActivity.length}
            </Badge>
          </Group>
        }
        overlayProps={{ backgroundOpacity: 0.35, blur: 2 }}
      >
        <ScrollArea h="calc(100dvh - 80px)" viewportRef={logRef}>
          <Stack component="ol" gap={6} style={{ listStyle: "decimal", paddingLeft: "1.1rem" }}>
            {stepsActivity.map((line, index) => (
              <ActivityLine
                key={`${index}-${line.slice(0, 24)}`}
                line={line}
                active={isActiveRunning && index === stepsActivity.length - 1}
              />
            ))}
          </Stack>
        </ScrollArea>
      </Drawer>

      <AppShell.Main>
        <Box style={{ flex: 1, minHeight: 0, overflow: "hidden", position: "relative" }}>
          {scrollPinned && showSolidness ? (
            <Box className="solidness-sticky" style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 20 }}>
              <ChatColumn>
                <SolidnessPanel
                  confidence={confidence}
                  iteration={parsed.iteration}
                  rubric={parsed.rubric}
                  sourceCount={sourceCount}
                  targetScore={targetScore}
                  thresholds={modeThresholds}
                  running={running}
                  compact
                  expanded={solidnessExpanded}
                  onToggleExpand={() => setSolidnessExpanded((value) => !value)}
                />
              </ChatColumn>
            </Box>
          ) : null}
          <ScrollArea
            flex={1}
            viewportRef={threadRef}
            type="auto"
            h="100%"
            onScrollPositionChange={handleThreadScroll}
          >
            <ChatColumn pb="xl">
              {!hasContent ? (
                <Stack align="center" justify="center" mih="50vh">
                  <SolidLogo wordmarkSize="lg" gap="sm" />
                </Stack>
              ) : (
                <Stack gap="lg">
                  {showSolidness ? (
                    <>
                      <Box ref={solidnessSentinelRef} h={1} aria-hidden style={{ pointerEvents: "none" }} />
                      <SolidnessPanel
                        confidence={confidence}
                        iteration={parsed.iteration}
                        rubric={parsed.rubric}
                        sourceCount={sourceCount}
                        targetScore={targetScore}
                        thresholds={modeThresholds}
                        running={running}
                      />
                    </>
                  ) : null}

                  {activeSession?.objective ? (
                    <Paper p="md" radius="md" withBorder={false} bg="dark.6">
                      <Text>{activeSession.objective}</Text>
                    </Paper>
                  ) : null}

                  {parsed.iterations.map((iteration) => (
                    <IterationCard key={iteration.number} iteration={iteration} />
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
                    <Paper p="md" radius="md" withBorder={false} bg="dark.6">
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
            </ChatColumn>
          </ScrollArea>

          {!autoScroll && hasContent ? (
            <Box
              style={{
                position: "absolute",
                bottom: 16,
                left: 0,
                right: 0,
                pointerEvents: "none",
                zIndex: 30,
              }}
            >
              <ChatColumn style={{ display: "flex", justifyContent: "flex-end" }}>
                <ActionIcon
                  variant="filled"
                  color="dark.5"
                  radius="xl"
                  size="lg"
                  aria-label={t("scrollToBottom")}
                  title={t("scrollToBottom")}
                  onClick={resumeAutoScroll}
                  style={{ pointerEvents: "auto" }}
                >
                  <ArrowDown size={18} />
                </ActionIcon>
              </ChatColumn>
            </Box>
          ) : null}
        </Box>

        <ChatColumn pb="lg" pt="xs">
            {error ? (
              <Text c="red" size="sm" mb="xs">
                {error}
              </Text>
            ) : null}
            {hasContent && (showLogSidebar || (activeSession && !running)) ? (
              <Group justify="flex-end" gap="xs" mb="xs">
                {showLogSidebar ? (
                  <Button
                    variant={stepsOpened ? "light" : "subtle"}
                    size="compact-sm"
                    onClick={toggleSteps}
                  >
                    {t("steps")} ({stepsActivity.length})
                  </Button>
                ) : null}
                {activeSession && !running ? (
                  <Button
                    variant="subtle"
                    size="compact-sm"
                    onClick={() => downloadSession(activeSession)}
                  >
                    {t("export")}
                  </Button>
                ) : null}
              </Group>
            ) : null}
            <Box
              className={`chat-input-rgb-wrap${isActiveRunning ? " chat-input-rgb-wrap--active" : ""}`}
            >
              <Paper
                component="form"
                onSubmit={handleSubmit}
                radius="xl"
                p="xs"
                withBorder={false}
                className="chat-input-form"
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
              {isActiveRunning ? (
                <ActionIcon
                  type="button"
                  size="lg"
                  radius="xl"
                  variant="filled"
                  color="red"
                  aria-label={t("stop")}
                  title={t("stop")}
                  onClick={handleStop}
                >
                  <Square size={16} fill="currentColor" />
                </ActionIcon>
              ) : (
                <ActionIcon
                  type="submit"
                  size="lg"
                  radius="xl"
                  variant="filled"
                  color="gray.0"
                  c="dark.9"
                  disabled={!objective.trim()}
                  aria-label={t("research")}
                >
                  <ArrowUp size={18} />
                </ActionIcon>
              )}
              </Paper>
            </Box>
        </ChatColumn>
      </AppShell.Main>
    </AppShell>
  );
}
