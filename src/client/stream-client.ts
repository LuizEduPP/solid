import { createParser } from "eventsource-parser";

import i18n from "./i18n";
import { MODE_THRESHOLDS } from "../shared/thresholds";
import type { WebSettings } from "./settings";

export async function streamResearch(
  settings: WebSettings,
  objective: string,
  onChunk: (chunk: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const response = await fetch("/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      model: "solid",
      stream: true,
      target_score: MODE_THRESHOLDS[settings.mode].targetScore,
      research_mode: settings.mode,
      llm_api_key: settings.apiKey,
      llm_base_url: settings.baseUrl,
      llm_model: settings.model,
      messages: [{ role: "user", content: objective }],
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message =
      payload?.error?.fieldErrors?.llm_api_key?.[0] ??
      (typeof payload?.error === "string" ? payload.error : null) ??
      i18n.t("errorRequestFailed", { status: response.status });
    throw new Error(message);
  }

  if (!response.body) {
    throw new Error(i18n.t("errorStreaming"));
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = createParser({
    onEvent: (event) => {
      const data = event.data.trim();
      if (!data || data === "[DONE]") return;

      const payload = JSON.parse(data) as {
        choices?: Array<{ delta?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.delta?.content;
      if (content) onChunk(content);
    },
  });

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    parser.feed(decoder.decode(value, { stream: true }));
  }

  const tail = decoder.decode();
  if (tail) parser.feed(tail);
}
