import { Text } from "@mantine/core";

import { parsePageReadUrl, translateActivityLine } from "./activity.js";
import SiteLink from "./SiteLink.js";

interface ActivityLineProps {
  line: string;
  active?: boolean;
}

export default function ActivityLine({ line, active = false }: ActivityLineProps) {
  const pageUrl = parsePageReadUrl(line);
  const color = active ? "cyan.4" : "dimmed";

  if (pageUrl) {
    return (
      <li>
        <SiteLink url={pageUrl} size={14} textSize="xs" />
      </li>
    );
  }

  return (
    <Text component="li" size="xs" c={color}>
      {translateActivityLine(line)}
    </Text>
  );
}
