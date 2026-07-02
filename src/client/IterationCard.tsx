import type { ReactNode } from "react";
import { Accordion, Badge, Group, Paper, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";

import MarkdownContent from "./MarkdownContent";
import FaviconImg from "./FaviconImg";
import type { IterationSnapshot, SourceSnapshot } from "./stream";
import { hostnameFromUrl, uniqueUrlsByHostname } from "../shared";

interface IterationCardProps {
  iteration: IterationSnapshot;
}

function mergedPageUrls(readUrls: string[], sources: SourceSnapshot[]): string[] {
  return uniqueUrlsByHostname([
    ...readUrls,
    ...sources.map((source) => source.url),
  ]);
}

function SectionShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Stack
      gap={6}
      mt="md"
      pt="sm"
      style={{ borderTop: "1px solid var(--mantine-color-dark-4)" }}
    >
      <Text size="xs" tt="uppercase" c="dimmed" fw={600}>
        {title}
      </Text>
      {children}
    </Stack>
  );
}

function PageReadBadge({ url }: { url: string }) {
  const host = hostnameFromUrl(url);

  return (
    <Badge
      component="a"
      href={url}
      target="_blank"
      rel="noreferrer"
      variant="light"
      color="gray"
      size="sm"
      radius="sm"
      style={{ cursor: "pointer", textTransform: "none" }}
      leftSection={<FaviconImg url={url} size={12} style={{ borderRadius: 2 }} />}
    >
      {host}
    </Badge>
  );
}

export default function IterationCard({ iteration }: IterationCardProps) {
  const { t } = useTranslation();
  const pages = mergedPageUrls(iteration.readUrls ?? [], iteration.sources ?? []);

  return (
    <Paper p="md" radius="md" className="glass-panel">
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

      {pages.length > 0 ? (
        <SectionShell title={t("pagesRead")}>
          <Group gap={6}>
            {pages.map((url) => (
              <PageReadBadge key={url} url={url} />
            ))}
          </Group>
        </SectionShell>
      ) : null}
    </Paper>
  );
}
