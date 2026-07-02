import { jsonrepair } from "jsonrepair";

function extractJsonText(raw: string): string {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence) return fence[1].trim();

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) return trimmed.slice(start, end + 1);

  return trimmed;
}

export function parseJsonPayload(raw: string): Record<string, unknown> {
  const repaired = jsonrepair(extractJsonText(raw));
  const parsed = JSON.parse(repaired) as unknown;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid JSON payload");
  }

  return parsed as Record<string, unknown>;
}
