import i18n from "./i18n.js";

export function parsePageReadUrl(line: string): string | null {
  const match = line.trim().match(/^Page read: (https?:\/\/\S+)$/i);
  return match?.[1] ?? null;
}

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

  if (trimmed === "Research started") return i18n.t("activityResearchStarted");
  if (trimmed === "Generating final report...") {
    return i18n.t("activityGeneratingReport");
  }
  if (trimmed === "Model stopped — diminishing returns from search") {
    return i18n.t("activityModelStopped");
  }

  let match = trimmed.match(/^Search failed: (.+)$/);
  if (match) return i18n.t("activitySearchFailed", { query: match[1] });

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

  match = trimmed.match(/^Iteration (\d+) · (.+?)( · disconfirmation)?$/);
  if (match) {
    const suffix = match[3] ? ` · ${i18n.t("activityDisconfirmation")}` : "";
    return `${i18n.t("activityIteration", { n: match[1], angle: match[2] })}${suffix}`;
  }

  return line;
}
