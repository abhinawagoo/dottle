import { SpanData, SpanType, SessionStore } from "./types";
import { DottleClient } from "./client";

// ── AsyncLocalStorage context ──────────────────────────────────────────────────

type Storage = { run<T>(store: SessionStore, fn: () => T): T; getStore(): SessionStore | undefined };
let _storage: Storage;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { AsyncLocalStorage } = require("async_hooks") as typeof import("async_hooks");
  _storage = new AsyncLocalStorage<SessionStore>() as unknown as Storage;
} catch {
  let _globalStore: SessionStore | undefined;
  _storage = {
    run<T>(store: SessionStore, fn: () => T): T {
      const prev = _globalStore;
      _globalStore = store;
      try { return fn(); } finally { _globalStore = prev; }
    },
    getStore(): SessionStore | undefined { return _globalStore; },
  };
}

export function getCurrentStore(): SessionStore | undefined {
  return _storage.getStore();
}

export function runWithStore<T>(store: SessionStore, fn: () => T): T {
  return _storage.run(store, fn);
}

// ── SpanContext ────────────────────────────────────────────────────────────────

export class SpanContext {
  readonly spanId: string;
  readonly spanType: SpanType;
  readonly name: string;
  readonly parentSpanId: string | null;
  private startedAt: Date;
  private model?: string;
  private inputTokens?: number;
  private outputTokens?: number;
  private inputText?: string;
  private outputText?: string;
  private status: "ok" | "error" = "ok";
  private errorMessage?: string;
  private errorType?: string;
  private attributes: Record<string, unknown> = {};

  constructor(spanId: string, spanType: SpanType, name: string, parentSpanId: string | null) {
    this.spanId = spanId;
    this.spanType = spanType;
    this.name = name;
    this.parentSpanId = parentSpanId;
    this.startedAt = new Date();
  }

  /** Record LLM token usage */
  recordTokens(input: number, output: number, model: string): this {
    this.inputTokens = input;
    this.outputTokens = output;
    this.model = model;
    return this;
  }

  /** Capture the prompt and response text (LLM spans) */
  recordPrompt(inputText: string, outputText: string): this {
    this.inputText = inputText;
    this.outputText = outputText;
    return this;
  }

  /** Mark span as failed */
  setError(message: string, errorType?: string): this {
    this.status = "error";
    this.errorMessage = message;
    this.errorType = errorType;
    return this;
  }

  /** Alias for setError — both names work */
  recordError(message: string, errorType?: string): this {
    return this.setError(message, errorType);
  }

  /** Attach arbitrary metadata */
  setAttribute(key: string, value: unknown): this {
    this.attributes[key] = value;
    return this;
  }

  _toData(): SpanData {
    const endedAt = new Date();
    return {
      spanId: this.spanId,
      parentSpanId: this.parentSpanId,
      spanType: this.spanType,
      name: this.name,
      status: this.status,
      startedAt: this.startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      durationMs: endedAt.getTime() - this.startedAt.getTime(),
      model: this.model,
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      inputText: this.inputText,
      outputText: this.outputText,
      errorMessage: this.errorMessage,
      errorType: this.errorType,
      attributes: this.attributes,
    };
  }
}

// ── runSpan ────────────────────────────────────────────────────────────────────

export async function runSpan<T>(
  client: DottleClient,
  spanType: SpanType,
  name: string,
  fn: (span: SpanContext) => Promise<T>,
): Promise<T> {
  const store = getCurrentStore();
  const parentStack = store?.spanStack ?? [];
  const sessionId = store?.sessionId ?? "";
  const parentId = parentStack[parentStack.length - 1] ?? null;
  const spanId = crypto.randomUUID();
  const ctx = new SpanContext(spanId, spanType, name, parentId);

  const newStore: SessionStore = { sessionId, spanStack: [...parentStack, spanId] };

  return runWithStore(newStore, async () => {
    try {
      return await fn(ctx);
    } catch (err) {
      const e = err as Error;
      ctx.setError(e.message, e.constructor?.name ?? "Error");
      throw err;
    } finally {
      client.addSpan(ctx._toData(), sessionId || undefined);
    }
  });
}
