import type { Translator } from "./i18n/index.js";
import type { ResearchSession } from "./history";

export function exportSessionMarkdown(
  session: ResearchSession,
  tr: Translator,
): string {
  const { t } = tr;
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

export function downloadSession(session: ResearchSession, tr: Translator): void {
  const markdown = exportSessionMarkdown(session, tr);
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `solid-${session.id.slice(0, 8)}.md`;
  anchor.click();
  URL.revokeObjectURL(url);
}
