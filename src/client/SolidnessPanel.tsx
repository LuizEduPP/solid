import {
  Alert,
  ActionIcon,
  Box,
  Group,
  Paper,
  Progress,
  RingProgress,
  SimpleGrid,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { AlertTriangle, ChevronDown, ChevronUp, ShieldCheck, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  RUBRIC_DIMENSIONS,
  RUBRIC_MAX,
  weakestRubricKey,
  type ModeThresholds,
  type ScoreRubric,
} from "../shared";

const DIMENSION_COLORS: Record<keyof ScoreRubric, string> = {
  direct_evidence: "blue",
  source_diversity: "teal",
  gap_coverage: "violet",
  risk_contradiction: "orange",
};

type EvidenceStatus = "weak" | "building" | "solid";

function evidenceStatus(
  confidence: number,
  sourceCount: number,
  targetScore: number,
  thresholds: ModeThresholds,
): EvidenceStatus {
  const scoreLow = confidence < thresholds.weakEvidenceBelow;
  const domainsLow = sourceCount < thresholds.minDomainsFor100;

  if (scoreLow && domainsLow) return "weak";
  if (scoreLow || domainsLow || confidence < targetScore * 0.85) return "building";
  return "solid";
}

function scoreColor(status: EvidenceStatus): string {
  if (status === "weak") return "red";
  if (status === "building") return "yellow";
  return "teal";
}

function statusLabelKey(status: EvidenceStatus): string {
  if (status === "weak") return "evidenceStatusWeak";
  if (status === "building") return "evidenceStatusBuilding";
  return "evidenceStatusSolid";
}

function statusIcon(status: EvidenceStatus) {
  if (status === "weak") return AlertTriangle;
  if (status === "building") return TrendingUp;
  return ShieldCheck;
}

function weakReasons(
  confidence: number,
  sourceCount: number,
  rubric: ScoreRubric | null,
  thresholds: ModeThresholds,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string[] {
  const reasons: string[] = [];

  if (confidence < thresholds.weakEvidenceBelow) {
    reasons.push(
      t("weakEvidenceScore", { current: confidence.toFixed(0), threshold: thresholds.weakEvidenceBelow }),
    );
  }

  if (sourceCount < thresholds.minDomainsFor100) {
    reasons.push(
      t("weakEvidenceDomains", { count: sourceCount, min: thresholds.minDomainsFor100 }),
    );
  }

  if (rubric) {
    const weakest = weakestRubricKey(rubric);
    const dimension = RUBRIC_DIMENSIONS.find((item) => item.key === weakest);
    if (dimension && rubric[weakest] < 18) {
      reasons.push(t("weakEvidenceRubric", { dimension: t(dimension.labelKey) }));
    }
  }

  return reasons;
}

interface SolidnessPanelProps {
  confidence: number;
  iteration: number | null;
  rubric: ScoreRubric | null;
  sourceCount: number;
  targetScore: number;
  thresholds: ModeThresholds;
  running?: boolean;
  compact?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
}

export default function SolidnessPanel({
  confidence,
  iteration,
  rubric,
  sourceCount,
  targetScore,
  thresholds,
  running = false,
  compact = false,
  expanded = false,
  onToggleExpand,
}: SolidnessPanelProps) {
  const { t } = useTranslation();

  if (confidence <= 0 && !running) return null;

  const status = evidenceStatus(confidence, sourceCount, targetScore, thresholds);
  const color = scoreColor(status);
  const StatusIcon = statusIcon(status);
  const reasons = weakReasons(confidence, sourceCount, rubric, thresholds, t);
  const showReasons = reasons.length > 0 && status !== "solid";
  const weakest = rubric ? weakestRubricKey(rubric) : null;

  const ringLabel = (size: number, showTarget: boolean) => (
    <Stack
      gap={showTarget ? 2 : 0}
      align="center"
      justify="center"
      style={{ textAlign: "center", maxWidth: size * 0.58 }}
    >
      <Text
        fw={700}
        lh={1}
        ta="center"
        style={{
          fontVariantNumeric: "tabular-nums",
          fontSize: size >= 92 ? 17 : size >= 72 ? 13 : 11,
        }}
      >
        {confidence.toFixed(0)}%
      </Text>
      {showTarget ? (
        <Text
          c="dimmed"
          ta="center"
          style={{ fontVariantNumeric: "tabular-nums", fontSize: 10, lineHeight: 1 }}
        >
          {targetScore}
        </Text>
      ) : null}
    </Stack>
  );

  const ring = (size: number, thickness: number, showTarget: boolean) => (
    <RingProgress
      size={size}
      thickness={thickness}
      roundCaps
      sections={[{ value: Math.min(100, confidence), color }]}
      label={ringLabel(size, showTarget)}
      styles={{
        label: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          maxWidth: size * 0.62,
          overflow: "hidden",
        },
      }}
    />
  );

  const statusLine = (
    <Group gap={6} wrap="wrap">
      <Group gap={4} wrap="nowrap">
        <StatusIcon size={15} color={`var(--mantine-color-${color}-5)`} />
        <Text size="sm" fw={600} c={color}>
          {t(statusLabelKey(status))}
        </Text>
      </Group>
      {iteration ? (
        <Text size="xs" c="dimmed">
          · {t("solidnessStep", { n: iteration })}
        </Text>
      ) : null}
      <Text size="xs" c="dimmed">
        · {t("solidnessDomains", { count: sourceCount })}
      </Text>
    </Group>
  );

  const rubricGrid = rubric ? (
    <SimpleGrid cols={{ base: 2, sm: 4 }} spacing={8}>
      {RUBRIC_DIMENSIONS.map(({ key, labelKey, hintKey }) => {
        const value = rubric[key];
        const dimColor = DIMENSION_COLORS[key];
        const isWeakest = key === weakest;

        return (
          <Tooltip key={key} label={t(hintKey)} multiline maw={260} withArrow>
            <Box
              p={6}
              style={{
                borderRadius: 8,
                border: isWeakest
                  ? `1px solid var(--mantine-color-${dimColor}-8)`
                  : "1px solid transparent",
                background: isWeakest ? "var(--mantine-color-dark-6)" : undefined,
              }}
            >
              <Group justify="space-between" gap={4} mb={4}>
                <Text size="10px" tt="uppercase" c="dimmed" fw={600} lh={1.2}>
                  {t(labelKey)}
                </Text>
                <Text size="10px" c="dimmed" fw={600}>
                  {value}/{RUBRIC_MAX}
                </Text>
              </Group>
              <Progress
                value={(value / RUBRIC_MAX) * 100}
                size="sm"
                radius="xl"
                color={dimColor}
              />
            </Box>
          </Tooltip>
        );
      })}
    </SimpleGrid>
  ) : running ? (
    <Text size="xs" c="dimmed">
      {t("solidnessPending")}
    </Text>
  ) : null;

  const reasonsAlert = showReasons ? (
    <Alert
      mt="sm"
      variant="light"
      color={status === "weak" ? "red" : "yellow"}
      icon={<AlertTriangle size={16} />}
      py={6}
      styles={{ message: { fontSize: "var(--mantine-font-size-xs)" } }}
    >
      {reasons.join(" · ")}
    </Alert>
  ) : null;

  if (compact && !expanded) {
    return (
      <Paper p="xs" radius="md" withBorder bg="dark.7" w="100%">
        <Group justify="space-between" wrap="nowrap" gap="xs">
          <Group gap="sm" wrap="nowrap" flex={1} miw={0}>
            <Box style={{ flexShrink: 0, lineHeight: 0 }}>{ring(52, 5, false)}</Box>
            <Stack gap={2} miw={0}>
              {statusLine}
            </Stack>
          </Group>
          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label={t("expandSolidness")}
            onClick={onToggleExpand}
          >
            <ChevronDown size={18} />
          </ActionIcon>
        </Group>
      </Paper>
    );
  }

  return (
    <Paper
      p={compact ? "sm" : "md"}
      radius="md"
      withBorder
      bg="dark.7"
      w="100%"
      style={
        compact && expanded
          ? { maxHeight: "min(70vh, 520px)", overflow: "auto" }
          : undefined
      }
    >
      {compact ? (
        <Group justify="space-between" mb="xs" wrap="nowrap">
          <Text size="xs" tt="uppercase" c="dimmed" fw={600}>
            {t("solidness")}
          </Text>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            aria-label={t("collapseSolidness")}
            onClick={onToggleExpand}
          >
            <ChevronUp size={16} />
          </ActionIcon>
        </Group>
      ) : null}

      <Group align="flex-start" wrap="nowrap" gap="md">
        <Box style={{ flexShrink: 0, lineHeight: 0 }}>
          {ring(compact ? 72 : 92, compact ? 7 : 9, !compact)}
        </Box>

        <Stack gap="xs" flex={1} miw={0}>
          {statusLine}
          {rubricGrid}
        </Stack>
      </Group>

      {showReasons && (!compact || expanded) ? reasonsAlert : null}
    </Paper>
  );
}
