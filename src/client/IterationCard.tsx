import { Accordion, Badge, Group, Paper, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";

import IterationLinks from "./IterationLinks";
import MarkdownContent from "./MarkdownContent";
import type { IterationSnapshot } from "./stream";

interface IterationCardProps {
  iteration: IterationSnapshot;
}

export default function IterationCard({ iteration }: IterationCardProps) {
  const { t } = useTranslation();

  return (
    <Paper p="md" radius="md" withBorder>
      <Group justify="space-between" mb="sm">
        <Text size="sm" fw={600}>
          {t("step")} {iteration.number}
          {iteration.angle ? ` · ${iteration.angle}` : ""}
        </Text>
        <Badge variant="light">{iteration.score.toFixed(0)}%</Badge>
      </Group>

      {iteration.findings ? <MarkdownContent content={iteration.findings} /> : null}

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

      <IterationLinks
        pagesReadTitle={t("pagesRead")}
        readUrls={iteration.readUrls}
        sources={iteration.sources}
      />
    </Paper>
  );
}
