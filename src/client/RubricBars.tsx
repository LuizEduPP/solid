import { Progress, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";

import type { ScoreRubric } from "../shared/types.js";

interface RubricBarsProps {
  rubric: ScoreRubric;
}

export default function RubricBars({ rubric }: RubricBarsProps) {
  const { t } = useTranslation();
  const rows: Array<{ key: keyof ScoreRubric; labelKey: string }> = [
    { key: "direct_evidence", labelKey: "rubricEvidence" },
    { key: "source_diversity", labelKey: "rubricSources" },
    { key: "gap_coverage", labelKey: "rubricGaps" },
    { key: "risk_contradiction", labelKey: "rubricRisks" },
  ];

  return (
    <Stack gap={6} maw={720} mx="auto" px="lg" py="xs">
      {rows.map(({ key, labelKey }) => (
        <div
          key={key}
          style={{
            display: "grid",
            gridTemplateColumns: "4.5rem 1fr 1.75rem",
            gap: "0.5rem",
            alignItems: "center",
          }}
        >
          <Text size="xs" c="dimmed">
            {t(labelKey)}
          </Text>
          <Progress value={(rubric[key] / 25) * 100} size="xs" radius="xl" />
          <Text size="xs" ta="right" c="dimmed">
            {rubric[key]}
          </Text>
        </div>
      ))}
    </Stack>
  );
}
