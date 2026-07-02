import { Box, Group, Text } from "@mantine/core";

import { faviconUrl, siteLabel } from "./sites.js";

interface SiteLinkProps {
  url: string;
  size?: number;
  textSize?: string;
}

export default function SiteLink({ url, size = 16, textSize = "sm" }: SiteLinkProps) {
  const label = siteLabel(url);
  const icon = faviconUrl(url);

  return (
    <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
      {icon ? (
        <Box
          component="img"
          src={icon}
          alt=""
          w={size}
          h={size}
          style={{ borderRadius: 2, flexShrink: 0 }}
        />
      ) : null}
      <Text
        component="a"
        href={url}
        target="_blank"
        rel="noreferrer"
        size={textSize}
        c="cyan.4"
        lineClamp={1}
        style={{ minWidth: 0 }}
      >
        {label}
      </Text>
    </Group>
  );
}
