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
  __dottle_wrapped?: boolean;
}

/**
 * Wrap an OpenAI client instance. All `chat.completions.create` calls inside
 * an dottle session are automatically traced.
 *
 * @example
 * import OpenAI from "openai";
 * import dottle, { wrapOpenAI } from "dottle";
 *
 * const openai = wrapOpenAI(new OpenAI({ apiKey: process.env.OPENAI_API_KEY }));
 *
 * await dottle.session("my-agent", async () => {
 *   const res = await openai.chat.completions.create({ model: "gpt-4o", messages: [...] });
 * });
 */
export function wrapOpenAI<T extends OpenAILike>(client: T): T {
  if (client.__dottle_wrapped) return client;

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

  client.__dottle_wrapped = true;
  return client;
}

// ── Groq SDK wrapper (OpenAI-compatible) ──────────────────────────────────────

/**
 * Wrap a Groq client instance. Groq's SDK is OpenAI-compatible, so this
 * works identically to wrapOpenAI.
 *
 * @example
 * import Groq from "groq-sdk";
 * import dottle, { wrapGroq } from "dottle-sdk";
 *
 * const groq = wrapGroq(new Groq({ apiKey: process.env.GROQ_API_KEY }));
 *
 * await dottle.session("my-agent", async () => {
 *   const res = await groq.chat.completions.create({ model: "llama-3.3-70b-versatile", messages: [...] });
 * });
 */
export function wrapGroq<T extends OpenAILike>(client: T): T {
  return wrapOpenAI(client);
}

// ── Anthropic Node SDK wrapper ─────────────────────────────────────────────────

interface AnthropicLike {
  messages: {
    create: (...args: unknown[]) => Promise<unknown>;
  };
  __dottle_wrapped?: boolean;
}

/**
 * Wrap an Anthropic client instance. All `messages.create` calls inside
 * an dottle session are automatically traced.
 *
 * @example
 * import Anthropic from "@anthropic-ai/sdk";
 * import dottle, { wrapAnthropic } from "dottle";
 *
 * const anthropic = wrapAnthropic(new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }));
 *
 * await dottle.session("my-agent", async () => {
 *   const msg = await anthropic.messages.create({ model: "claude-opus-4-6", ... });
 * });
 */
export function wrapAnthropic<T extends AnthropicLike>(client: T): T {
  if (client.__dottle_wrapped) return client;

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

  client.__dottle_wrapped = true;
  return client;
}

// ── Google Gemini SDK wrapper ──────────────────────────────────────────────────

interface GeminiModelLike {
  generateContent: (...args: unknown[]) => Promise<unknown>;
  __dottle_wrapped?: boolean;
}

interface GeminiClientLike {
  getGenerativeModel: (params: { model: string; [key: string]: unknown }) => GeminiModelLike;
  __dottle_wrapped?: boolean;
}

/**
 * Wrap a Google Generative AI client. Patches `getGenerativeModel` so every
 * model returned automatically traces `generateContent` calls.
 *
 * @example
 * import { GoogleGenerativeAI } from "@google/generative-ai";
 * import dottle, { wrapGemini } from "dottle-sdk";
 *
 * const genAI = wrapGemini(new GoogleGenerativeAI(process.env.GEMINI_API_KEY!));
 *
 * await dottle.session("my-agent", async () => {
 *   const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
 *   const result = await model.generateContent("Hello!");
 *   console.log(result.response.text());
 * });
 */
export function wrapGemini<T extends GeminiClientLike>(client: T): T {
  if (client.__dottle_wrapped) return client;

  const originalGetModel = client.getGenerativeModel.bind(client);

  (client as GeminiClientLike).getGenerativeModel = (params: { model: string; [key: string]: unknown }) => {
    const model = originalGetModel(params);
    const modelId = params.model ?? "gemini";

    if (model.__dottle_wrapped) return model;

    const originalGenerate = model.generateContent.bind(model);

    model.generateContent = async (...args: unknown[]): Promise<unknown> => {
      const store = getCurrentStore();
      if (!store) return originalGenerate(...args);

      const sdkClient = getClient();

      return runSpan(sdkClient, "llm", modelId, async (s: SpanContext) => {
        const result = await originalGenerate(...args) as Record<string, unknown>;

        const response = result.response as Record<string, unknown> | undefined;
        const usage = response?.usageMetadata as Record<string, number> | undefined;
        if (usage) {
          s.recordTokens(
            usage.promptTokenCount ?? 0,
            usage.candidatesTokenCount ?? 0,
            modelId,
          );
        }

        const prompt = args[0];
        const inputText = typeof prompt === "string"
          ? prompt
          : Array.isArray(prompt)
            ? (prompt as Array<{ text?: string }>).map((p) => p.text ?? "").join("\n")
            : JSON.stringify(prompt);

        const responseText = typeof response?.text === "function"
          ? (response.text as () => string)()
          : undefined;

        if (inputText || responseText) {
          s.recordPrompt(inputText ?? "", responseText ?? "");
        }

        return result;
      });
    };

    model.__dottle_wrapped = true;
    return model;
  };

  client.__dottle_wrapped = true;
  return client;
}
