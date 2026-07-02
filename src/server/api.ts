import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";

import { SolidAgent, extractObjective } from "./agent/loop.js";
import { MODE_THRESHOLDS } from "../shared.js";
import { AGENT_DEFAULTS, type AgentConfig } from "./config.js";

const messageSchema = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.union([z.string(), z.array(z.record(z.string(), z.unknown())), z.null()]).optional(),
});

const requestSchema = z.object({
  model: z.string().default("solid"),
  messages: z.array(messageSchema).min(1),
  stream: z.boolean().default(false),
  temperature: z.number().optional(),
  target_score: z.number().min(0.01).max(100).optional(),
  min_score: z.number().min(0.01).max(100).optional(),
  research_mode: z.enum(["rigorous", "fast"]).optional(),
  llm_api_key: z.string().optional().default(""),
  llm_base_url: z.string().min(1).optional(),
  llm_model: z.string().min(1).optional(),
});

type AppEnv = {
  Variables: Record<string, never>;
};

function messageContent(
  content: string | Array<Record<string, unknown>> | null | undefined,
): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((part) => part.type === "text")
      .map((part) => String(part.text ?? ""))
      .join("\n");
  }
  return "";
}

function resolveMode(body: z.infer<typeof requestSchema>) {
  return body.research_mode ?? AGENT_DEFAULTS.mode;
}

function buildAgentConfig(body: z.infer<typeof requestSchema>): AgentConfig {
  const mode = resolveMode(body);
  return {
    openaiApiKey: body.llm_api_key,
    openaiBaseUrl: body.llm_base_url ?? AGENT_DEFAULTS.openaiBaseUrl,
    model: body.llm_model ?? AGENT_DEFAULTS.model,
    minScore: body.min_score ?? AGENT_DEFAULTS.minScore,
    resultsPerQuery: AGENT_DEFAULTS.resultsPerQuery,
    mode,
    pagesPerIteration: AGENT_DEFAULTS.pagesPerIteration,
  };
}

function resolveTargetScore(body: z.infer<typeof requestSchema>): number {
  const mode = resolveMode(body);
  const modeDefault = MODE_THRESHOLDS[mode].targetScore;
  return body.target_score ?? modeDefault;
}

function completionId(): string {
  return `chatcmpl-${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

const llmModelsSchema = z.object({
  llm_api_key: z.string().optional().default(""),
  llm_base_url: z.string().min(1),
});

async function fetchProviderModels(
  apiKey: string,
  baseUrl: string,
): Promise<string[]> {
  const root = baseUrl.replace(/\/+$/, "");
  const headers: Record<string, string> = {};
  if (apiKey.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`;
  }

  const response = await fetch(`${root}/models`, { headers });
  if (!response.ok) {
    throw new Error(`Provider returned ${response.status}`);
  }

  const payload = (await response.json()) as {
    data?: Array<{ id?: string }>;
  };

  return (payload.data ?? [])
    .map((entry) => entry.id?.trim())
    .filter((id): id is string => Boolean(id));
}

export function createOpenAiRouter(): Hono<AppEnv> {
  const router = new Hono<AppEnv>();

  router.post("/llm/models", async (c) => {
    const parsed = llmModelsSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    try {
      const models = await fetchProviderModels(
        parsed.data.llm_api_key,
        parsed.data.llm_base_url,
      );
      return c.json({ models });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to fetch models";
      return c.json({ error: message }, 502);
    }
  });

  router.get("/models", (c) =>
    c.json({
      object: "list",
      data: [
        {
          id: "solid",
          object: "model",
          owned_by: "solid",
        },
      ],
    }),
  );

  router.post("/chat/completions", async (c) => {
    const parsed = requestSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const body = parsed.data;
    const targetScore = resolveTargetScore(body);
    const agentConfig = buildAgentConfig(body);

    const messages = body.messages.map((message) => ({
      role: message.role,
      content: messageContent(message.content),
    }));

    let objective: string;
    try {
      objective = extractObjective(messages);
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Invalid messages" },
        400,
      );
    }

    const agent = new SolidAgent(agentConfig);
    const id = completionId();
    const created = Math.floor(Date.now() / 1000);
    const model = body.model || "solid";

    if (body.stream) {
      return streamSSE(c, async (stream) => {
        let roleSent = false;

        try {
          for await (const chunk of agent.run(objective, targetScore)) {
            const delta: Record<string, string> = { content: chunk };
            if (!roleSent) {
              delta.role = "assistant";
              roleSent = true;
            }

            await stream.writeSSE({
              data: JSON.stringify({
                id,
                object: "chat.completion.chunk",
                created,
                model,
                choices: [{ index: 0, delta }],
              }),
            });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Agent failed";
          await stream.writeSSE({
            data: JSON.stringify({
              id,
              object: "chat.completion.chunk",
              created,
              model,
              choices: [
                {
                  index: 0,
                  delta: { content: `\n\n❌ Error: ${message}\n` },
                },
              ],
            }),
          });
        }

        await stream.writeSSE({
          data: JSON.stringify({
            id,
            object: "chat.completion.chunk",
            created,
            model,
            choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
          }),
        });
        await stream.writeSSE({ data: "[DONE]" });
      });
    }

    const parts: string[] = [];
    for await (const chunk of agent.run(objective, targetScore)) {
      parts.push(chunk);
    }

    return c.json({
      id,
      object: "chat.completion",
      created,
      model,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: parts.join("") },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    });
  });

  return router;
}
