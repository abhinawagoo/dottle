/**
 * Dottle SDK for JavaScript / TypeScript
 *
 * Quick start (manual instrumentation):
 *   import dottle from "dottle";
 *
 *   dottle.configure({ apiKey: "dtl_live_...", apiUrl: "https://api.dottle.dev/api/v1" });
 *
 *   await dottle.session("my-agent", async () => {
 *     await dottle.span("llm", "gpt-4o call", async (s) => {
 *       const res = await openai.chat.completions.create({ ... });
 *       s.recordTokens(res.usage.prompt_tokens, res.usage.completion_tokens, "gpt-4o");
 *     });
 *   }, { userEmail: "alice@example.com", tags: ["prod"] });
 *
 * Zero-friction (auto-instrument):
 *   const openai = dottle.wrapOpenAI(new OpenAI({ apiKey: "..." }));
 *   // All chat.completions.create calls are now automatically traced
 */

import { DottleConfig, SpanType, SessionOptions } from "./types";
import { DottleClient, getClient, initClient } from "./client";
import { SpanContext, runSpan, runWithStore, getCurrentStore } from "./span";
import { wrapOpenAI, wrapAnthropic, wrapGroq, wrapGemini } from "./wrappers";
import { getPrompt, clearPromptCache, PromptHandle, GetPromptOptions } from "./prompts";

export { DottleConfig, SpanType, SpanContext, SessionOptions };
export { wrapOpenAI, wrapAnthropic, wrapGroq, wrapGemini };
export { getPrompt, clearPromptCache, PromptHandle, GetPromptOptions };

// ── configure ──────────────────────────────────────────────────────────────────

function configure(config: DottleConfig): void {
  initClient(config);
}

// ── session ────────────────────────────────────────────────────────────────────

async function session<T>(
  agentName: string,
  fn: (sessionId: string) => Promise<T>,
  options: SessionOptions = {},
): Promise<T> {
  const client = getClient();
  const sid = await client.startSession(agentName, options);

  let status: "completed" | "failed" = "completed";
  let errorMessage: string | undefined;
  let errorType: string | undefined;

  return runWithStore({ sessionId: sid, spanStack: [] }, async () => {
    try {
      return await fn(sid);
    } catch (err) {
      status = "failed";
      const e = err as Error;
      errorMessage = e.message;
      errorType = e.constructor?.name ?? "Error";
      throw err;
    } finally {
      await client.endSession(sid, { status, errorMessage, errorType });
    }
  });
}

// ── span ───────────────────────────────────────────────────────────────────────

async function span<T>(
  spanType: SpanType,
  name: string,
  fn: (span: SpanContext) => Promise<T>,
): Promise<T> {
  return runSpan(getClient(), spanType, name, fn);
}

// ── wrapTool ──────────────────────────────────────────────────────────────────

function wrapTool<TArgs extends unknown[], TReturn>(
  toolName: string,
  fn: (...args: TArgs) => Promise<TReturn>,
): (...args: TArgs) => Promise<TReturn> {
  return async (...args: TArgs): Promise<TReturn> => {
    return span("tool", toolName, async () => fn(...args));
  };
}

// ── wrapLlm ───────────────────────────────────────────────────────────────────

function wrapLlm<TArgs extends unknown[], TReturn extends { inputTokens: number; outputTokens: number }>(
  model: string,
  fn: (...args: TArgs) => Promise<TReturn>,
): (...args: TArgs) => Promise<TReturn> {
  return async (...args: TArgs): Promise<TReturn> => {
    return span("llm", `${model} call`, async (s) => {
      const result = await fn(...args);
      s.recordTokens(result.inputTokens, result.outputTokens, model);
      return result;
    });
  };
}

// ── shutdown ──────────────────────────────────────────────────────────────────

async function shutdown(): Promise<void> {
  const client = getClient();
  await client.flush();
  client.shutdown();
}

// ── getCurrentSessionId ────────────────────────────────────────────────────────

function getCurrentSessionId(): string | undefined {
  return getCurrentStore()?.sessionId;
}

// ── default export ────────────────────────────────────────────────────────────

const dottle = {
  configure,
  session,
  span,
  wrapLlm,
  wrapTool,
  wrapOpenAI,
  wrapAnthropic,
  wrapGroq,
  wrapGemini,
  shutdown,
  getCurrentSessionId,
  // Prompt management
  getPrompt,
  clearPromptCache,
};

export default dottle;
export { configure, session, span, wrapLlm, wrapTool, shutdown, getCurrentSessionId };
