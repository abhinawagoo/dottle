/**
 * Zero-friction wrappers for popular LLM clients.
 * Drop-in replacements — just wrap the client once at startup.
 */
import { getCurrentStore } from "./span";
import { getClient } from "./client";
import { SpanContext } from "./span";
import { runSpan } from "./span";

// ── OpenAI Node SDK wrapper ────────────────────────────────────────────────────

interface OpenAILike {
  chat: {
    completions: {
      create: (...args: unknown[]) => Promise<unknown>;
    };
  };
  __agentloop_wrapped?: boolean;
}

/**
 * Wrap an OpenAI client instance. All `chat.completions.create` calls inside
 * an agentloop session are automatically traced.
 *
 * @example
 * import OpenAI from "openai";
 * import agentloop, { wrapOpenAI } from "agentloop";
 *
 * const openai = wrapOpenAI(new OpenAI({ apiKey: process.env.OPENAI_API_KEY }));
 *
 * await agentloop.session("my-agent", async () => {
 *   const res = await openai.chat.completions.create({ model: "gpt-4o", messages: [...] });
 * });
 */
export function wrapOpenAI<T extends OpenAILike>(client: T): T {
  if (client.__agentloop_wrapped) return client;

  const original = client.chat.completions.create.bind(client.chat.completions);

  (client.chat.completions as { create: (...args: unknown[]) => Promise<unknown> }).create =
    async (...args: unknown[]): Promise<unknown> => {
      const store = getCurrentStore();
      if (!store) return original(...args);

      const sdkClient = getClient();
      const params = args[0] as Record<string, unknown>;
      const model = (params.model as string) || "openai";

      return runSpan(sdkClient, "llm", `${model}`, async (s: SpanContext) => {
        const result = await original(...args) as Record<string, unknown>;

        // Record tokens
        const usage = result.usage as Record<string, number> | undefined;
        if (usage) {
          s.recordTokens(
            usage.prompt_tokens ?? 0,
            usage.completion_tokens ?? 0,
            model,
          );
        }

        // Record prompt/response
        const messages = params.messages as Array<{ role: string; content: unknown }> | undefined;
        const lastUser = messages?.filter((m) => m.role === "user").pop();
        const choices = result.choices as Array<{ message?: { content?: string } }> | undefined;
        const responseContent = choices?.[0]?.message?.content;

        if (lastUser && responseContent) {
          const inputText =
            typeof lastUser.content === "string"
              ? lastUser.content
              : JSON.stringify(lastUser.content);
          s.recordPrompt(inputText, responseContent);
        }

        return result;
      });
    };

  client.__agentloop_wrapped = true;
  return client;
}

// ── Anthropic Node SDK wrapper ─────────────────────────────────────────────────

interface AnthropicLike {
  messages: {
    create: (...args: unknown[]) => Promise<unknown>;
  };
  __agentloop_wrapped?: boolean;
}

/**
 * Wrap an Anthropic client instance. All `messages.create` calls inside
 * an agentloop session are automatically traced.
 *
 * @example
 * import Anthropic from "@anthropic-ai/sdk";
 * import agentloop, { wrapAnthropic } from "agentloop";
 *
 * const anthropic = wrapAnthropic(new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }));
 *
 * await agentloop.session("my-agent", async () => {
 *   const msg = await anthropic.messages.create({ model: "claude-opus-4-6", ... });
 * });
 */
export function wrapAnthropic<T extends AnthropicLike>(client: T): T {
  if (client.__agentloop_wrapped) return client;

  const original = client.messages.create.bind(client.messages);

  (client.messages as { create: (...args: unknown[]) => Promise<unknown> }).create =
    async (...args: unknown[]): Promise<unknown> => {
      const store = getCurrentStore();
      if (!store) return original(...args);

      const sdkClient = getClient();
      const params = args[0] as Record<string, unknown>;
      const model = (params.model as string) || "anthropic";

      return runSpan(sdkClient, "llm", `${model}`, async (s: SpanContext) => {
        const result = await original(...args) as Record<string, unknown>;

        // Record tokens
        const usage = result.usage as Record<string, number> | undefined;
        if (usage) {
          s.recordTokens(
            usage.input_tokens ?? 0,
            usage.output_tokens ?? 0,
            model,
          );
        }

        // Record prompt/response
        const messages = params.messages as Array<{ role: string; content: unknown }> | undefined;
        const lastUser = messages?.filter((m) => m.role === "user").pop();
        const content = result.content as Array<{ type: string; text?: string }> | undefined;
        const responseText = content?.find((b) => b.type === "text")?.text;

        if (lastUser && responseText) {
          const inputText =
            typeof lastUser.content === "string"
              ? lastUser.content
              : JSON.stringify(lastUser.content);
          s.recordPrompt(inputText, responseText);
        }

        return result;
      });
    };

  client.__agentloop_wrapped = true;
  return client;
}
