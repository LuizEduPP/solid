import type { ReactNode } from "react";
import { Badge, Box, Group, Stack, Text } from "@mantine/core";

import { faviconUrl, hostnameFromUrl } from "../shared/domains";
import type { SourceSnapshot } from "./stream";

function mergedPageUrls(readUrls: string[], sources: SourceSnapshot[]): string[] {
  const seenHosts = new Set<string>();
  const out: string[] = [];

  for (const url of [...readUrls, ...sources.map((source) => source.url)]) {
    const host = hostnameFromUrl(url);
    if (!host || seenHosts.has(host)) continue;
    seenHosts.add(host);
    out.push(url);
  }

  return out;
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
      leftSection={
        <Box
          component="img"
          src={faviconUrl(url)}
          alt=""
          w={12}
          h={12}
          style={{ borderRadius: 2, display: "block" }}
        />
      }
    >
      {host}
    </Badge>
  );
}

interface IterationLinksProps {
  pagesReadTitle: string;
  readUrls?: string[];
  sources?: SourceSnapshot[];
}

export default function IterationLinks({
  pagesReadTitle,
  readUrls = [],
  sources = [],
}: IterationLinksProps) {
  const pages = mergedPageUrls(readUrls, sources);

  if (pages.length === 0) return null;

  return (
    <SectionShell title={pagesReadTitle}>
      <Group gap={6}>
        {pages.map((url) => (
          <PageReadBadge key={url} url={url} />
        ))}
      </Group>
    </SectionShell>
  );
}
