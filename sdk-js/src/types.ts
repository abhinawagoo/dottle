export interface DottleConfig {
  /** API key from your Dottle project settings */
  apiKey: string;
  /** Backend URL — defaults to https://dottle-production.up.railway.app/api/v1 */
  apiUrl?: string;
  /** Project ID — required for prompt management (DOTTLE_PROJECT_ID env var) */
  projectId?: string;
  /** Log flush confirmations to console (default: false) */
  debug?: boolean;
  /** No-op mode — useful in tests (default: false) */
  disabled?: boolean;
  /** How often to flush buffered spans in ms (default: 2000) */
  flushIntervalMs?: number;
  /** Max spans per HTTP request (default: 100) */
  maxBatchSize?: number;
  /** HTTP request timeout in ms (default: 5000) */
  timeoutMs?: number;
  /** Scrub emails, phones, card numbers from prompt/response text before sending (default: false) */
  redactPii?: boolean;
}

/** Span types — controls the colour in the trace timeline */
export type SpanType = "llm" | "tool" | "retrieval" | "agent" | "custom";

export interface SpanData {
  spanId: string;
  parentSpanId: string | null;
  spanType: SpanType;
  name: string;
  status: "ok" | "error";
  startedAt: string;   // ISO 8601
  endedAt: string;     // ISO 8601
  durationMs: number;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  inputText?: string;
  outputText?: string;
  errorMessage?: string;
  errorType?: string;
  attributes: Record<string, unknown>;
}

export interface SessionOptions {
  sessionId?: string;
  externalId?: string;
  metadata?: Record<string, unknown>;
  /** User ID for attribution */
  userId?: string;
  /** User email for attribution */
  userEmail?: string;
  /** Tags e.g. ["prod", "v2", "customer:acme"] */
  tags?: string[];
  /** Agent version e.g. "1.0.0" */
  agentVersion?: string;
  /** Git branch name — shown in session detail (e.g. "main", "feat/my-branch") */
  gitBranch?: string;
  /** Full git commit SHA — linked to GitHub/GitLab if gitRemote is set */
  gitSha?: string;
  /** Git remote URL — used to construct commit links (e.g. "https://github.com/owner/repo") */
  gitRemote?: string;
}

/** Shape stored in AsyncLocalStorage per async context */
export interface SessionStore {
  sessionId: string;
  spanStack: string[];
}
