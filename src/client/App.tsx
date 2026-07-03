import {
  ActionIcon,
  AppShell,
  Badge,
  Box,
  Burger,
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
  Tooltip,
  UnstyledButton,
  type BoxProps,
} from "@mantine/core";
import { useDisclosure, useLocalStorage, useMediaQuery } from "@mantine/hooks";
import { ArrowDown, ArrowUp, PanelLeft, PanelLeftClose, Plus, Settings, Square, X, Zap } from "lucide-react";
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


const SCROLL_BOTTOM_TOLERANCE = 64;
const SIDEBAR_WIDTH = 280;
const SIDEBAR_COLLAPSED_WIDTH = 56;
const SIDEBAR_COLLAPSED_KEY = "solid-sidebar-collapsed";

function ChatColumn({ children, className, ...props }: BoxProps & { children: ReactNode }) {
  return (
    <Box className={["chat-column", className].filter(Boolean).join(" ")} {...props}>
      {children}
    </Box>
  );
}

function SidebarSessionRow({
  active,
  label,
  running,
  deleteLabel,
  onSelect,
  onDelete,
}: {
  active: boolean;
  label: string;
  running: boolean;
  deleteLabel: string;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <Box className={`sidebar-session-row${active ? " sidebar-session-row--active" : ""}`}>
      <UnstyledButton className="sidebar-session-button" onClick={onSelect}>
        {label}
        {running ? " ·" : ""}
      </UnstyledButton>
      <ActionIcon
        className="sidebar-session-delete"
        variant="subtle"
        color="gray"
        size="sm"
        radius="md"
        aria-label={deleteLabel}
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
      >
        <X size={15} />
      </ActionIcon>
    </Box>
  );
}

type ChatComposerProps = {
  error: string | null;
  objective: string;
  running: boolean;
  isActiveRunning: boolean;
  settings: WebSettings;
  showToolbar: boolean;
  showLogSidebar: boolean;
  stepsOpened: boolean;
  stepsCount: number;
  activeSession: ResearchSession | null;
  onObjectiveChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  onStop: () => void;
  onToggleMode: () => void;
  onToggleSteps: () => void;
  onDownload: () => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
};

function ChatComposer({
  error,
  objective,
  running,
  isActiveRunning,
  settings,
  showToolbar,
  showLogSidebar,
  stepsOpened,
  stepsCount,
  activeSession,
  onObjectiveChange,
  onSubmit,
  onStop,
  onToggleMode,
  onToggleSteps,
  onDownload,
  t,
}: ChatComposerProps) {
  return (
    <>
      {error ? (
        <Text c="red" size="sm" mb="xs">
          {error}
        </Text>
      ) : null}
      {showToolbar ? (
        <Group justify="flex-end" gap="xs" mb="xs">
          {showLogSidebar ? (
            <Button variant={stepsOpened ? "light" : "subtle"} size="compact-sm" onClick={onToggleSteps}>
              {t("steps")} ({stepsCount})
            </Button>
          ) : null}
          {activeSession && !running ? (
            <Button variant="subtle" size="compact-sm" onClick={onDownload}>
              {t("export")}
            </Button>
          ) : null}
        </Group>
      ) : null}
      <Box className={`chat-input-rgb-wrap${isActiveRunning ? " chat-input-rgb-wrap--active" : ""}`}>
        <Paper
          component="form"
          onSubmit={onSubmit}
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
            onClick={onToggleMode}
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
            onChange={(event) => onObjectiveChange(event.currentTarget.value)}
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
              onClick={onStop}
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
    </>
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
  const [mobileOpened, { toggle: toggleMobile, close: closeMobile }] = useDisclosure(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useLocalStorage<boolean>({
    key: SIDEBAR_COLLAPSED_KEY,
    defaultValue: false,
  });
  const [stepsOpened, { close: closeSteps, toggle: toggleSteps }] = useDisclosure(false);
  const [models, setModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [controller, setController] = useState<AbortController | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
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

  const isDesktop = useMediaQuery("(min-width: 48em)");
  const navbarCollapsedDesktop = isDesktop === true && sidebarCollapsed;
  const navbarWidth = navbarCollapsedDesktop ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH;
  const showMobileChrome = isDesktop !== true;

  const historyGroups = useMemo(
    () => groupSessionsByDate(sessions),
    [sessions],
  );

  useEffect(() => {
    if (isDesktop) closeMobile();
  }, [isDesktop, closeMobile]);

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

    if (activeSession?.status === "running") {
      setObjective(activeSession.objective);
    } else if (!running) {
      setObjective("");
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
    closeMobile();
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
    closeMobile();
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
    controllerRef.current = nextController;
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
      controllerRef.current = null;
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
    controllerRef.current?.abort();
    setRunning(false);
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

  const composerProps: ChatComposerProps = {
    error,
    objective,
    running,
    isActiveRunning,
    settings,
    showToolbar: hasContent && (showLogSidebar || (activeSession !== null && !running)),
    showLogSidebar,
    stepsOpened,
    stepsCount: stepsActivity.length,
    activeSession,
    onObjectiveChange: setObjective,
    onSubmit: handleSubmit,
    onStop: handleStop,
    onToggleMode: handleToggleMode,
    onToggleSteps: toggleSteps,
    onDownload: () => activeSession && downloadSession(activeSession),
    t,
  };

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
      header={showMobileChrome ? { height: 48 } : undefined}
      navbar={{
        width: navbarWidth,
        breakpoint: "sm",
        collapsed: { mobile: !mobileOpened, desktop: false },
      }}
      padding={0}
      styles={{
        main: { display: "flex", flexDirection: "column", height: "100dvh", position: "relative", minHeight: 0 },
        navbar: { transition: "width 200ms ease" },
      }}
    >
      {showMobileChrome ? (
        <AppShell.Header className="mobile-nav-bar">
          <Group h="100%" px="md">
            <Burger
              opened={mobileOpened}
              onClick={toggleMobile}
              size="sm"
              aria-label={mobileOpened ? t("collapseSidebar") : t("expandSidebar")}
            />
          </Group>
        </AppShell.Header>
      ) : null}

      <AppShell.Navbar
        className={`app-sidebar${navbarCollapsedDesktop ? " app-sidebar--collapsed" : ""}`}
        withBorder={false}
        p={0}
        style={{ display: "flex", flexDirection: "column" }}
      >
        <Box className="sidebar-header">
          <Group
            justify={navbarCollapsedDesktop ? "center" : "space-between"}
            mb={navbarCollapsedDesktop ? "sm" : "lg"}
            wrap="nowrap"
          >
            {navbarCollapsedDesktop ? (
              <Tooltip label={t("expandSidebar")} position="right" withArrow>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="md"
                  radius="md"
                  aria-label={t("expandSidebar")}
                  onClick={() => setSidebarCollapsed(false)}
                >
                  <PanelLeft size={16} />
                </ActionIcon>
              </Tooltip>
            ) : showMobileChrome ? (
              <>
                <SolidLogo wordmarkSize="md" />
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="md"
                  radius="md"
                  aria-label={t("collapseSidebar")}
                  onClick={closeMobile}
                >
                  <X size={18} />
                </ActionIcon>
              </>
            ) : (
              <>
                <SolidLogo wordmarkSize="md" />
                <Tooltip label={t("collapseSidebar")} withArrow>
                  <ActionIcon
                    className="sidebar-collapse-desktop"
                    variant="subtle"
                    color="gray"
                    size="md"
                    radius="md"
                    aria-label={t("collapseSidebar")}
                    onClick={() => setSidebarCollapsed(true)}
                  >
                    <PanelLeftClose size={18} />
                  </ActionIcon>
                </Tooltip>
              </>
            )}
          </Group>

          {navbarCollapsedDesktop ? (
            <Box className="sidebar-rail-btn">
              <Tooltip label={t("newResearch")} position="right" withArrow>
                <ActionIcon
                  variant="default"
                  size="md"
                  radius="md"
                  aria-label={t("newResearch")}
                  disabled={running}
                  onClick={handleNewResearch}
                >
                  <Plus size={16} strokeWidth={2} />
                </ActionIcon>
              </Tooltip>
            </Box>
          ) : (
            <Button
              fullWidth
              variant="default"
              radius="md"
              size="sm"
              leftSection={<Plus size={16} strokeWidth={2} />}
              disabled={running}
              onClick={handleNewResearch}
            >
              {t("newResearch")}
            </Button>
          )}
        </Box>

        {!navbarCollapsedDesktop ? (
          <ScrollArea flex={1} type="auto" scrollbars="y" classNames={{ viewport: "sidebar-scroll-viewport" }}>
            <Box className="sidebar-scroll">
              {historyGroups.length === 0 ? (
                <Text size="sm" c="dimmed" px="sm" py="xs">
                  {t("noResearchYet")}
                </Text>
              ) : (
                <Stack gap="xl">
                  {historyGroups.map((group) => (
                    <Stack key={group.key} gap="xs">
                      <Text className="sidebar-section-label">{t(HISTORY_GROUP_KEYS[group.key])}</Text>
                      <Stack gap={4}>
                        {group.sessions.map((session) => (
                          <SidebarSessionRow
                            key={session.id}
                            active={session.id === sessionId}
                            label={sessionPreview(session, t("untitledResearch"))}
                            running={session.status === "running"}
                            deleteLabel={t("delete")}
                            onSelect={() => handleSelectSession(session.id)}
                            onDelete={() => handleDeleteSession(session.id)}
                          />
                        ))}
                      </Stack>
                    </Stack>
                  ))}
                </Stack>
              )}
            </Box>
          </ScrollArea>
        ) : (
          <Box flex={1} aria-hidden />
        )}

        <Box className="sidebar-footer">
          {navbarCollapsedDesktop ? (
            <Box className="sidebar-rail-btn">
              <Tooltip label={t("settings")} position="right" withArrow>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="md"
                  radius="md"
                  aria-label={t("settings")}
                  onClick={openConfig}
                >
                  <Settings size={16} />
                </ActionIcon>
              </Tooltip>
            </Box>
          ) : (
            <Button
              fullWidth
              variant="subtle"
              color="gray"
              radius="md"
              size="sm"
              leftSection={<Settings size={16} />}
              onClick={openConfig}
            >
              {t("settings")}
            </Button>
          )}
        </Box>
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
        classNames={{ content: "steps-drawer-content" }}
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
        <Box className="chat-main">
          {!hasContent ? (
            <Box className="chat-empty">
              <ChatColumn className="chat-empty-column">
                <Stack align="center" gap="xl" w="100%">
                  <SolidLogo wordmarkSize="lg" gap="sm" />
                  <Box className="chat-empty-composer" w="100%">
                    <ChatComposer {...composerProps} />
                  </Box>
                </Stack>
              </ChatColumn>
            </Box>
          ) : (
            <Box className="chat-main-body">
              {scrollPinned && showSolidness ? (
                <Box className="solidness-sticky">
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
                classNames={{ content: "chat-scroll-content" }}
                styles={{ viewport: { scrollbarGutter: "stable" } }}
              >
                <ChatColumn pb={160}>
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
                </ChatColumn>
              </ScrollArea>

              {!autoScroll ? (
                <Box
                  className="chat-column-host"
                  style={{
                    position: "absolute",
                    bottom: "calc(9rem + env(safe-area-inset-bottom, 0px))",
                    insetInline: 0,
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

              <Box className="chat-footer">
                <ChatColumn>
                  <ChatComposer {...composerProps} />
                </ChatColumn>
              </Box>
            </Box>
          )}
        </Box>
      </AppShell.Main>
    </AppShell>
  );
}
