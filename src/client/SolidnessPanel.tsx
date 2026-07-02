import {
  Alert,
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
import { AlertTriangle, ShieldCheck, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";

import { RUBRIC_DIMENSIONS, RUBRIC_MAX, weakestRubricKey } from "../shared/rubric";
import type { ModeThresholds } from "../shared/thresholds";
import type { ScoreRubric } from "../shared/types";

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
}

export default function SolidnessPanel({
  confidence,
  iteration,
  rubric,
  sourceCount,
  targetScore,
  thresholds,
  running = false,
}: SolidnessPanelProps) {
  const { t } = useTranslation();

  if (confidence <= 0 && !running) return null;

  const status = evidenceStatus(confidence, sourceCount, targetScore, thresholds);
  const color = scoreColor(status);
  const StatusIcon = statusIcon(status);
  const reasons = weakReasons(confidence, sourceCount, rubric, thresholds, t);
  const showReasons = reasons.length > 0 && status !== "solid";
  const weakest = rubric ? weakestRubricKey(rubric) : null;

  return (
    <Paper p="md" radius="md" withBorder bg="dark.7" w="100%">
      <Group align="flex-start" wrap="nowrap" gap="md">
        <RingProgress
          size={92}
          thickness={9}
          roundCaps
          sections={[{ value: Math.min(100, confidence), color }]}
          label={
            <Stack gap={0} align="center">
              <Text size="lg" fw={700} lh={1.1}>
                {confidence.toFixed(0)}%
              </Text>
              <Text size="10px" c="dimmed" lh={1.2}>
                {t("solidnessTarget", { target: targetScore })}
              </Text>
            </Stack>
          }
        />

        <Stack gap="xs" flex={1} miw={0}>
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

          {rubric ? (
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
          ) : null}
        </Stack>
      </Group>

      {showReasons ? (
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
      ) : null}
    </Paper>
  );
}
