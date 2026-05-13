export type SessionStatus = "running" | "completed" | "failed" | "looping" | "timeout" | "timed_out";
export type SpanType = "llm" | "tool" | "retrieval" | "agent" | "custom";
export type SpanStatus = "ok" | "error" | "timeout";

export interface Project {
  id: string;
  name: string;
  description: string | null;
  api_key: string;
  created_at: string;
}

export interface Session {
  id: string;
  project_id: string;
  agent_name: string;
  external_id: string | null;
  status: SessionStatus;
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  total_cost_usd: number | null;
  total_tokens: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  iteration_count: number;
  loop_detected: boolean;
  loop_reason: string | null;
  error_message: string | null;
  error_type: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  user_id: string | null;
  user_email: string | null;
  tags: string[];
  agent_version: string | null;
  issue_count: number;
  quality_score: number | null;
}

export interface SemanticMonitor {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  pattern_prompt: string;
  threshold_pct: number;
  window_minutes: number;
  min_sessions: number;
  enabled: boolean;
  last_fired_at: string | null;
  created_at: string;
}

export interface MonitorEvent {
  id: string;
  semantic_monitor_id: string;
  match_pct: number;
  sessions_evaluated: number;
  sessions_matched: number;
  sample_session_ids: string | null;
  ai_summary: string | null;
  fired_at: string;
}

export interface Span {
  id: string;
  parent_span_id: string | null;
  span_type: SpanType;
  name: string;
  status: SpanStatus;
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
  input_text: string | null;
  output_text: string | null;
  error_message: string | null;
  error_type: string | null;
  attributes: Record<string, unknown>;
}

export type IssueSeverity = "critical" | "high" | "medium" | "low" | "info";

export interface SessionIssue {
  id: string;
  issue_type: string;
  severity: IssueSeverity;
  title: string;
  description: string;
  span_id: string | null;
  created_at: string;
}

export interface SessionDetail extends Session {
  spans: Span[];
  issues: SessionIssue[];
}

export interface SessionListResponse {
  total: number;
  page: number;
  page_size: number;
  items: Session[];
}

export interface MetricsSummary {
  total_sessions: number;
  total_cost_usd: number;
  avg_cost_per_session: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  loop_rate_pct: number;
  tool_failure_rate_pct: number;
  error_rate_pct: number;
  sessions_by_status: Record<string, number>;
  avg_quality_score: number | null;
  scored_session_count: number;
}

export interface CostBucket {
  bucket: string;
  cost_usd: number;
  session_count: number;
  token_count: number;
}

export interface CostOverTimeResponse {
  granularity: string;
  series: CostBucket[];
}

export interface QualityBucket {
  bucket: string;
  avg_quality: number;
  session_count: number;
}

export interface QualityOverTimeResponse {
  granularity: string;
  series: QualityBucket[];
}

export interface ToolFailureStat {
  tool_name: string;
  total: number;
  errors: number;
  failure_rate_pct: number;
  avg_duration_ms: number | null;
}

export interface ToolFailureRatesResponse {
  tools: ToolFailureStat[];
}

export interface AlertRule {
  id: string;
  project_id: string;
  name: string;
  metric: string;
  operator: string;
  threshold: number;
  window_minutes: number;
  channel: string;
  destination: string;
  enabled: boolean;
  created_at: string;
  last_fired_at: string | null;
}

// ── Issues Board ──────────────────────────────────────────────────────────────

export interface IssueGroup {
  issue_type: string;
  severity: IssueSeverity;
  title: string;
  occurrence_count: number;
  session_count: number;
  user_count: number;
  agent_names: string[];
  first_seen: string;
  last_seen: string;
  source: "instrumented" | "ai";
}

export interface IssuesBoardResponse {
  total_signals: number;
  groups: IssueGroup[];
}

export interface VersionSnapshot {
  label: string;
  session_count: number;
  failure_rate_pct: number;
  loop_rate_pct: number;
  avg_cost_usd: number;
  avg_latency_ms: number;
  avg_iterations: number;
  p95_latency_ms: number;
}

export interface RegressionDelta {
  failure_rate_pct: number;
  loop_rate_pct: number;
  avg_cost_usd: number;
  avg_latency_ms: number;
  avg_iterations: number;
}

export interface RegressionReport {
  baseline: VersionSnapshot;
  comparison: VersionSnapshot;
  delta: RegressionDelta;
  verdict: "improved" | "regressed" | "neutral";
}

// ── User Analytics ────────────────────────────────────────────────────────────

export interface UserStat {
  user_key: string;
  user_email: string | null;
  user_id: string | null;
  session_count: number;
  total_cost_usd: number;
  failure_rate_pct: number;
  loop_rate_pct: number;
  avg_latency_ms: number;
  last_seen: string | null;
}

export interface UserAnalyticsResponse {
  users: UserStat[];
  total: number;
}

// ── Agent breakdown ───────────────────────────────────────────────────────────

export interface AgentStat {
  agent_name: string;
  session_count: number;
  total_cost_usd: number;
  avg_cost_usd: number;
  avg_latency_ms: number;
  error_rate_pct: number;
  loop_rate_pct: number;
  last_seen: string | null;
}

// ── Code Fixes ───────────────────────────────────────────────────────────────

export interface GitHubConfig {
  project_id: string;
  repo_url: string;
  repo_owner: string;
  repo_name: string;
  default_branch: string;
  token_masked: string;
}

export interface FilePatch {
  file_path: string;
  old_code: string;
  new_code: string;
  explanation: string;
}

export type CodeFixJobStatus = "pending" | "running" | "ready" | "applied" | "failed";

export interface CodeFixJob {
  id: string;
  project_id: string;
  issue_type: string;
  status: CodeFixJobStatus;
  diagnosis: string | null;
  patches: FilePatch[] | null;
  pr_url: string | null;
  pr_branch: string | null;
  files_loaded: string[] | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

// ── Scores ────────────────────────────────────────────────────────────────────

export interface Score {
  id: string;
  project_id: string;
  session_id: string;
  span_id: string | null;
  name: string;
  value: number;
  string_value: string | null;
  comment: string | null;
  source: "human" | "model" | "api";
  model_name: string | null;
  created_at: string;
}

// ── Prompts ───────────────────────────────────────────────────────────────────

export interface PromptVersion {
  id: string;
  project_id: string;
  name: string;
  version: number;
  label: string | null;
  content: string;
  // Structured fields (stored in config JSONB, exposed as top-level)
  system: string;
  model: string | null;
  parameters: Record<string, unknown>;
  tools: object[];
  messages: Array<{ role: string; content: string }>;
  variables: string[];
  config: Record<string, unknown>;
  tags: string[];
  is_active: boolean;
  commit_message: string | null;
  created_at: string;
}

// ── Evals ─────────────────────────────────────────────────────────────────────

export interface EvalConfig {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  evaluator_model: string;
  criteria: string;
  score_name: string;
  score_range_min: number;
  score_range_max: number;
  run_on: "all" | "sample";
  sample_rate: number;
  active: boolean;
  created_at: string;
}

export interface EvalResult {
  id: string;
  eval_config_id: string;
  session_id: string;
  score_value: number | null;
  reasoning: string | null;
  status: "pending" | "completed" | "failed";
  error: string | null;
  created_at: string;
}

// ── Datasets ─────────────────────────────────────────────────────────────────

export interface DatasetSummary {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  item_count: number;
  run_count: number;
  created_at: string;
  updated_at: string;
}

export interface DatasetItem {
  id: string;
  dataset_id: string;
  session_id: string | null;
  input: Record<string, unknown>;
  expected_output: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface DatasetRunResult {
  item_id: string;
  session_id: string | null;
  score: number | null;
  reasoning: string | null;
  status: string;
  error?: string;
}

export interface DatasetRun {
  id: string;
  dataset_id: string;
  name: string;
  description: string | null;
  model: string | null;
  status: "pending" | "running" | "completed" | "failed";
  results: DatasetRunResult[];
  avg_score: number | null;
  created_at: string;
  completed_at: string | null;
}

export interface DatasetDetail extends DatasetSummary {
  items: DatasetItem[];
  runs: DatasetRun[];
}

// ── Playground ───────────────────────────────────────────────────────────────

export interface PlaygroundResult {
  content: string;
  model: string;
  provider: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

export interface AlertEvent {
  id: string;
  alert_rule_id: string;
  session_id: string | null;
  fired_at: string;
  metric_value: number;
  message: string;
  delivered: boolean;
  delivery_error: string | null;
}
