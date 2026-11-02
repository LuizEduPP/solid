import {
  Badge,
  Box,
  Group,
  Progress,
  ScrollArea,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  HelpCircle,
  XCircle,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import FaviconImg from "./FaviconImg";
import type { IterationSnapshot, ReflectionSnapshot, EntityVerdict, InvestigationQuality } from "./stream";
import {
  EVIDENCE_COLORS,
  EVIDENCE_I18N,
  groupUrlsByHostname,
  QUALITY_I18N,
  RUBRIC_DIMENSIONS,
  RUBRIC_MAX,
  scoreTone,
  VERDICT_I18N,
  type ScoreRubric,
} from "../shared";

const VERDICT_STYLE: Record<EntityVerdict, { color: string; icon: typeof CheckCircle2 }> = {
  confirmed: { color: "green", icon: CheckCircle2 },
  likely: { color: "blue", icon: CheckCircle2 },
  uncertain: { color: "yellow", icon: HelpCircle },
  unlikely: { color: "orange", icon: AlertTriangle },
  nonexistent: { color: "red", icon: XCircle },
};

const QUALITY_COLOR: Record<InvestigationQuality, string> = {
  progressing: "green",
  stagnating: "yellow",
  circular: "orange",
  exhausted: "red",
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
  const { t } = useTranslation();
  const pct = Math.min(100, confidence);
  const tone = scoreTone(confidence);

  return (
    <Box className="dp-section">
      <Group justify="space-between" align="flex-end" mb={10}>
        <div>
          <Text className="dp-section-title" mb={6}>{t("solidness")}</Text>
          <Text className="dp-score-value" c={tone}>{confidence.toFixed(0)}%</Text>
        </div>
        <Text c="dimmed" size="xs" style={{ fontVariantNumeric: "tabular-nums" }}>
          {t("solidnessTarget", { target: targetScore })}
        </Text>
      </Group>
      <Progress value={pct} size="sm" radius="xl" color={tone === "gray" ? "indigo" : tone} />
    </Box>
  );
}

function EntityVerdictSection({ reflection }: { reflection: ReflectionSnapshot }) {
  const { t } = useTranslation();
  const cfg = VERDICT_STYLE[reflection.entity_verdict];
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
          style={{ cursor: "help" }}
        >
          {t(VERDICT_I18N[reflection.entity_verdict])} ({reflection.entity_confidence}%)
        </Badge>
      </Tooltip>
    </Box>
  );
}

function QualitySection({ reflection }: { reflection: ReflectionSnapshot }) {
  const { t } = useTranslation();
  return (
    <Box className="dp-section">
      <Text className="dp-section-title">{t("investigationQuality")}</Text>
      <Tooltip label={reflection.quality_reasoning} multiline maw={280} withArrow>
        <Badge
          size="md"
          variant="light"
          color={QUALITY_COLOR[reflection.investigation_quality]}
          style={{ cursor: "help" }}
        >
          {t(QUALITY_I18N[reflection.investigation_quality])}
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
  const byHost = groupUrlsByHostname(
    iterations.flatMap((it) => [
      ...(it.citedUrls ?? []),
      ...(it.readUrls ?? []),
    ]),
  );

  if (byHost.length === 0) return null;

  return (
    <Box className="dp-section">
      <Text className="dp-section-title">{t("dpSources", { count: byHost.length })}</Text>
      <Stack gap={4}>
        {byHost.map(([host, urls]) => (
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
          <Box className="dp-section">
            <Text size="xs" c="dimmed">{t("researching")}…</Text>
          </Box>
        )}
      </Stack>
    </ScrollArea>
  );
}
