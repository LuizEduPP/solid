import { Text } from "@mantine/core";

import i18n from "./i18n";

const PAGE_READ_RE = /^Page read: (https?:\/\/\S+)$/i;
const PAGES_FETCHED_RE = /^(\d+) page\(s\) fetched$/;
const DISCONFIRM_TAG = " · disconfirmation";

function translateGateReason(reason: string): string {
  let match = reason.match(/^(\d+) open gap\(s\)$/);
  if (match) return i18n.t("gateOpenGaps", { count: match[1] });

  match = reason.match(/^minimum (\d+) iterations$/);
  if (match) return i18n.t("gateMinIterations", { count: match[1] });

  match = reason.match(/^minimum (\d+) unique domains$/);
  if (match) return i18n.t("gateMinDomains", { count: match[1] });

  if (reason === "missing disconfirmation round") {
    return i18n.t("gateDisconfirmation");
  }

  return reason;
}

export function translateActivityLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) return line;

  if (PAGE_READ_RE.test(trimmed)) return "";

  if (trimmed === "Research started") return i18n.t("activityResearchStarted");
  if (trimmed === "Generating final report...") {
    return i18n.t("activityGeneratingReport");
  }
  if (trimmed === "Model stopped — diminishing returns from search") {
    return i18n.t("activityModelStopped");
  }

  let match = trimmed.match(/^Search failed: (.+)$/);
  if (match) return i18n.t("activitySearchFailed", { query: match[1] });

  match = trimmed.match(PAGES_FETCHED_RE);
  if (match) return i18n.t("activityPagesFetched", { count: match[1] });

  match = trimmed.match(/^(\d+) results · analyzing$/);
  if (match) return i18n.t("activityResultsAnalyzing", { count: match[1] });

  match = trimmed.match(/^Score capped: (.+)$/);
  if (match) {
    return i18n.t("activityScoreCapped", {
      reason: translateGateReason(match[1]!),
    });
  }

  match = trimmed.match(/^Target (\d+)% reached$/);
  if (match) return i18n.t("activityTargetReached", { target: match[1] });

  match = trimmed.match(/^Iteration (\d+) · (.+)$/);
  if (match) {
    let angle = match[2]!;
    let suffix = "";
    if (angle.endsWith(DISCONFIRM_TAG)) {
      angle = angle.slice(0, -DISCONFIRM_TAG.length);
      suffix = ` · ${i18n.t("activityDisconfirmation")}`;
    }
    return `${i18n.t("activityIteration", { n: match[1], angle })}${suffix}`;
  }

  return line;
}

/** Collapse per-URL page reads into a single count line for the steps panel. */
export function compressStepsActivity(lines: string[]): string[] {
  const out: string[] = [];
  let pageReadCount = 0;

  const flushPages = () => {
    if (pageReadCount <= 0) return;
    out.push(`${pageReadCount} page(s) fetched`);
    pageReadCount = 0;
  };

  for (const line of lines) {
    if (PAGE_READ_RE.test(line.trim())) {
      pageReadCount += 1;
      continue;
    }
    flushPages();
    out.push(line);
  }

  flushPages();
  return out;
}

interface ActivityLineProps {
  line: string;
  active?: boolean;
}

export default function ActivityLine({ line, active = false }: ActivityLineProps) {
  const text = translateActivityLine(line);
  if (!text) return null;

  return (
    <Text component="li" size="xs" c={active ? "indigo.3" : "dimmed"}>
      {text}
    </Text>
  );
}
