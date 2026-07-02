import { saveAs } from "file-saver";

import i18n from "./i18n.js";
import type { ResearchSession } from "./history";

export function exportSessionMarkdown(session: ResearchSession): string {
  const t = i18n.t.bind(i18n);
  const lines: string[] = [
    `# ${session.objective}`,
    "",
    `- ${t("exportStatus")}: ${session.status}`,
    `- ${t("exportSolidness")}: ${session.confidence.toFixed(1)}%`,
    `- ${t("exportUpdated")}: ${new Date(session.updatedAt).toISOString()}`,
    "",
  ];

  if (session.report) {
    lines.push(`## ${t("exportAnswer")}`, "", session.report, "");
  }

  if (session.iterations.length > 0) {
    lines.push(`## ${t("exportSteps")}`, "");
    for (const iteration of session.iterations) {
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

  if (session.activity.length > 0) {
    lines.push(`## ${t("exportLog")}`, "", "```", session.activity.join("\n"), "```", "");
  }

  return lines.filter(Boolean).join("\n");
}

export function downloadSession(session: ResearchSession): void {
  const markdown = exportSessionMarkdown(session);
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  saveAs(blob, `solid-${session.id.slice(0, 8)}.md`);
}
