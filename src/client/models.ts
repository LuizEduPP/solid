import type { WebSettings } from "./settings";

export async function fetchLlmModels(settings: WebSettings): Promise<string[]> {
  const response = await fetch("/v1/llm/models", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      llm_api_key: settings.apiKey,
      llm_base_url: settings.baseUrl,
    }),
  });

  const payload = (await response.json().catch(() => null)) as {
    models?: string[];
    error?: string;
  } | null;

  if (!response.ok) {
    throw new Error(
      typeof payload?.error === "string"
        ? payload.error
        : `Falha ao listar modelos (${response.status})`,
    );
  }

  return Array.isArray(payload?.models) ? payload.models : [];
}

export function pickDefaultModel(
  models: string[],
  current: string,
): string {
  if (current && models.includes(current)) return current;
  if (models.length === 0) return current;

  const preferred = models.find((id) =>
    /gemma-4-e4b|gemma.*4b/i.test(id),
  );
  return preferred ?? models[0]!;
}
