import { Anchor, Box, Group } from "@mantine/core";

import { hostnameFromUrl } from "../shared/domains.js";

interface SiteLinkProps {
  url: string;
  label?: string;
  size?: number;
  textSize?: string;
}

function faviconUrl(url: string): string {
  const hostname = hostnameFromUrl(url);
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=32`;
}

export default function SiteLink({
  url,
  label,
  size = 16,
  textSize = "sm",
}: SiteLinkProps) {
  const display = label?.trim() || hostnameFromUrl(url);
  const icon = faviconUrl(url);

  return (
    <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
      <Box
        component="img"
        src={icon}
        alt=""
        w={size}
        h={size}
        style={{ borderRadius: 2, flexShrink: 0 }}
      />
      <Anchor
        href={url}
        target="_blank"
        rel="noreferrer"
        size={textSize}
        c="cyan.4"
        lineClamp={1}
        style={{ minWidth: 0 }}
      >
        {display}
      </Anchor>
    </Group>
  );
}
