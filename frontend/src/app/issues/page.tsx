"use client";
import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { issuesApi } from "@/lib/api";
import { IssueGroup, IssueSeverity } from "@/lib/types";
import { useProject } from "@/lib/project-context";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import {
  ShieldAlert, XCircle, AlertTriangle, AlertCircle,
  TrendingUp, Info, Users, Layers, Clock, ChevronRight,
  Zap, Wrench, ArrowLeft, ExternalLink, MessageSquare, Send, User,
  CheckCircle2, Circle, Eye,
} from "lucide-react";
import { EmptyState } from "@/components/ui/Card";
import { SideDrawer } from "@/components/ui/SideDrawer";
import { StatusBadge } from "@/components/ui/Badge";
import { SessionDetailPanel } from "@/components/session/SessionDetailPanel";

// ── Severity config ────────────────────────────────────────────────────────────

const SEVERITY: Record<IssueSeverity, {
  dot: string; badge: string; badgeBg: string; border: string;
  cardBg: string; cardHover: string; icon: React.ReactNode; label: string;
}> = {
  critical: { dot: "bg-red-500",    badge: "text-red-400",    badgeBg: "bg-red-500/10 border-red-500/25",       border: "border-red-500/20",    cardBg: "bg-[#1a0d0d]",  cardHover: "hover:border-red-500/40",    icon: <XCircle className="w-4 h-4" />,      label: "CRITICAL" },
  high:     { dot: "bg-orange-400", badge: "text-orange-400", badgeBg: "bg-orange-500/10 border-orange-500/25", border: "border-orange-500/20", cardBg: "bg-[#1a100a]",  cardHover: "hover:border-orange-500/40", icon: <AlertTriangle className="w-4 h-4" />, label: "HIGH"     },
  medium:   { dot: "bg-amber-400",  badge: "text-amber-400",  badgeBg: "bg-amber-500/10 border-amber-500/25",   border: "border-amber-500/20",  cardBg: "bg-[#1a1500]",  cardHover: "hover:border-amber-500/40",  icon: <AlertCircle className="w-4 h-4" />,  label: "MEDIUM"   },
  low:      { dot: "bg-sky-400",    badge: "text-sky-400",    badgeBg: "bg-sky-500/10 border-sky-500/25",       border: "border-sky-500/20",    cardBg: "bg-[#0a1520]",  cardHover: "hover:border-sky-500/40",    icon: <TrendingUp className="w-4 h-4" />,   label: "LOW"      },
  info:     { dot: "bg-zinc-500",   badge: "text-ink-muted",  badgeBg: "bg-dark-raised border-dark-border",     border: "border-dark-border",   cardBg: "bg-dark-surface",cardHover: "hover:border-dark-divider",  icon: <Info className="w-4 h-4" />,         label: "INFO"     },
};

const SEVERITY_ORDER: IssueSeverity[] = ["critical", "high", "medium", "low", "info"];

const ISSUE_TYPE_LABELS: Record<string, string> = {
  session_failed:       "Session Failure",
  loop_detected:        "Agent Loop",
  high_latency:         "High Latency",
  slow_span:            "Slow Operation",
  high_cost:            "High Cost",
  tool_failure_storm:   "Tool Failure Storm",
  repeated_tool_error:  "Repeated Tool Error",
  excessive_tokens:     "Excessive Token Usage",
  no_llm_output:        "Missing LLM Output",
  no_llm_calls:         "No LLM Calls Recorded",
};

function formatMs(ms: number | null) {
  if (!ms) return "—";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
}

// ── Issue Card ─────────────────────────────────────────────────────────────────

function IssueCard({ group, onClick }: { group: IssueGroup; onClick: () => void }) {
  const cfg = SEVERITY[group.severity as IssueSeverity] ?? SEVERITY.info;

  return (
    <button
      onClick={onClick}
      className={`
        w-full text-left relative flex flex-col gap-4 p-5 rounded-2xl border transition-all duration-150 cursor-pointer
        ${cfg.cardBg} ${cfg.border} ${cfg.cardHover}
      `}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 mt-0.5 ${cfg.dot}`} />
          <span className={`text-[10px] font-bold uppercase tracking-widest ${cfg.badge}`}>{cfg.label}</span>
        </div>
        <span className="text-[9px] font-semibold uppercase tracking-wider text-ink-dim border border-dark-border bg-dark-raised px-1.5 py-0.5 rounded">
          {group.source}
        </span>
      </div>

      <div>
        <h3 className="text-[13px] font-semibold text-ink-primary leading-snug">{group.title}</h3>
        <p className="text-[11px] text-ink-dim font-mono mt-0.5">{group.issue_type}</p>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 text-[11px] text-ink-muted">
          <Zap className="w-3 h-3 text-ink-dim" />
          <span className="font-semibold text-ink-secondary">{group.occurrence_count}</span>
          <span>occurrence{group.occurrence_count !== 1 ? "s" : ""}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-ink-muted">
          <Layers className="w-3 h-3 text-ink-dim" />
          <span className="font-semibold text-ink-secondary">{group.session_count}</span>
          <span>session{group.session_count !== 1 ? "s" : ""}</span>
        </div>
        {group.user_count > 0 && (
          <div className="flex items-center gap-1.5 text-[11px] text-ink-muted">
            <Users className="w-3 h-3 text-ink-dim" />
            <span className="font-semibold text-ink-secondary">{group.user_count}</span>
            <span>user{group.user_count !== 1 ? "s" : ""}</span>
          </div>
        )}
      </div>

      {group.agent_names.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {group.agent_names.slice(0, 3).map(name => (
            <span key={name} className="text-[10px] font-mono text-ink-dim bg-dark-raised border border-dark-border px-1.5 py-0.5 rounded">{name}</span>
          ))}
          {group.agent_names.length > 3 && <span className="text-[10px] text-ink-dim">+{group.agent_names.length - 3} more</span>}
        </div>
      )}

      <div className="flex items-center justify-between mt-auto pt-1 border-t border-white/5">
        <div className="flex items-center gap-1 text-[10px] text-ink-dim">
          <Clock className="w-3 h-3" />
          {formatDistanceToNow(new Date(group.last_seen), { addSuffix: true })}
        </div>
        <ChevronRight className="w-3.5 h-3.5 text-ink-dim" />
      </div>
    </button>
  );
}

// ── Workflow status config ──────────────────────────────────────────────────────

const WORKFLOW_STATUS = {
  open:      { label: "Open",      icon: <Circle className="w-3 h-3" />,       color: "text-ink-muted",  bg: "bg-dark-raised border-dark-border" },
  in_review: { label: "In Review", icon: <Eye className="w-3 h-3" />,          color: "text-amber-400",  bg: "bg-amber-500/10 border-amber-500/30" },
  resolved:  { label: "Resolved",  icon: <CheckCircle2 className="w-3 h-3" />, color: "text-status-green", bg: "bg-green-500/10 border-green-500/30" },
} as const;

// ── Issue detail drawer content ────────────────────────────────────────────────

function IssueDetailContent({
  issueType,
  projectId,
  onSelectSession,
}: {
  issueType: string;
  projectId: string;
  onSelectSession: (id: string) => void;
}) {
  const label = ISSUE_TYPE_LABELS[issueType] ?? issueType.replace(/_/g, " ");
  const qc = useQueryClient();
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const [commentAuthor, setCommentAuthor] = useState("");
  const [commentBody, setCommentBody] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["issue-sessions", issueType, projectId],
    queryFn: () => issuesApi.sessions(issueType, { project_id: projectId, page_size: 50 }),
    enabled: !!projectId,
  });

  const { data: workflow } = useQuery({
    queryKey: ["issue-workflow", issueType, projectId],
    queryFn: () => issuesApi.getWorkflow(issueType, projectId),
    enabled: !!projectId,
  });

  const updateStatus = useMutation({
    mutationFn: (status: string) => issuesApi.updateWorkflow(issueType, projectId, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["issue-workflow", issueType, projectId] }),
  });

  const updateAssignee = useMutation({
    mutationFn: (assignee: string) => issuesApi.updateWorkflow(issueType, projectId, { assignee }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["issue-workflow", issueType, projectId] }),
  });

  const addComment = useMutation({
    mutationFn: () => issuesApi.addComment(issueType, projectId, commentAuthor || "Anonymous", commentBody),
    onSuccess: () => {
      setCommentBody("");
      qc.invalidateQueries({ queryKey: ["issue-workflow", issueType, projectId] });
    },
  });

  const currentStatus = (workflow?.status ?? "open") as keyof typeof WORKFLOW_STATUS;

  return (
    <div className="p-5 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink-primary">{label}</h2>
          <p className="text-[11px] font-mono text-ink-dim mt-0.5">{issueType}</p>
          {data && (
            <p className="text-[11px] text-ink-muted mt-1">
              {data.total} affected session{data.total !== 1 ? "s" : ""} · last 30 days
            </p>
          )}
        </div>
        <Link
          href={`/fix/${issueType}`}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-[11px] font-semibold transition-colors shrink-0"
        >
          <Wrench className="w-3.5 h-3.5" />
          Fix with AI
        </Link>
      </div>

      {/* ── Workflow panel ── */}
      <div className="bg-dark-raised border border-dark-border rounded-xl p-4 space-y-4">
        <p className="text-[10px] font-semibold text-ink-muted uppercase tracking-widest">Workflow</p>

        {/* Status toggles */}
        <div>
          <p className="text-[10px] text-ink-dim mb-2">Status</p>
          <div className="flex items-center gap-2">
            {(Object.keys(WORKFLOW_STATUS) as Array<keyof typeof WORKFLOW_STATUS>).map(s => {
              const cfg = WORKFLOW_STATUS[s];
              const active = currentStatus === s;
              return (
                <button
                  key={s}
                  onClick={() => updateStatus.mutate(s)}
                  disabled={updateStatus.isPending}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all ${
                    active ? `${cfg.color} ${cfg.bg}` : "text-ink-dim border-dark-border hover:border-dark-divider"
                  }`}
                >
                  {cfg.icon} {cfg.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Assignee */}
        <div>
          <p className="text-[10px] text-ink-dim mb-1.5">Assignee</p>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-ink-dim pointer-events-none" />
              <input
                type="text"
                placeholder="Email or name…"
                defaultValue={workflow?.assignee ?? ""}
                className="input-dark pl-7 pr-3 w-full text-xs"
                onBlur={(e) => updateAssignee.mutate(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && updateAssignee.mutate((e.target as HTMLInputElement).value)}
              />
            </div>
            {workflow?.assignee && (
              <button
                onClick={() => updateAssignee.mutate("")}
                className="text-[10px] text-ink-dim hover:text-ink-secondary px-2 py-1 border border-dark-border rounded transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Comment thread */}
        <div>
          <p className="text-[10px] text-ink-dim mb-2 flex items-center gap-1.5">
            <MessageSquare className="w-3 h-3" />
            Comments {workflow?.comments.length ? `(${workflow.comments.length})` : ""}
          </p>
          {workflow?.comments.length ? (
            <div className="space-y-2 mb-3 max-h-48 overflow-y-auto">
              {workflow.comments.map(c => (
                <div key={c.id} className="bg-dark-bg border border-dark-border rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] font-medium text-ink-secondary">{c.author}</span>
                    <span className="text-[10px] text-ink-dim">{formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}</span>
                  </div>
                  <p className="text-xs text-ink-secondary leading-relaxed whitespace-pre-wrap">{c.body}</p>
                </div>
              ))}
            </div>
          ) : null}
          {/* Add comment */}
          <div className="space-y-1.5">
            <input
              type="text"
              placeholder="Your name…"
              value={commentAuthor}
              onChange={e => setCommentAuthor(e.target.value)}
              className="input-dark w-full text-xs"
            />
            <div className="flex gap-2">
              <textarea
                ref={commentRef}
                placeholder="Add a comment…"
                value={commentBody}
                onChange={e => setCommentBody(e.target.value)}
                rows={2}
                className="input-dark flex-1 text-xs resize-none"
              />
              <button
                onClick={() => addComment.mutate()}
                disabled={!commentBody.trim() || addComment.isPending}
                className="flex items-center gap-1 px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-[11px] font-medium transition-colors self-end"
              >
                <Send className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Sessions table */}
      <div>
        <p className="text-[10px] font-semibold text-ink-muted uppercase tracking-widest mb-3">
          Affected Sessions
        </p>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => <div key={i} className="shimmer h-10 w-full rounded-lg" />)}
          </div>
        ) : !data?.items?.length ? (
          <div className="py-10 text-center text-sm text-ink-muted">
            No sessions with this issue in the last 30 days.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-ink-muted border-b border-dark-divider">
                <th className="text-left pb-2.5 pr-4 font-semibold">Agent</th>
                <th className="text-left pb-2.5 pr-4 font-semibold">Status</th>
                <th className="text-left pb-2.5 pr-4 font-semibold">User</th>
                <th className="text-left pb-2.5 pr-4 font-semibold">Duration</th>
                <th className="text-left pb-2.5 font-semibold">Started</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((s: {
                id: string; agent_name: string; status: string;
                started_at: string; duration_ms: number | null;
                total_cost_usd: number | null; user_email: string | null;
                user_id: string | null;
              }) => (
                <tr
                  key={s.id}
                  onClick={() => onSelectSession(s.id)}
                  className="table-row-hover border-b border-dark-divider/40 last:border-0 cursor-pointer group"
                >
                  <td className="py-2.5 pr-4">
                    <span className="flex items-center gap-1.5 text-brand-400 text-xs font-medium group-hover:underline underline-offset-2">
                      {s.agent_name}
                      <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                    </span>
                  </td>
                  <td className="py-2.5 pr-4"><StatusBadge status={s.status} /></td>
                  <td className="py-2.5 pr-4 text-[11px] text-ink-muted max-w-[120px] truncate">
                    {s.user_email ?? s.user_id ?? <span className="text-ink-dim">—</span>}
                  </td>
                  <td className="py-2.5 pr-4 font-mono text-[11px] text-ink-secondary">
                    {formatMs(s.duration_ms)}
                  </td>
                  <td className="py-2.5 text-[11px] text-ink-muted whitespace-nowrap">
                    {formatDistanceToNow(new Date(s.started_at), { addSuffix: true })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

const SEVERITY_FILTERS = [
  { label: "All",      value: "" },
  { label: "Critical", value: "critical" },
  { label: "High",     value: "high" },
  { label: "Medium",   value: "medium" },
  { label: "Low",      value: "low" },
  { label: "Info",     value: "info" },
];

export default function IssuesPage() {
  const { selectedProject } = useProject();
  const PROJECT_ID = selectedProject?.id ?? "";
  const [severityFilter, setSeverityFilter] = useState("");

  // Drawers
  const [selectedIssueType, setSelectedIssueType] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["issues", PROJECT_ID, severityFilter],
    queryFn: () => issuesApi.list({ project_id: PROJECT_ID, severity: severityFilter || undefined }),
    enabled: !!PROJECT_ID,
    refetchInterval: 30_000,
  });

  const groups = [...(data?.groups ?? [])].sort((a, b) => {
    const ai = SEVERITY_ORDER.indexOf(a.severity as IssueSeverity);
    const bi = SEVERITY_ORDER.indexOf(b.severity as IssueSeverity);
    if (ai !== bi) return ai - bi;
    return b.occurrence_count - a.occurrence_count;
  });

  return (
    <>
      <div className="space-y-5 max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-lg font-semibold text-ink-primary">Issues</h1>
            <p className="text-xs text-ink-muted mt-0.5">
              {data
                ? `${data.total_signals} signal${data.total_signals !== 1 ? "s" : ""} auto-detected · last 30 days`
                : "Auto-detected behavioral signals across all agent sessions"}
            </p>
          </div>
          <div className="flex items-center gap-1 bg-dark-raised border border-dark-border rounded-xl p-1">
            {SEVERITY_FILTERS.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => setSeverityFilter(value)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                  severityFilter === value
                    ? "bg-dark-bg text-ink-primary shadow-sm"
                    : "text-ink-muted hover:text-ink-secondary"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => <div key={i} className="shimmer h-52 rounded-2xl" />)}
          </div>
        ) : !PROJECT_ID ? (
          <EmptyState icon={<ShieldAlert />} title="No project selected" description="Select a project to see detected issues." />
        ) : !groups.length ? (
          <EmptyState
            icon={<ShieldAlert />}
            title="No issues detected"
            description={severityFilter ? `No ${severityFilter} issues in the last 30 days.` : "No behavioral issues detected yet."}
          />
        ) : (
          <>
            {/* Summary stats */}
            <div className="flex items-center gap-6 flex-wrap">
              {SEVERITY_ORDER.filter(s => groups.some(g => g.severity === s)).map(sev => {
                const count = groups.filter(g => g.severity === sev).length;
                const cfg = SEVERITY[sev];
                return (
                  <button
                    key={sev}
                    onClick={() => setSeverityFilter(sev === severityFilter ? "" : sev)}
                    className="flex items-center gap-1.5 text-[11px] group"
                  >
                    <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                    <span className={`font-semibold ${sev === severityFilter ? cfg.badge : "text-ink-muted"} group-hover:${cfg.badge} transition-colors`}>
                      {count} {sev}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Issue cards grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {groups.map(group => (
                <IssueCard
                  key={group.issue_type}
                  group={group}
                  onClick={() => setSelectedIssueType(group.issue_type)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Issue detail drawer */}
      <SideDrawer
        open={!!selectedIssueType && !selectedSessionId}
        onClose={() => setSelectedIssueType(null)}
        width="680px"
      >
        {selectedIssueType && (
          <IssueDetailContent
            issueType={selectedIssueType}
            projectId={PROJECT_ID}
            onSelectSession={(id) => setSelectedSessionId(id)}
          />
        )}
      </SideDrawer>

      {/* Session detail drawer (nested — slides over the issue drawer) */}
      <SideDrawer
        open={!!selectedSessionId}
        onClose={() => setSelectedSessionId(null)}
        width="800px"
      >
        {selectedSessionId && (
          <>
            <div className="px-5 py-3 border-b border-dark-border flex items-center gap-2 shrink-0">
              <button
                onClick={() => setSelectedSessionId(null)}
                className="flex items-center gap-1.5 text-[11px] text-ink-muted hover:text-ink-secondary transition-colors"
              >
                <ArrowLeft className="w-3 h-3" />
                Back to issue
              </button>
            </div>
            <SessionDetailPanel sessionId={selectedSessionId} />
          </>
        )}
      </SideDrawer>
    </>
  );
}
