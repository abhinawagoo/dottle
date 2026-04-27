import axios from "axios";
import type {
  Project, Session, SessionDetail, SessionListResponse,
  MetricsSummary, CostOverTimeResponse, ToolFailureRatesResponse,
  AlertRule, AlertEvent,
  Score, PromptVersion, EvalConfig, EvalResult,
  DatasetSummary, DatasetDetail, PlaygroundResult,
} from "./types";
import type { Org } from "./org-context";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export const api = axios.create({ baseURL: BASE_URL });

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  register: (name: string, email: string, password: string) =>
    api.post("/auth/register", { name, email, password }).then(r => r.data),
  login: (email: string, password: string) =>
    api.post("/auth/login", { email, password }).then(r => r.data),
  me: () => api.get("/auth/me").then(r => r.data),
  googleUrl: () => `${BASE_URL}/auth/google`,
};

// ── Orgs ──────────────────────────────────────────────────────────────────────
export const orgsApi = {
  list: (): Promise<Org[]> => api.get("/orgs").then(r => r.data),
  create: (name: string): Promise<Org> => api.post("/orgs", { name }).then(r => r.data),
  update: (id: string, name: string): Promise<Org> => api.patch(`/orgs/${id}`, { name }).then(r => r.data),
  delete: (id: string): Promise<void> => api.delete(`/orgs/${id}`).then(r => r.data),
  listMembers: (id: string) => api.get(`/orgs/${id}/members`).then(r => r.data),
  inviteMember: (id: string, email: string, role: string) =>
    api.post(`/orgs/${id}/members`, { email, role }).then(r => r.data),
  removeMember: (orgId: string, memberId: string) =>
    api.delete(`/orgs/${orgId}/members/${memberId}`).then(r => r.data),
};

// ── Projects ─────────────────────────────────────────────────────────────────
export const projectsApi = {
  list: (orgId: string): Promise<Project[]> =>
    api.get("/projects", { params: { org_id: orgId } }).then(r => r.data),
  create: (orgId: string, name: string, description?: string): Promise<Project> =>
    api.post("/projects", { org_id: orgId, name, description }).then(r => r.data),
  delete: (id: string): Promise<void> => api.delete(`/projects/${id}`).then(r => r.data),
  regenerateKey: (id: string): Promise<Project> =>
    api.post(`/projects/${id}/regenerate-key`).then(r => r.data),

  // Slack integration
  getSlack: (projectId: string) =>
    api.get(`/projects/${projectId}/slack`).then(r => r.data as { project_id: string; webhook_url_masked: string; channel_name: string | null; workspace_name: string | null }),
  deleteSlack: (projectId: string) =>
    api.delete(`/projects/${projectId}/slack`).then(r => r.data),
  testSlack: (projectId: string) =>
    api.post(`/projects/${projectId}/slack/test`).then(r => r.data),
  // Returns the backend URL to redirect the browser to for OAuth
  slackOAuthUrl: (projectId: string) => {
    const base = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1");
    return `${base}/slack/oauth/start?project_id=${projectId}`;
  },
};

// ── Onboarding ───────────────────────────────────────────────────────────────
export const onboardingApi = {
  generatePrompt: (answers: {
    language: string;
    custom_language?: string;
    framework: string;
    custom_framework?: string;
    llm_providers: string[];
    custom_llm?: string;
    agent_type: string;
    custom_agent_type?: string;
    tool_types: string[];
    custom_tools?: string;
    codebase_context?: string;
  }, apiKey: string): Promise<{ prompt: string }> =>
    api.post("/onboarding/generate-prompt", { answers, api_key: apiKey }).then(r => r.data),
};

// ── Scores ───────────────────────────────────────────────────────────────────
export const scoresApi = {
  create: (body: { project_id: string; session_id: string; span_id?: string; name?: string; value: number; comment?: string; source?: string }) =>
    api.post("/scores", body).then(r => r.data),
  list: (project_id: string, session_id?: string, name?: string) =>
    api.get("/scores", { params: { project_id, session_id, name } }).then(r => r.data as Score[]),
  delete: (id: string) => api.delete(`/scores/${id}`).then(r => r.data),
};

// ── Prompts ───────────────────────────────────────────────────────────────────
export const promptsApi = {
  list: (project_id: string) =>
    api.get("/prompts", { params: { project_id } }).then(r => r.data as PromptVersion[]),
  versions: (name: string, project_id: string) =>
    api.get(`/prompts/${name}/versions`, { params: { project_id } }).then(r => r.data as PromptVersion[]),
  get: (name: string, project_id: string, version?: number) =>
    api.get(`/prompts/${name}`, { params: { project_id, version } }).then(r => r.data as PromptVersion),
  create: (body: { project_id: string; name: string; content: string; label?: string; config?: Record<string,unknown>; tags?: string[]; commit_message?: string }) =>
    api.post("/prompts", body).then(r => r.data as PromptVersion),
  activate: (name: string, version: number, project_id: string) =>
    api.put(`/prompts/${name}/activate/${version}`, null, { params: { project_id } }).then(r => r.data),
  delete: (id: string) => api.delete(`/prompts/${id}`).then(r => r.data),
};

// ── Evals ─────────────────────────────────────────────────────────────────────
export const evalsApi = {
  listConfigs: (project_id: string) =>
    api.get("/evals/configs", { params: { project_id } }).then(r => r.data as EvalConfig[]),
  createConfig: (body: { project_id: string; name: string; criteria: string; score_name: string; evaluator_model?: string; run_on?: string; sample_rate?: number; description?: string }) =>
    api.post("/evals/configs", body).then(r => r.data as EvalConfig),
  updateConfig: (id: string, body: Partial<EvalConfig>) =>
    api.put(`/evals/configs/${id}`, body).then(r => r.data as EvalConfig),
  deleteConfig: (id: string) => api.delete(`/evals/configs/${id}`).then(r => r.data),
  runOnSession: (configId: string, sessionId: string) =>
    api.post(`/evals/configs/${configId}/run/${sessionId}`).then(r => r.data),
  listResults: (project_id: string, session_id?: string, config_id?: string) =>
    api.get("/evals/results", { params: { project_id, session_id, config_id } }).then(r => r.data as EvalResult[]),
};

// ── Datasets ─────────────────────────────────────────────────────────────────
export const datasetsApi = {
  list: (project_id: string) =>
    api.get("/datasets", { params: { project_id } }).then(r => r.data as DatasetSummary[]),
  get: (id: string) =>
    api.get(`/datasets/${id}`).then(r => r.data as DatasetDetail),
  create: (body: { project_id: string; name: string; description?: string }) =>
    api.post("/datasets", body).then(r => r.data as DatasetSummary),
  delete: (id: string) => api.delete(`/datasets/${id}`).then(r => r.data),
  addItem: (datasetId: string, body: { session_id?: string; input?: Record<string,unknown>; expected_output?: string; metadata?: Record<string,unknown> }) =>
    api.post(`/datasets/${datasetId}/items`, body).then(r => r.data),
  deleteItem: (datasetId: string, itemId: string) =>
    api.delete(`/datasets/${datasetId}/items/${itemId}`).then(r => r.data),
  createRun: (datasetId: string, body: { name: string; model?: string; prompt_id?: string; eval_criteria?: string; description?: string }) =>
    api.post(`/datasets/${datasetId}/runs`, body).then(r => r.data),
  listRuns: (datasetId: string) =>
    api.get(`/datasets/${datasetId}/runs`).then(r => r.data),
  importItems: (datasetId: string, file: File): Promise<{ imported: number; failed: number; errors: string[] }> => {
    const form = new FormData();
    form.append("file", file);
    return api.post(`/datasets/${datasetId}/items/import`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    }).then(r => r.data);
  },
};

// ── Playground ───────────────────────────────────────────────────────────────
export interface ProviderModels {
  provider: string;
  configured: boolean;
  models: { id: string; label: string }[];
}

export const playgroundApi = {
  run: (body: { model: string; system?: string; messages: Array<{role: string; content: string}>; temperature?: number; max_tokens?: number; project_id?: string }) =>
    api.post("/playground/run", body).then(r => r.data as PlaygroundResult),

  listModels: (projectId?: string): Promise<ProviderModels[]> =>
    api.get("/playground/models", { params: projectId ? { project_id: projectId } : {} }).then(r => r.data),
};

// ── Experiments ───────────────────────────────────────────────────────────────
export interface ExperimentVariant {
  model: string;
  system_prompt: string;
  label?: string;
}

export interface ExperimentSummary {
  id: string;
  name: string;
  description?: string;
  dataset_id?: string;
  variant_a: ExperimentVariant;
  variant_b: ExperimentVariant;
  status: "draft" | "running" | "completed" | "failed";
  result_summary?: {
    a_avg_score: number;
    b_avg_score: number;
    winner: "a" | "b" | "tie";
    total_items: number;
    a_wins: number;
    b_wins: number;
    ties: number;
  };
  created_at: string;
  completed_at?: string;
}

export interface ExperimentRun {
  id: string;
  variant: "a" | "b";
  item_index: number;
  input_text?: string;
  response_text?: string;
  score?: number;
  reasoning?: string;
  status: string;
}

export interface ExperimentDetail extends ExperimentSummary {
  runs: ExperimentRun[];
}

export const experimentsApi = {
  list: (projectId: string): Promise<ExperimentSummary[]> =>
    api.get("/experiments", { params: { project_id: projectId } }).then(r => r.data),

  create: (body: {
    project_id: string; name: string; description?: string;
    dataset_id?: string; eval_criteria?: string;
    variant_a: ExperimentVariant; variant_b: ExperimentVariant;
  }): Promise<ExperimentSummary> =>
    api.post("/experiments", body).then(r => r.data),

  get: (id: string): Promise<ExperimentDetail> =>
    api.get(`/experiments/${id}`).then(r => r.data),

  run: (id: string): Promise<void> =>
    api.post(`/experiments/${id}/run`).then(r => r.data),

  delete: (id: string): Promise<void> =>
    api.delete(`/experiments/${id}`).then(r => r.data),
};

// ── Sessions ─────────────────────────────────────────────────────────────────
export const sessionsApi = {
  list: (params: {
    project_id: string;
    status?: string;
    agent_name?: string;
    search?: string;
    loop_detected?: boolean;
    user_id?: string;
    user_email?: string;
    agent_version?: string;
    tag?: string;
    from?: string;
    to?: string;
    page?: number;
    page_size?: number;
  }): Promise<SessionListResponse> => api.get("/sessions", { params }).then(r => r.data),

  get: (sessionId: string): Promise<SessionDetail> =>
    api.get(`/sessions/${sessionId}`).then(r => r.data),

  diagnose: (sessionId: string): Promise<{ root_cause: string; suggestions: string[]; severity: string }> =>
    api.post(`/sessions/${sessionId}/diagnose`).then(r => r.data),
};

// ── Metrics ──────────────────────────────────────────────────────────────────
export const metricsApi = {
  summary: (projectId: string, from?: string, to?: string): Promise<MetricsSummary> =>
    api.get("/metrics/summary", { params: { project_id: projectId, from, to } }).then(r => r.data),

  costOverTime: (projectId: string, granularity = "day", from?: string, to?: string): Promise<CostOverTimeResponse> =>
    api.get("/metrics/cost-over-time", { params: { project_id: projectId, granularity, from, to } }).then(r => r.data),

  toolFailureRates: (projectId: string, from?: string, to?: string): Promise<ToolFailureRatesResponse> =>
    api.get("/metrics/tool-failure-rates", { params: { project_id: projectId, from, to } }).then(r => r.data),

  latency: (projectId: string, from?: string, to?: string) =>
    api.get("/metrics/latency", { params: { project_id: projectId, from, to } }).then(r => r.data),

  regression: (params: {
    project_id: string;
    agent_name?: string;
    version_a?: string;
    version_b?: string;
    from_a?: string;
    to_a?: string;
    from_b?: string;
    to_b?: string;
  }) => api.get("/metrics/regression", { params }).then(r => r.data),

  users: (projectId: string, from?: string, to?: string): Promise<import("./types").UserAnalyticsResponse> =>
    api.get("/metrics/users", { params: { project_id: projectId, from, to } }).then(r => r.data),
};

// ── Issues Board ──────────────────────────────────────────────────────────────
export const issuesApi = {
  list: (params: {
    project_id: string;
    severity?: string;
    issue_type?: string;
    agent_name?: string;
    from?: string;
    to?: string;
  }): Promise<import("./types").IssuesBoardResponse> =>
    api.get("/issues", { params }).then(r => r.data),

  sessions: (issueType: string, params: { project_id: string; page?: number; page_size?: number }) =>
    api.get(`/issues/${issueType}/sessions`, { params }).then(r => r.data),

  getWorkflow: (issueType: string, projectId: string): Promise<IssueWorkflow> =>
    api.get(`/issues/${issueType}/workflow`, { params: { project_id: projectId } }).then(r => r.data),

  updateWorkflow: (issueType: string, projectId: string, data: { status?: string; assignee?: string }) =>
    api.patch(`/issues/${issueType}/workflow`, data, { params: { project_id: projectId } }).then(r => r.data),

  addComment: (issueType: string, projectId: string, author: string, body: string): Promise<IssueWorkflowComment> =>
    api.post(`/issues/${issueType}/workflow/comments`, { author, body }, { params: { project_id: projectId } }).then(r => r.data),
};

export interface IssueWorkflow {
  status: "open" | "in_review" | "resolved";
  assignee: string | null;
  updated_at: string | null;
  comments: IssueWorkflowComment[];
}

export interface IssueWorkflowComment {
  id: string;
  author: string;
  body: string;
  created_at: string;
}

// ── AI Session Chat ───────────────────────────────────────────────────────────
// Returns a raw Response so the caller can consume the SSE stream directly
export const sessionChatStream = (
  sessionId: string,
  message: string,
  history: { role: string; content: string }[]
): Promise<Response> =>
  fetch(`${BASE_URL}/sessions/${sessionId}/ai-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history }),
  });

// ── Code Fixes ───────────────────────────────────────────────────────────────
export const codeFixApi = {
  getGitHubConfig: (projectId: string) =>
    api.get(`/projects/${projectId}/github`).then(r => r.data),

  saveGitHubConfig: (projectId: string, data: {
    repo_url: string; access_token: string; default_branch?: string;
  }) => api.put(`/projects/${projectId}/github`, data).then(r => r.data),

  deleteGitHubConfig: (projectId: string) =>
    api.delete(`/projects/${projectId}/github`).then(r => r.data),

  createFixJob: (issueType: string, data: {
    project_id: string; issue_context: Record<string, unknown>;
  }) => api.post(`/issues/${issueType}/fix`, data).then(r => r.data),

  getJob: (jobId: string) =>
    api.get(`/fix/jobs/${jobId}`).then(r => r.data),

  listJobs: (projectId: string) =>
    api.get(`/projects/${projectId}/fix/jobs`).then(r => r.data),

  createPR: (jobId: string, data?: { title?: string; body?: string }) =>
    api.post(`/fix/jobs/${jobId}/create-pr`, data ?? {}).then(r => r.data),
};

// ── AI Providers ─────────────────────────────────────────────────────────────
export interface AIProviderEntry {
  provider: string;
  env_var: string;
  api_key_masked: string | null;
  updated_at: string | null;
}

export const aiProvidersApi = {
  list: (projectId: string): Promise<AIProviderEntry[]> =>
    api.get(`/projects/${projectId}/ai-providers`).then(r => r.data),

  upsert: (projectId: string, provider: string, api_key: string): Promise<void> =>
    api.put(`/projects/${projectId}/ai-providers/${provider}`, { api_key }).then(r => r.data),

  delete: (projectId: string, provider: string): Promise<void> =>
    api.delete(`/projects/${projectId}/ai-providers/${provider}`).then(r => r.data),
};

// ── Alerts ───────────────────────────────────────────────────────────────────
export const alertsApi = {
  listRules: (projectId: string): Promise<AlertRule[]> =>
    api.get("/alerts/rules", { params: { project_id: projectId } }).then(r => r.data),

  createRule: (data: Omit<AlertRule, "id" | "created_at" | "last_fired_at">): Promise<AlertRule> =>
    api.post("/alerts/rules", data).then(r => r.data),

  updateRule: (id: string, data: Partial<AlertRule>): Promise<AlertRule> =>
    api.patch(`/alerts/rules/${id}`, data).then(r => r.data),

  deleteRule: (id: string): Promise<void> =>
    api.delete(`/alerts/rules/${id}`).then(r => r.data),

  listEvents: (projectId: string): Promise<AlertEvent[]> =>
    api.get("/alerts/events", { params: { project_id: projectId } }).then(r => r.data),
};
