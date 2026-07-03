import {
  Badge,
  Box,
  Group,
  Progress,
  RingProgress,
  ScrollArea,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  CircleSlash,
  HelpCircle,
  XCircle,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import FaviconImg from "./FaviconImg";
import type { IterationSnapshot, ReflectionSnapshot, EntityVerdict, InvestigationQuality } from "./stream";
import { hostnameFromUrl, uniqueUrlsByHostname, RUBRIC_DIMENSIONS, RUBRIC_MAX, type ScoreRubric } from "../shared";

const VERDICT_CONFIG: Record<EntityVerdict, { color: string; icon: typeof CheckCircle2 }> = {
  confirmed: { color: "green", icon: CheckCircle2 },
  likely: { color: "blue", icon: CheckCircle2 },
  uncertain: { color: "yellow", icon: HelpCircle },
  unlikely: { color: "orange", icon: AlertTriangle },
  nonexistent: { color: "red", icon: XCircle },
};

const QUALITY_CONFIG: Record<InvestigationQuality, { color: string }> = {
  progressing: { color: "green" },
  stagnating: { color: "yellow" },
  circular: { color: "orange" },
  exhausted: { color: "red" },
};

const EVIDENCE_COLORS: Record<string, string> = {
  direct: "green",
  contextual: "yellow",
  none: "gray",
};

const EVIDENCE_I18N: Record<string, string> = {
  direct: "evidenceDirect",
  contextual: "evidenceContextual",
  none: "evidenceNone",
};

const RUBRIC_COLORS: Record<keyof ScoreRubric, string> = {
  direct_evidence: "indigo",
  source_diversity: "teal",
  gap_coverage: "violet",
  risk_contradiction: "orange",
};

interface DataPanelProps {
  confidence: number;
  targetScore: number;
  iterations: IterationSnapshot[];
  reflection: ReflectionSnapshot | null;
  rubric: ScoreRubric | null;
  running: boolean;
}

function ScoreSection({ confidence, targetScore }: { confidence: number; targetScore: number }) {
  const pct = Math.min(100, confidence);
  const color = confidence >= targetScore * 0.85 ? "teal" : confidence >= 40 ? "yellow" : "red";

  return (
    <Box className="dp-section">
      <Group justify="center">
        <RingProgress
          size={120}
          thickness={10}
          roundCaps
          sections={[{ value: pct, color }]}
          label={
            <Stack gap={2} align="center">
              <Text fw={700} size="xl" lh={1} style={{ fontVariantNumeric: "tabular-nums" }}>
                {confidence.toFixed(0)}%
              </Text>
              <Text c="dimmed" size="xs" lh={1} style={{ fontVariantNumeric: "tabular-nums" }}>
                / {targetScore}
              </Text>
            </Stack>
          }
        />
      </Group>
    </Box>
  );
}

function EntityVerdictSection({ reflection }: { reflection: ReflectionSnapshot }) {
  const { t } = useTranslation();
  const cfg = VERDICT_CONFIG[reflection.entity_verdict];
  const Icon = cfg.icon;

  return (
    <Box className="dp-section">
      <Text className="dp-section-title">{t("entityVerdict")}</Text>
      <Tooltip label={reflection.entity_reasoning} multiline maw={280} withArrow>
        <Badge
          size="lg"
          variant="light"
          color={cfg.color}
          leftSection={<Icon size={14} />}
          style={{ cursor: "help", textTransform: "capitalize" }}
        >
          {reflection.entity_verdict} ({reflection.entity_confidence}%)
        </Badge>
      </Tooltip>
    </Box>
  );
}

function QualitySection({ reflection }: { reflection: ReflectionSnapshot }) {
  const { t } = useTranslation();
  const cfg = QUALITY_CONFIG[reflection.investigation_quality];

  return (
    <Box className="dp-section">
      <Text className="dp-section-title">{t("investigationQuality")}</Text>
      <Tooltip label={reflection.quality_reasoning} multiline maw={280} withArrow>
        <Badge
          size="md"
          variant="light"
          color={cfg.color}
          style={{ cursor: "help", textTransform: "capitalize" }}
        >
          {reflection.investigation_quality}
        </Badge>
      </Tooltip>
    </Box>
  );
}

function RubricSection({ rubric }: { rubric: ScoreRubric }) {
  const { t } = useTranslation();

  return (
    <Box className="dp-section">
      <Text className="dp-section-title">{t("rubric")}</Text>
      <Stack gap={8}>
        {RUBRIC_DIMENSIONS.map(({ key, labelKey, hintKey }) => {
          const value = rubric[key];
          return (
            <Tooltip key={key} label={t(hintKey)} multiline maw={260} withArrow>
              <Box>
                <Group justify="space-between" gap={4} mb={2}>
                  <Text size="xs" c="dimmed" fw={500}>{t(labelKey)}</Text>
                  <Text size="xs" c="dimmed" fw={600} style={{ fontVariantNumeric: "tabular-nums" }}>
                    {value}/{RUBRIC_MAX}
                  </Text>
                </Group>
                <Progress
                  value={(value / RUBRIC_MAX) * 100}
                  size="sm"
                  radius="xl"
                  color={RUBRIC_COLORS[key]}
                />
              </Box>
            </Tooltip>
          );
        })}
      </Stack>
    </Box>
  );
}

function ObservationsSection({ observations }: { observations: string[] }) {
  const { t } = useTranslation();
  if (observations.length === 0) return null;

  return (
    <Box className="dp-section">
      <Text className="dp-section-title">{t("keyObservations")}</Text>
      <Stack gap={4}>
        {observations.map((obs, i) => (
          <Text key={i} size="xs" c="dimmed" lh={1.4}>
            • {obs}
          </Text>
        ))}
      </Stack>
    </Box>
  );
}

function SourcesSection({ iterations }: { iterations: IterationSnapshot[] }) {
  const { t } = useTranslation();
  const allUrls = iterations.flatMap((it) => [
    ...(it.citedUrls ?? []),
    ...(it.readUrls ?? []),
  ]);
  const unique = uniqueUrlsByHostname(allUrls);

  if (unique.length === 0) return null;

  const byHost = new Map<string, string[]>();
  for (const url of unique) {
    const host = hostnameFromUrl(url);
    if (!byHost.has(host)) byHost.set(host, []);
    byHost.get(host)!.push(url);
  }

  return (
    <Box className="dp-section">
      <Text className="dp-section-title">{t("dpSources", { count: byHost.size })}</Text>
      <Stack gap={4}>
        {[...byHost.entries()].map(([host, urls]) => (
          <Group key={host} gap={6} wrap="nowrap">
            <FaviconImg url={urls[0]} size={14} style={{ borderRadius: 2, flexShrink: 0 }} />
            <Text
              component="a"
              href={urls[0]}
              target="_blank"
              rel="noreferrer"
              size="xs"
              c="dimmed"
              style={{ textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              className="dp-source-link"
            >
              {host}
              {urls.length > 1 ? ` (+${urls.length - 1})` : ""}
            </Text>
          </Group>
        ))}
      </Stack>
    </Box>
  );
}

function TimelineSection({ iterations }: { iterations: IterationSnapshot[] }) {
  const { t } = useTranslation();
  if (iterations.length === 0) return null;

  return (
    <Box className="dp-section">
      <Text className="dp-section-title">{t("timeline")}</Text>
      <Stack gap={0}>
        {iterations.map((it, i) => (
          <Group key={it.number} gap={8} wrap="nowrap" className="dp-timeline-row">
            <Box className="dp-timeline-dot-col">
              {i > 0 && <Box className="dp-timeline-line dp-timeline-line--top" />}
              <Box className={`dp-timeline-dot dp-timeline-dot--${it.evidenceType ?? "none"}`} />
              {i < iterations.length - 1 && <Box className="dp-timeline-line dp-timeline-line--bottom" />}
            </Box>
            <Group gap={6} flex={1} miw={0} wrap="nowrap">
              <Text size="xs" fw={600} style={{ fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                #{it.number}
              </Text>
              <Badge size="xs" variant="light" color={EVIDENCE_COLORS[it.evidenceType ?? "none"]}>
                {t(EVIDENCE_I18N[it.evidenceType ?? "none"])}
              </Badge>
              <Text size="xs" c="dimmed" fw={600} style={{ fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                {it.score.toFixed(0)}%
              </Text>
            </Group>
          </Group>
        ))}
      </Stack>
    </Box>
  );
}

function GapsSection({ iterations }: { iterations: IterationSnapshot[] }) {
  const { t } = useTranslation();
  const lastGaps = iterations.at(-1)?.gaps ?? [];
  if (lastGaps.length === 0) return null;

  return (
    <Box className="dp-section">
      <Text className="dp-section-title">{t("openGaps")}</Text>
      <Stack gap={4}>
        {lastGaps.map((gap, i) => (
          <Group key={i} gap={6} wrap="nowrap" align="flex-start">
            <CircleDashed size={12} style={{ flexShrink: 0, marginTop: 3 }} color="var(--mantine-color-yellow-5)" />
            <Text size="xs" c="dimmed" lh={1.4}>
              {gap}
            </Text>
          </Group>
        ))}
      </Stack>
    </Box>
  );
}

export default function DataPanel({
  confidence,
  targetScore,
  iterations,
  reflection,
  rubric,
  running,
}: DataPanelProps) {
  const { t } = useTranslation();
  const hasData = iterations.length > 0 || running;
  if (!hasData) return null;

  return (
    <ScrollArea h="100%" type="auto" classNames={{ viewport: "dp-viewport" }}>
      <Stack gap={0} className="dp-root">
        <ScoreSection confidence={confidence} targetScore={targetScore} />

        {reflection && <EntityVerdictSection reflection={reflection} />}
        {reflection && <QualitySection reflection={reflection} />}
        {rubric && <RubricSection rubric={rubric} />}
        {reflection && reflection.key_observations.length > 0 && (
          <ObservationsSection observations={reflection.key_observations} />
        )}
        <SourcesSection iterations={iterations} />
        <TimelineSection iterations={iterations} />
        <GapsSection iterations={iterations} />

        {running && iterations.length === 0 && (
          <Box className="dp-section" style={{ textAlign: "center" }}>
            <CircleSlash size={20} color="var(--solid-text-muted)" />
            <Text size="xs" c="dimmed" mt={4}>{t("researching")}…</Text>
          </Box>
        )}
      </Stack>
    </ScrollArea>
  );
}
