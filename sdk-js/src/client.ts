import { DottleConfig, SpanData, SessionOptions } from "./types";
import { maybeRedact } from "./redaction";

interface BufferedSpan { sessionId: string; span: SpanData }

export class DottleClient {
  private config: Required<DottleConfig>;
  private buffer: BufferedSpan[] = [];
  private currentSessionId: string | null = null;
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: DottleConfig) {
    this.config = {
      debug: false,
      disabled: false,
      flushIntervalMs: 2000,
      maxBatchSize: 100,
      timeoutMs: 5000,
      redactPii: false,
      ...config,
    };

    if (!this.config.disabled) {
      this.flushTimer = setInterval(() => this.flush(), this.config.flushIntervalMs);
      if (typeof this.flushTimer === "object" && "unref" in this.flushTimer) {
        (this.flushTimer as NodeJS.Timeout).unref();
      }
    }
  }

  // ── Session lifecycle ───────────────────────────────────────────────────────

  async startSession(agentName: string, options: SessionOptions = {}): Promise<string> {
    if (this.config.disabled) {
      const id = options.sessionId ?? crypto.randomUUID();
      this.currentSessionId = id;
      return id;
    }

    const body = {
      agent_name: agentName,
      session_id: options.sessionId ?? null,
      external_id: options.externalId ?? null,
      started_at: new Date().toISOString(),
      metadata: options.metadata ?? {},
      user_id: options.userId ?? null,
      user_email: options.userEmail ?? null,
      tags: options.tags ?? [],
      agent_version: options.agentVersion ?? null,
    };

    const res = await this._post("/ingest/session/start", body);
    const sid = res.session_id as string;
    this.currentSessionId = sid;
    return sid;
  }

  async endSession(
    sessionId: string,
    options: {
      status?: "completed" | "failed" | "looping";
      errorMessage?: string;
      errorType?: string;
      loopDetected?: boolean;
      loopReason?: string;
      iterationCount?: number;
    } = {},
  ): Promise<void> {
    await this.flush(sessionId);
    if (this.config.disabled) return;

    await this._post("/ingest/session/end", {
      session_id: sessionId,
      status: options.status ?? "completed",
      ended_at: new Date().toISOString(),
      error_message: options.errorMessage ?? null,
      error_type: options.errorType ?? null,
      loop_detected: options.loopDetected ?? false,
      loop_reason: options.loopReason ?? null,
      iteration_count: options.iterationCount ?? 0,
    });
  }

  // ── Span buffering ──────────────────────────────────────────────────────────

  addSpan(span: SpanData, sessionId?: string): void {
    if (this.config.disabled) return;
    const sid = sessionId ?? this.currentSessionId ?? "";
    if (!sid) return;
    this.buffer.push({ sessionId: sid, span });
  }

  // ── Flush ───────────────────────────────────────────────────────────────────

  async flush(sessionId?: string): Promise<void> {
    if (this.buffer.length === 0) return;

    // Group spans by sessionId
    const groups = new Map<string, SpanData[]>();
    const remaining: BufferedSpan[] = [];

    for (const item of this.buffer) {
      if (!sessionId || item.sessionId === sessionId) {
        const arr = groups.get(item.sessionId) ?? [];
        arr.push(item.span);
        groups.set(item.sessionId, arr);
      } else {
        remaining.push(item);
      }
    }
    this.buffer = remaining;

    for (const [sid, spans] of groups) {
      const chunks: SpanData[][] = [];
      for (let i = 0; i < spans.length; i += this.config.maxBatchSize) {
        chunks.push(spans.slice(i, i + this.config.maxBatchSize));
      }

      for (const chunk of chunks) {
        try {
          await this._post("/ingest/spans", {
            session_id: sid,
            spans: chunk.map((s) => ({
              span_id: s.spanId,
              parent_span_id: s.parentSpanId ?? null,
              span_type: s.spanType,
              name: s.name,
              status: s.status,
              started_at: s.startedAt,
              ended_at: s.endedAt,
              duration_ms: s.durationMs,
              model: s.model ?? null,
              input_tokens: s.inputTokens ?? null,
              output_tokens: s.outputTokens ?? null,
              input_text: maybeRedact(s.inputText, this.config.redactPii ?? false) ?? null,
              output_text: maybeRedact(s.outputText, this.config.redactPii ?? false) ?? null,
              error_message: s.errorMessage ?? null,
              error_type: s.errorType ?? null,
              attributes: s.attributes,
            })),
          });
          if (this.config.debug) {
            console.log(`[dottle] Flushed ${chunk.length} spans for session ${sid}`);
          }
        } catch (err) {
          console.warn("[dottle] Flush failed (spans dropped):", err);
        }
      }
    }
  }

  shutdown(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  // ── HTTP ────────────────────────────────────────────────────────────────────

  async _post(path: string, data: unknown): Promise<Record<string, unknown>> {
    const url = this.config.apiUrl.replace(/\/$/, "") + path;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.config.apiKey,
        },
        body: JSON.stringify(data),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Dottle API ${res.status}: ${text}`);
      }

      return res.json() as Promise<Record<string, unknown>>;
    } finally {
      clearTimeout(timer);
    }
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────────

let _client: DottleClient | null = null;

export function getClient(): DottleClient {
  if (!_client) throw new Error("Call dottle.configure() before using the SDK");
  return _client;
}

export function initClient(config: DottleConfig): DottleClient {
  _client?.shutdown();
  _client = new DottleClient(config);
  return _client;
}
