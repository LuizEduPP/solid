import { saveAs } from "file-saver";

import { translateActivityLine } from "./activity.js";
import i18n from "./i18n.js";
import type { ResearchSession } from "./history.js";
import { parseStream } from "./stream.js";

function exportSessionMarkdown(session: ResearchSession): string {
  const t = i18n.t.bind(i18n);
  const parsed = parseStream(session.rawStream);
  const lines: string[] = [
    `# ${session.objective}`,
    "",
    `- ${t("exportStatus")}: ${session.status}`,
    `- ${t("exportSolidness")}: ${parsed.confidence.toFixed(1)}%`,
    `- ${t("exportUpdated")}: ${new Date(session.updatedAt).toISOString()}`,
    "",
  ];

  if (parsed.report) {
    lines.push(`## ${t("exportAnswer")}`, "", parsed.report, "");
  }

  if (parsed.iterations.length > 0) {
    lines.push(`## ${t("exportSteps")}`, "");
    for (const iteration of parsed.iterations) {
      lines.push(
        `### ${t("exportStep")} ${iteration.number} (${iteration.score.toFixed(0)}%)`,
        "",
        iteration.angle ? `**${t("exportAngle")}:** ${iteration.angle}` : "",
        "",
        iteration.findings,
        "",
      );
    }
  }

  if (parsed.activity.length > 0) {
    lines.push(
      `## ${t("exportLog")}`,
      "",
      "```",
      parsed.activity.map(translateActivityLine).join("\n"),
      "```",
      "",
    );
  }

  return lines.filter(Boolean).join("\n");
}

export function downloadSession(session: ResearchSession): void {
  const markdown = exportSessionMarkdown(session);
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  saveAs(blob, `solid-${session.id.slice(0, 8)}.md`);
}
