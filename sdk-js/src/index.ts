/**
 * Agentloop SDK for JavaScript / TypeScript
 *
 * Quick start (manual instrumentation):
 *   import agentloop from "agentloop";
 *
 *   agentloop.configure({ apiKey: "alp_live_...", apiUrl: "https://api.agentloop.dev/api/v1" });
 *
 *   await agentloop.session("my-agent", async () => {
 *     await agentloop.span("llm", "gpt-4o call", async (s) => {
 *       const res = await openai.chat.completions.create({ ... });
 *       s.recordTokens(res.usage.prompt_tokens, res.usage.completion_tokens, "gpt-4o");
 *     });
 *   }, { userEmail: "alice@example.com", tags: ["prod"] });
 *
 * Zero-friction (auto-instrument):
 *   const openai = agentloop.wrapOpenAI(new OpenAI({ apiKey: "..." }));
 *   // All chat.completions.create calls are now automatically traced
 */

import { AgentloopConfig, SpanType, SessionOptions } from "./types";
import { AgentloopClient, getClient, initClient } from "./client";
import { SpanContext, runSpan, runWithStore, getCurrentStore } from "./span";
import { wrapOpenAI, wrapAnthropic } from "./wrappers";

export { AgentloopConfig, SpanType, SpanContext, SessionOptions };
export { wrapOpenAI, wrapAnthropic };

// ── configure ──────────────────────────────────────────────────────────────────

function configure(config: AgentloopConfig): void {
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

const agentloop = {
  configure,
  session,
  span,
  wrapLlm,
  wrapTool,
  wrapOpenAI,
  wrapAnthropic,
  shutdown,
  getCurrentSessionId,
};

export default agentloop;
export { configure, session, span, wrapLlm, wrapTool, shutdown, getCurrentSessionId };
