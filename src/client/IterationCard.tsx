import type { ReactNode } from "react";
import { Accordion, Alert, Badge, Group, Paper, Stack, Text } from "@mantine/core";
import { AlertTriangle, ArrowDown, ArrowUp, Minus } from "lucide-react";
import { useTranslation } from "react-i18next";

import MarkdownContent from "./MarkdownContent";
import FaviconImg from "./FaviconImg";
import type { IterationSnapshot, SourceSnapshot } from "./stream";
import { hostnameFromUrl, uniqueUrlsByHostname } from "../shared";

interface IterationCardProps {
  iteration: IterationSnapshot;
}

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

function ScoreDeltaIndicator({ delta }: { delta: string }) {
  const numDelta = parseFloat(delta);
  if (isNaN(numDelta) || numDelta === 0) {
    return (
      <Group gap={2} wrap="nowrap">
        <Minus size={12} color="var(--mantine-color-gray-5)" />
        <Text size="xs" c="dimmed" style={{ fontVariantNumeric: "tabular-nums" }}>0</Text>
      </Group>
    );
  }

  const positive = numDelta > 0;
  const color = positive ? "teal" : "red";
  const Icon = positive ? ArrowUp : ArrowDown;

  return (
    <Group gap={2} wrap="nowrap">
      <Icon size={12} color={`var(--mantine-color-${color}-5)`} />
      <Text size="xs" c={color} fw={600} style={{ fontVariantNumeric: "tabular-nums" }}>
        {positive ? "+" : ""}{numDelta.toFixed(1)}
      </Text>
    </Group>
  );
}

export default function IterationCard({ iteration }: IterationCardProps) {
  const { t } = useTranslation();
  const pages = mergedPageUrls(iteration.readUrls ?? [], iteration.sources ?? []);
  const evType = iteration.evidenceType ?? "none";

  return (
    <Paper p="md" radius="md" withBorder={false} bg="dark.6" className="iteration-card">
      <Group justify="space-between" mb="sm" wrap="nowrap">
        <Group gap={8} wrap="nowrap" miw={0}>
          <Text size="sm" fw={600} style={{ flexShrink: 0 }}>
            {t("step")} {iteration.number}
          </Text>
          {iteration.angle ? (
            <Text size="sm" c="dimmed" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              · {iteration.angle}
            </Text>
          ) : null}
        </Group>
        <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
          <Badge size="sm" variant="light" color={EVIDENCE_COLORS[evType]}>
            {t(EVIDENCE_I18N[evType])}
          </Badge>
          <Badge variant="light" style={{ fontVariantNumeric: "tabular-nums" }}>
            {iteration.score.toFixed(0)}%
          </Badge>
          <ScoreDeltaIndicator delta={iteration.scoreDelta} />
        </Group>
      </Group>

      {iteration.findings ? <MarkdownContent content={iteration.findings} /> : null}

      {iteration.disambiguationNotes ? (
        <Alert
          variant="light"
          color="yellow"
          icon={<AlertTriangle size={14} />}
          mt="sm"
          py={8}
          styles={{ message: { fontSize: "var(--mantine-font-size-xs)" } }}
        >
          {iteration.disambiguationNotes}
        </Alert>
      ) : null}

      {iteration.scoreReasoning ? (
        <Text size="sm" c="dimmed" mt="sm">
          {iteration.scoreReasoning}
        </Text>
      ) : null}

      {iteration.synthesis ? (
        <Accordion variant="contained" mt="sm" classNames={{ control: "iter-accordion-control" }}>
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
