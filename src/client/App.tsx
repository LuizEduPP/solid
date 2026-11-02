import {
  ActionIcon,
  Alert,
  AppShell,
  Badge,
  Box,
  Burger,
  Button,
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
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Download,
  PanelLeft,
  PanelLeftClose,
  PanelRight,
  PanelRightClose,
  Plus,
  Search,
  Settings,
  Square,
  X,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";

import DataPanel from "./DataPanel";
import SolidLogo from "./SolidLogo";
import i18n, { HISTORY_GROUP_KEYS } from "./i18n";
import {
  createSession,
  deleteSession,
  downloadSession,
  groupSessionsByDate,
  buildPriorContext,
  HISTORY_KEY,
  isLocalLlmBaseUrl,
  loadHistory,
  loadWebSettings,
  normalizeWebSettings,
  sessionPreview,
  SETTINGS_KEY,
  touchSession,
  upsertSession,
  type ResearchSession,
  type WebSettings,
} from "./local-store";
import MarkdownContent from "./MarkdownContent";
import IterationCard from "./IterationCard";
import SettingsForm from "./SettingsForm";
import {
  fetchLlmModels,
  fetchSuggestions,
  fetchTitle,
  parseStream,
  pickDefaultModel,
  streamResearch,
  type ResearchRound,
} from "./stream";
import { MODE_THRESHOLDS, VERDICT_I18N } from "../shared";

export const HOME_PATH = "/";
export const CHAT_SESSION_PATH = "/c/:sessionId";

function chatPath(sessionId: string): string {
  return `/c/${sessionId}`;
}

const SCROLL_BOTTOM_TOLERANCE = 64;
const SIDEBAR_WIDTH = 280;
const SIDEBAR_COLLAPSED_WIDTH = 56;
const DATA_PANEL_WIDTH = 300;
const SIDEBAR_COLLAPSED_KEY = "solid-sidebar-collapsed";
const ASIDE_COLLAPSED_KEY = "solid-aside-collapsed";

function ChatColumn({ children, className, ...props }: BoxProps & { children: ReactNode }) {
  return (
    <Box className={["chat-column", className].filter(Boolean).join(" ")} {...props}>
      {children}
    </Box>
  );
}

function QueryTurn({ label, text }: { label: string; text: string }) {
  return (
    <Box className="turn-query">
      <Text className="turn-query-label">{label}</Text>
      <Text className="turn-query-text">{text}</Text>
    </Box>
  );
}

function InspectorToggle({
  collapsed,
  onToggle,
  withTooltip,
}: {
  collapsed: boolean;
  onToggle: () => void;
  withTooltip?: boolean;
}) {
  const { t } = useTranslation();
  const label = collapsed ? t("expandSolidness") : t("collapseSolidness");
  const button = (
    <ActionIcon variant="subtle" color="gray" aria-label={label} onClick={onToggle}>
      {collapsed ? <PanelRight size={16} /> : <PanelRightClose size={16} />}
    </ActionIcon>
  );
  return withTooltip ? (
    <Tooltip label={label} withArrow>
      {button}
    </Tooltip>
  ) : (
    button
  );
}

function RailIcon({
  label,
  onClick,
  disabled,
  variant = "subtle",
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "subtle" | "default";
  children: ReactNode;
}) {
  return (
    <Box className="sidebar-rail-btn">
      <Tooltip label={label} position="right" withArrow>
        <ActionIcon
          variant={variant}
          color="gray"
          size="md"
          radius="md"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </ActionIcon>
      </Tooltip>
    </Box>
  );
}

function statusDotColor(status: ResearchSession["status"]): string {
  switch (status) {
    case "running": return "var(--mantine-color-yellow-5)";
    case "completed": return "var(--mantine-color-green-5)";
    case "error": return "var(--mantine-color-red-5)";
    case "cancelled": return "var(--mantine-color-gray-5)";
    default: return "var(--mantine-color-gray-6)";
  }
}

function SidebarSessionRow({
  active,
  label,
  session,
  deleteLabel,
  onSelect,
  onDelete,
}: {
  active: boolean;
  label: string;
  session: ResearchSession;
  deleteLabel: string;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const parsed = useMemo(() => parseStream(session.rawStream), [session.rawStream]);
  const score = parsed.confidence;
  const running = session.status === "running";

  return (
    <Box className={`sidebar-session-row${active ? " sidebar-session-row--active" : ""}`}>
      <Tooltip label={session.title || session.objective} multiline maw={280} withArrow openDelay={400}>
        <UnstyledButton className="sidebar-session-button" onClick={onSelect}>
          <Group gap={6} wrap="nowrap" style={{ width: "100%" }}>
            <Box
              className="sidebar-status-dot"
              style={{ background: statusDotColor(session.status) }}
            />
            <Text
              size="sm"
              style={{
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </Text>
            {score > 0 && !running ? (
              <Badge size="xs" variant="light" color="gray" style={{ flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                {score.toFixed(0)}%
              </Badge>
            ) : null}
            {running ? <Loader size={10} type="dots" /> : null}
          </Group>
        </UnstyledButton>
      </Tooltip>
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
  activeSession: ResearchSession | null;
  onObjectiveChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  onStop: (event: React.MouseEvent) => void;
  onToggleMode: () => void;
  onDownload: () => void;
  placeholder: string;
  t: (key: string, opts?: Record<string, unknown>) => string;
};

function ChatComposer({
  error,
  objective,
  running,
  isActiveRunning,
  settings,
  activeSession,
  onObjectiveChange,
  onSubmit,
  onStop,
  onToggleMode,
  onDownload,
  placeholder,
  t,
}: ChatComposerProps) {
  return (
    <>
      {error ? (
        <Text c="red" size="sm" mb="xs">
          {error}
        </Text>
      ) : null}
      <Box className={`chat-input-wrap${isActiveRunning ? " chat-input-wrap--active" : ""}`}>
        <Paper
          component="form"
          onSubmit={onSubmit}
          radius="lg"
          p="xs"
          withBorder={false}
          className="chat-input-form"
        >
          <Group gap={8} mb={4} px={4} justify="space-between" wrap="nowrap">
            <Box className="mode-toggle" role="group" aria-label={t("mode")}>
              <button
                type="button"
                className="mode-toggle-btn"
                aria-pressed={settings.mode === "rigorous"}
                disabled={running}
                onClick={() => {
                  if (!running && settings.mode !== "rigorous") onToggleMode();
                }}
              >
                {t("modeRigorousShort")}
              </button>
              <button
                type="button"
                className="mode-toggle-btn"
                aria-pressed={settings.mode === "fast"}
                disabled={running}
                onClick={() => {
                  if (!running && settings.mode !== "fast") onToggleMode();
                }}
              >
                {t("modeFastShort")}
              </button>
            </Box>
            {activeSession && !running ? (
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                radius="md"
                aria-label={t("export")}
                onClick={onDownload}
              >
                <Download size={14} />
              </ActionIcon>
            ) : null}
          </Group>
          <Group gap={6} align="flex-end" wrap="nowrap">
            <Textarea
              flex={1}
              variant="unstyled"
              placeholder={placeholder}
              value={objective}
              disabled={running}
              autosize
              minRows={1}
              maxRows={6}
              styles={{ input: { paddingTop: 6, paddingBottom: 6, paddingLeft: 4 } }}
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
                onMouseDown={(event) => event.preventDefault()}
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
                color="indigo"
                disabled={!objective.trim()}
                aria-label={t("research")}
              >
                <ArrowUp size={18} />
              </ActionIcon>
            )}
          </Group>
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
    deserialize: (raw) => {
      try {
        if (!raw) return loadWebSettings();
        return normalizeWebSettings(JSON.parse(raw) as Partial<WebSettings>);
      } catch {
        return loadWebSettings();
      }
    },
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
  const [asideCollapsed, setAsideCollapsed] = useLocalStorage<boolean>({
    key: ASIDE_COLLAPSED_KEY,
    defaultValue: false,
  });
  const [models, setModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [controller, setController] = useState<AbortController | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef<{ session: ResearchSession; rawStream: string } | null>(null);
  const stopRequestedRef = useRef(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const ignoreScrollPauseRef = useRef(false);
  const [autoScroll, setAutoScroll] = useState(true);

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

  const isDesktop = useMediaQuery("(min-width: 48em)");
  const isWide = useMediaQuery("(min-width: 75em)");
  const navbarCollapsedDesktop = isDesktop === true && sidebarCollapsed;
  const navbarWidth = navbarCollapsedDesktop ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH;
  const showMobileChrome = isDesktop !== true;

  const historyGroups = useMemo(
    () => groupSessionsByDate(sessions),
    [sessions],
  );

  const hasSessionData = parsed.iterations.length > 0 || running;
  const dockInspector = isWide === true && hasSessionData;
  const showDataPanel = hasSessionData && !asideCollapsed;

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
    if (sessionId || running || suggestions.length > 0) return;
    if (!settings.model.trim()) return;

    const ac = new AbortController();
    void fetchSuggestions(settings, ac.signal)
      .then((result) => {
        if (!ac.signal.aborted && result.length > 0) setSuggestions(result);
      })
      .catch(() => {});
    return () => ac.abort();
  }, [sessionId, running, settings.apiKey, settings.baseUrl, settings.model, settings.locale]);

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
    closeMobile();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!objective.trim() || running || controllerRef.current) return;

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
    stopRequestedRef.current = false;

    const followUpSession =
      activeSession &&
      sessionId === activeSession.id &&
      activeSession.status !== "running" &&
      (Boolean(parsed.report) || parsed.iterations.length > 0)
        ? activeSession
        : null;

    const priorContext = followUpSession
      ? buildPriorContext(followUpSession, objective.trim())
      : undefined;

    let session: ResearchSession;
    let rawStream = "";

    if (followUpSession) {
      session = touchSession(followUpSession, { status: "running", error: undefined });
      rawStream = followUpSession.rawStream;
      rawStream += `\n\n@@FOLLOWUP@@\n${objective.trim()}\n\n@@STATUS@@\n${t("followUpStarted", { message: objective.trim() })}\n\n`;
      syncSession(touchSession(session, { rawStream }));
    } else {
      session = createSession(objective.trim());
      syncSession(session);
      navigate(chatPath(session.id), { replace: true });

      const titleSessionId = session.id;
      void fetchTitle(settings, objective.trim()).then((generatedTitle) => {
        if (!generatedTitle) return;
        setSessions((current) =>
          current.map((s) => s.id === titleSessionId ? { ...s, title: generatedTitle } : s),
        );
        if (inFlightRef.current?.session.id === titleSessionId) {
          inFlightRef.current.session = { ...inFlightRef.current.session, title: generatedTitle };
        }
      });
    }

    inFlightRef.current = { session, rawStream };

    try {
      await streamResearch(
        settings,
        objective.trim(),
        (chunk) => {
          if (nextController.signal.aborted) return;
          rawStream += chunk;
          if (inFlightRef.current) {
            inFlightRef.current.rawStream = rawStream;
          }
          const live = inFlightRef.current?.session ?? session;
          syncSession(touchSession({ ...live, status: "running" }, { rawStream }));
        },
        nextController.signal,
        priorContext,
      );

      if (nextController.signal.aborted) return;
      const final = inFlightRef.current?.session ?? session;
      syncSession(touchSession(final, { rawStream, status: "completed" }));
    } catch (err) {
      const errSession = inFlightRef.current?.session ?? session;
      if (err instanceof DOMException && err.name === "AbortError") {
        if (!stopRequestedRef.current) {
          rawStream += `\n\n@@STATUS@@\n${t("cancelled")}\n\n`;
        }
        syncSession(touchSession(errSession, { rawStream, status: "cancelled" }));
      } else {
        const message = err instanceof Error ? err.message : t("errorUnexpected");
        setError(message);
        syncSession(
          touchSession(errSession, { rawStream, status: "error", error: message }),
        );
      }
    } finally {
      inFlightRef.current = null;
      stopRequestedRef.current = false;
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

  function handleStop(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();

    const inflight = inFlightRef.current;
    if (!controllerRef.current && !inflight) return;

    stopRequestedRef.current = true;
    controllerRef.current?.abort();

    if (inflight) {
      const cancelledStream =
        inflight.rawStream + `\n\n@@STATUS@@\n${t("cancelled")}\n\n`;
      inflight.rawStream = cancelledStream;
      syncSession(
        touchSession(inflight.session, {
          rawStream: cancelledStream,
          status: "cancelled",
        }),
      );
    }
  }

  function handleSuggestionClick(text: string) {
    setObjective(text);
  }

  const isActiveRunning = running;
  const confidence = parsed.confidence;
  const targetScore = MODE_THRESHOLDS[settings.mode].targetScore;
  const inspector = (
    <DataPanel
      confidence={confidence}
      targetScore={targetScore}
      iterations={parsed.iterations}
      reflection={parsed.reflection}
      rubric={parsed.rubric}
      running={running}
    />
  );
  const hasContent =
    parsed.iterations.length > 0 ||
    Boolean(parsed.report) ||
    running ||
    Boolean(activeSession);

  const composerProps: ChatComposerProps = {
    error,
    objective,
    running,
    isActiveRunning,
    settings,
    activeSession,
    onObjectiveChange: setObjective,
    onSubmit: handleSubmit,
    onStop: handleStop,
    onToggleMode: handleToggleMode,
    onDownload: () => activeSession && downloadSession(activeSession),
    placeholder:
      activeSession &&
      activeSession.status !== "running" &&
      (Boolean(parsed.report) || parsed.iterations.length > 0)
        ? t("askFollowUpPlaceholder")
        : t("askPlaceholder"),
    t,
  };

  const entityVerdict = parsed.reflection?.entity_verdict;
  const showVerdictBanner =
    entityVerdict === "unlikely" || entityVerdict === "nonexistent";

  const reportBorderColor =
    confidence >= 70
      ? "var(--mantine-color-teal-7)"
      : confidence >= 40
        ? "var(--mantine-color-yellow-7)"
        : "var(--mantine-color-red-7)";

  return (
    <AppShell
      header={showMobileChrome ? { height: 52 } : undefined}
      navbar={{
        width: navbarWidth,
        breakpoint: "sm",
        collapsed: { mobile: !mobileOpened, desktop: false },
      }}
      aside={
        dockInspector
          ? {
              width: DATA_PANEL_WIDTH,
              breakpoint: "lg",
              collapsed: { desktop: asideCollapsed, mobile: true },
            }
          : undefined
      }
      padding={0}
      styles={{
        main: { display: "flex", flexDirection: "column", height: "100dvh", position: "relative", minHeight: 0 },
        navbar: { transition: "width 200ms ease" },
        aside: { transition: "width 200ms ease" },
      }}
    >
      {showMobileChrome ? (
        <AppShell.Header className="mobile-nav-bar">
          <Group h="100%" px="sm" justify="space-between" wrap="nowrap">
            <Group gap="xs" wrap="nowrap">
              <Burger
                opened={mobileOpened}
                onClick={toggleMobile}
                size="sm"
                aria-label={mobileOpened ? t("collapseSidebar") : t("expandSidebar")}
              />
              <SolidLogo size={22} wordmarkSize="sm" />
            </Group>
            {hasSessionData ? (
              <InspectorToggle
                collapsed={asideCollapsed}
                onToggle={() => setAsideCollapsed((v) => !v)}
              />
            ) : (
              <ActionIcon variant="subtle" color="gray" aria-label={t("settings")} onClick={openConfig}>
                <Settings size={16} />
              </ActionIcon>
            )}
          </Group>
        </AppShell.Header>
      ) : null}

      {/* ─── SIDEBAR ─── */}
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
            <RailIcon
              label={t("newResearch")}
              variant="default"
              disabled={running}
              onClick={handleNewResearch}
            >
              <Plus size={16} strokeWidth={2} />
            </RailIcon>
          ) : (
            <Button
              fullWidth
              className="sidebar-new-btn"
              variant="default"
              radius="md"
              size="sm"
              leftSection={<Plus size={15} strokeWidth={2} />}
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
                            session={session}
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
            <RailIcon label={t("settings")} onClick={openConfig}>
              <Settings size={16} />
            </RailIcon>
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
        size="lg"
        radius="lg"
        overlayProps={{ backgroundOpacity: 0.62, blur: 8 }}
        styles={{
          title: { fontWeight: 600, letterSpacing: "-0.02em" },
          header: { paddingBottom: 8 },
        }}
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

      {/* ─── MAIN CONTENT ─── */}
      <AppShell.Main>
        <Box className="chat-main">
          {hasContent ? (
            <Box className="session-toolbar">
              <Text className="session-toolbar-title">
                {activeSession?.title || activeSession?.objective || t("untitledResearch")}
              </Text>
              {confidence > 0 ? (
                <Badge variant="light" color="gray" size="sm" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {confidence.toFixed(0)}%
                </Badge>
              ) : null}
              {hasSessionData && (isWide || !showMobileChrome) ? (
                <InspectorToggle
                  collapsed={asideCollapsed}
                  onToggle={() => setAsideCollapsed((v) => !v)}
                  withTooltip={isWide}
                />
              ) : null}
            </Box>
          ) : null}

          {!hasContent ? (
            <Box className="chat-empty">
              <ChatColumn className="chat-empty-column">
                <Stack align="center" gap={28} w="100%">
                  <Stack align="center" gap="sm">
                    <SolidLogo wordmarkSize="lg" gap="sm" />
                    <Text c="dimmed" size="md" ta="center">
                      {t("tagline")}
                    </Text>
                  </Stack>
                  <Box className="chat-empty-composer" w="100%">
                    <ChatComposer {...composerProps} />
                  </Box>
                  {suggestions.length > 0 ? (
                    <Stack gap={8} w="100%" maw={520}>
                      {suggestions.slice(0, 4).map((chip) => (
                        <UnstyledButton
                          key={chip}
                          className="suggestion-chip"
                          onClick={() => handleSuggestionClick(chip)}
                        >
                          <Group gap={8} wrap="nowrap">
                            <Search size={13} style={{ flexShrink: 0, opacity: 0.45 }} />
                            <Text size="sm" style={{ lineHeight: 1.4 }}>{chip}</Text>
                          </Group>
                        </UnstyledButton>
                      ))}
                    </Stack>
                  ) : null}
                </Stack>
              </ChatColumn>
            </Box>
          ) : (
            <Box className="chat-main-body">
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
                    {parsed.rounds.map((round: ResearchRound, roundIdx: number) => {
                      const isLastRound = roundIdx === parsed.rounds.length - 1;
                      const roundHasReport = !!round.report;

                      return (
                        <Fragment key={roundIdx}>
                          {roundIdx === 0 && activeSession?.objective ? (
                            <QueryTurn label={t("queryLabel")} text={activeSession.objective} />
                          ) : null}

                          {round.followUpMessage ? (
                            <QueryTurn label={t("followUpLabel")} text={round.followUpMessage} />
                          ) : null}

                          {round.iterations.length > 0 ? (
                            <Box className="iteration-timeline">
                              {round.iterations.map((iteration) => (
                                <IterationCard key={iteration.number} iteration={iteration} />
                              ))}
                            </Box>
                          ) : null}

                          {isLastRound && isActiveRunning && !roundHasReport ? (
                            <Group gap="xs">
                              <Loader size="xs" type="dots" />
                              <Text size="sm" c="dimmed">
                                {t("analyzing")}
                              </Text>
                            </Group>
                          ) : null}

                          {roundHasReport ? (
                            <Box className="report-container" style={{ "--report-accent": reportBorderColor } as CSSProperties}>
                              {isLastRound && showVerdictBanner ? (
                                <Alert
                                  variant="light"
                                  color={entityVerdict === "nonexistent" ? "red" : "orange"}
                                  icon={<AlertTriangle size={16} />}
                                  mb="md"
                                >
                                  <MarkdownContent
                                    content={
                                      `**${t("entityVerdictBanner", { verdict: t(VERDICT_I18N[entityVerdict!]) })}**` +
                                      (parsed.reflection?.entity_reasoning
                                        ? ` — ${parsed.reflection.entity_reasoning}`
                                        : "")
                                    }
                                  />
                                </Alert>
                              ) : null}
                              <Text className="report-kicker">{t("answer")}</Text>
                              <MarkdownContent content={round.report} />
                            </Box>
                          ) : null}
                        </Fragment>
                      );
                    })}

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
                    bottom: "calc(8.5rem + env(safe-area-inset-bottom, 0px))",
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

        {!dockInspector && showDataPanel ? (
          <Box className="data-panel-float">{inspector}</Box>
        ) : null}
      </AppShell.Main>

      {dockInspector ? (
        <AppShell.Aside className="app-aside" withBorder={false} p={0}>
          {showDataPanel ? inspector : null}
        </AppShell.Aside>
      ) : null}
    </AppShell>
  );
}
