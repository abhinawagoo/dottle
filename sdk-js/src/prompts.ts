/**
 * Prompt management — fetch and use prompts from the Dottle dashboard.
 *
 * Changes made in the UI take effect after the cache TTL — no redeploy needed.
 *
 * Usage:
 *   import dottle from "dottle-sdk";
 *
 *   dottle.configure({ apiKey: "dtl_live_...", projectId: "<uuid>" });
 *
 *   // Fetch active version (cached 60 s by default)
 *   const prompt = await dottle.getPrompt("summarize-article");
 *
 *   // Compile {{variable}} placeholders
 *   const messages = prompt.compile({ article: text, language: "English" });
 *
 *   // Pass to any LLM client
 *   const res = await openai.chat.completions.create({
 *     model: prompt.model,
 *     messages,
 *     ...prompt.parameters,
 *   });
 *
 *   // Or let Dottle call the model (auto-tracked as a span inside a session)
 *   const result = await prompt.invoke({ article: text, language: "English" });
 *
 *   // Version pinning
 *   const prod = await dottle.getPrompt("summarize-article", { label: "production" });
 *   const v3   = await dottle.getPrompt("summarize-article", { version: 3 });
 */

import { getClient } from "./client";
import { getCurrentStore } from "./span";
import { runSpan } from "./span";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface PromptMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GetPromptOptions {
  /** Project ID — overrides configure({ projectId }) */
  projectId?: string;
  /** Pin to a specific version number. Pinned fetches are never cached. */
  version?: number;
  /** Pin to a named label (e.g. "production"). Pinned fetches are never cached. */
  label?: string;
  /** Cache TTL in seconds. Default 60. Pass 0 to bypass cache. */
  ttl?: number;
}

// ── In-process cache ───────────────────────────────────────────────────────────

interface CacheEntry { fetchedAt: number; handle: PromptHandle }
const _cache = new Map<string, CacheEntry>();

/** Remove all cached prompts (useful in tests). */
export function clearPromptCache(): void {
  _cache.clear();
}

// ── Variable substitution ──────────────────────────────────────────────────────

const VARIABLE_RE = /\{\{(\w+)\}\}/g;

function substituteVars(text: string, vars: Record<string, string>): string {
  return text.replace(VARIABLE_RE, (_, key) => vars[key] ?? `{{${key}}}`);
}

// ── PromptHandle ───────────────────────────────────────────────────────────────

export class PromptHandle {
  readonly id: string;
  readonly name: string;
  readonly version: number;
  readonly label: string | null;
  /** Model stored on the prompt (e.g. "gpt-4o", "claude-sonnet-4-6") */
  readonly model: string;
  /** LLM parameters (temperature, max_tokens, …) */
  readonly parameters: Record<string, unknown>;
  /** OpenAI-format tool definitions */
  readonly tools: object[];
  /** Detected {{variable}} names */
  readonly variables: string[];
  /** Uncompiled messages — use .compile() to fill variables */
  readonly messages: PromptMessage[];

  /** @internal */
  private _apiUrl: string;
  /** @internal */
  private _apiKey: string;

  constructor(data: Record<string, unknown>, apiUrl: string, apiKey: string) {
    this.id        = data["id"]      as string;
    this.name      = data["name"]    as string;
    this.version   = data["version"] as number;
    this.label     = (data["label"]  as string | null) ?? null;
    this.model     = (data["model"]  as string) || "gpt-4o";
    this.parameters = (data["parameters"] as Record<string, unknown>) ?? {};
    this.tools     = (data["tools"]  as object[]) ?? [];
    this.variables = (data["variables"] as string[]) ?? [];
    this.messages  = (data["messages"] as PromptMessage[]) ?? [];
    this._apiUrl   = apiUrl;
    this._apiKey   = apiKey;
  }

  /**
   * Substitute {{variables}} and return messages ready for any LLM API.
   *
   * @example
   *   const messages = prompt.compile({ article: text, language: "English" });
   *   // → [{ role: "system", content: "..." }, { role: "user", content: "..." }]
   */
  compile(variables: Record<string, string> = {}): PromptMessage[] {
    return this.messages.map(m => ({
      role: m.role,
      content: substituteVars(m.content, variables),
    }));
  }

  /**
   * Compile variables and call the configured model. Returns the response text.
   *
   * Automatically routes to the right provider:
   *   gpt-* / o1 / o3 / o4 → openai  (npm install openai)
   *   claude-*              → @anthropic-ai/sdk
   *
   * If called inside a dottle.session(), the call is automatically recorded
   * as an LLM span with prompt name, version, token counts, and cost.
   *
   * @example
   *   const result = await prompt.invoke({ article: text });
   */
  async invoke(variables: Record<string, string> = {}): Promise<string> {
    const store = getCurrentStore();

    if (store) {
      return this._invokeWithSpan(variables);
    }
    return this._callProvider(variables);
  }

  private async _invokeWithSpan(variables: Record<string, string>): Promise<string> {
    const client = getClient();
    const spanName = `${this.name} v${this.version}`;

    return runSpan(client, "llm", spanName, async (s) => {
      s.setAttribute("prompt_name", this.name);
      s.setAttribute("prompt_version", this.version);
      if (this.label) s.setAttribute("prompt_label", this.label);

      const messages = this.compile(variables);
      const userMsg = messages.find(m => m.role === "user")?.content ?? "";
      const sysMsg  = messages.find(m => m.role === "system")?.content ?? "";

      const { text, inputTokens, outputTokens } = await this._callProviderWithUsage(messages);

      s.recordTokens(inputTokens, outputTokens, this.model);
      s.recordPrompt(sysMsg ? `${sysMsg}\n${userMsg}` : userMsg, text);

      return text;
    });
  }

  private async _callProvider(variables: Record<string, string>): Promise<string> {
    const messages = this.compile(variables);
    const { text } = await this._callProviderWithUsage(messages);
    return text;
  }

  private async _callProviderWithUsage(
    messages: PromptMessage[],
  ): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
    const model = this.model;
    if (model.startsWith("gpt-") || /^o[134]/.test(model)) {
      return this._invokeOpenAI(messages);
    }
    if (model.startsWith("claude-")) {
      return this._invokeAnthropic(messages);
    }
    throw new Error(
      `Cannot auto-detect provider for model '${model}'. ` +
      "Use .compile() and call your LLM client directly."
    );
  }

  private async _invokeOpenAI(
    messages: PromptMessage[],
  ): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let openaiMod: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      openaiMod = require("openai");
    } catch {
      throw new Error("npm install openai");
    }
    const OpenAI = openaiMod.default ?? openaiMod.OpenAI;
    const client = new OpenAI();
    const params: Record<string, unknown> = { model: this.model, messages, ...this.parameters };
    if (this.tools?.length) params["tools"] = this.tools;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resp: any = await client.chat.completions.create(params);
    const msg = resp.choices[0].message;
    const inputTokens  = resp.usage?.prompt_tokens     ?? 0;
    const outputTokens = resp.usage?.completion_tokens ?? 0;

    if (msg.content) return { text: msg.content, inputTokens, outputTokens };
    if (msg.tool_calls?.length) {
      throw new Error(
        "The model responded with a tool call instead of text. " +
        "Use .compile() and call the LLM directly to handle tool call loops."
      );
    }
    return { text: "", inputTokens, outputTokens };
  }

  private async _invokeAnthropic(
    messages: PromptMessage[],
  ): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let anthropicMod: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      anthropicMod = require("@anthropic-ai/sdk");
    } catch {
      throw new Error("npm install @anthropic-ai/sdk");
    }
    const Anthropic = anthropicMod.default ?? anthropicMod.Anthropic;
    const client = new Anthropic();
    const system = messages.find(m => m.role === "system")?.content;
    const userMsgs = messages.filter(m => m.role !== "system");
    const { max_tokens, ...rest } = this.parameters as Record<string, unknown>;

    const params: Record<string, unknown> = {
      model: this.model,
      messages: userMsgs,
      max_tokens: (max_tokens as number | undefined) ?? 1024,
      ...rest,
    };
    if (system) params["system"] = system;
    if (this.tools?.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      params["tools"] = (this.tools as any[]).map((t: any) => ({
        name: t.function.name,
        description: t.function.description ?? "",
        input_schema: t.function.parameters ?? {},
      }));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resp: any = await client.messages.create(params);
    const inputTokens  = resp.usage?.input_tokens  ?? 0;
    const outputTokens = resp.usage?.output_tokens ?? 0;
    const block = resp.content[0];
    if (block.type === "text") return { text: block.text, inputTokens, outputTokens };
    throw new Error(
      `The model responded with a '${block.type}' block instead of text. ` +
      "Use .compile() and call the LLM directly to handle tool call loops."
    );
  }

  toString(): string {
    return `PromptHandle(name=${this.name}, v${this.version}, model=${this.model})`;
  }
}

// ── getPrompt ──────────────────────────────────────────────────────────────────

/**
 * Fetch a prompt from Dottle by name.
 *
 * Returns the active version by default. Changes made in the dashboard are
 * reflected after the cache TTL (default 60 s).
 *
 * @example
 *   const prompt = await dottle.getPrompt("summarize-article");
 *   const result = await prompt.invoke({ article: text });
 */
export async function getPrompt(
  name: string,
  options: GetPromptOptions = {},
): Promise<PromptHandle> {
  const client = getClient();
  const cfg = client.getConfig();

  const projectId = options.projectId ?? cfg.projectId;
  if (!projectId) {
    throw new Error(
      "projectId is required. Pass it to getPrompt() or set DOTTLE_PROJECT_ID env var " +
      "or call dottle.configure({ projectId: '...' })"
    );
  }

  const { version, label, ttl = 60 } = options;
  const isPinned = version !== undefined || label !== undefined;
  const useCache = ttl > 0 && !isPinned;
  const cacheKey = `${projectId}:${name}`;

  if (useCache) {
    const entry = _cache.get(cacheKey);
    if (entry && (Date.now() - entry.fetchedAt) / 1000 < ttl) {
      return entry.handle;
    }
  }

  const url = new URL(`${cfg.apiUrl.replace(/\/$/, "")}/prompts/${encodeURIComponent(name)}`);
  url.searchParams.set("project_id", projectId);
  if (version !== undefined) url.searchParams.set("version", String(version));
  if (label    !== undefined) url.searchParams.set("label", label);

  const resp = await fetch(url.toString(), {
    headers: { "X-API-Key": cfg.apiKey },
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    if (resp.status === 404) throw new Error(`Prompt '${name}' not found in project ${projectId}`);
    if (resp.status === 401) throw new Error("Invalid API key — check DOTTLE_API_KEY");
    throw new Error(`Dottle API error ${resp.status}: ${body}`);
  }

  const data = await resp.json() as Record<string, unknown>;
  const handle = new PromptHandle(data, cfg.apiUrl, cfg.apiKey);

  if (useCache) {
    _cache.set(cacheKey, { fetchedAt: Date.now(), handle });
  }

  return handle;
}
