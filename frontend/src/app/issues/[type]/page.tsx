"use client";
import { useQuery } from "@tanstack/react-query";
import { issuesApi } from "@/lib/api";
import { useProject } from "@/lib/project-context";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import {
  ArrowLeft, Layers, Users, Clock, ExternalLink, Wrench,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

interface Props { params: { type: string } }

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

export default function IssueTypePage({ params }: Props) {
  const { selectedProject } = useProject();
  const PROJECT_ID = selectedProject?.id ?? "";
  const issueType = params.type;

  const { data, isLoading } = useQuery({
    queryKey: ["issue-sessions", issueType, PROJECT_ID],
    queryFn: () => issuesApi.sessions(issueType, { project_id: PROJECT_ID, page_size: 50 }),
    enabled: !!PROJECT_ID,
  });

  const label = ISSUE_TYPE_LABELS[issueType] ?? issueType.replace(/_/g, " ");

  return (
    <div className="space-y-5 max-w-7xl mx-auto">

      {/* Back + header */}
      <div>
        <Link
          href="/issues"
          className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted hover:text-ink-secondary mb-3 transition-colors"
        >
          <ArrowLeft className="w-3 h-3" /> Back to Issues
        </Link>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-lg font-semibold text-ink-primary">{label}</h1>
          <span className="text-[10px] font-mono text-ink-dim bg-dark-raised border border-dark-border px-2 py-0.5 rounded">
            {issueType}
          </span>
          <Link
            href={`/fix/${issueType}`}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-[12px] font-semibold transition-colors"
          >
            <Wrench className="w-3.5 h-3.5" />
            Fix with AI
          </Link>
        </div>
        {data && (
          <p className="text-xs text-ink-muted mt-1">
            {data.total} session{data.total !== 1 ? "s" : ""} affected · last 30 days
          </p>
        )}
      </div>

      {/* Sessions table */}
      <Card title="Affected Sessions" subtitle="All sessions where this issue was detected">
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => <div key={i} className="shimmer h-9 w-full" />)}
          </div>
        ) : !data?.items?.length ? (
          <div className="py-8 text-center text-sm text-ink-muted">
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
                <th className="text-left pb-2.5 pr-4 font-semibold">Cost</th>
                <th className="text-left pb-2.5 font-semibold">Started</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((s: {
                id: string; agent_name: string; status: string;
                started_at: string; duration_ms: number | null;
                total_cost_usd: number | null; user_email: string | null;
                user_id: string | null; tags: string[];
              }) => (
                <tr key={s.id} className="table-row-hover border-b border-dark-divider/40 last:border-0">
                  <td className="py-2.5 pr-4">
                    <Link
                      href={`/sessions/${s.id}`}
                      className="flex items-center gap-1.5 text-brand-400 hover:text-brand-400/80 text-xs font-medium hover:underline underline-offset-2 group"
                    >
                      {s.agent_name}
                      <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Link>
                  </td>
                  <td className="py-2.5 pr-4">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="py-2.5 pr-4 text-[11px] text-ink-muted max-w-[140px] truncate">
                    {s.user_email ?? s.user_id ?? <span className="text-ink-dim">—</span>}
                  </td>
                  <td className="py-2.5 pr-4 font-mono text-[11px] text-ink-secondary">
                    {formatMs(s.duration_ms)}
                  </td>
                  <td className="py-2.5 pr-4 font-mono text-[11px] text-ink-secondary">
                    {s.total_cost_usd != null ? `$${Number(s.total_cost_usd).toFixed(4)}` : "—"}
                  </td>
                  <td className="py-2.5 text-[11px] text-ink-muted whitespace-nowrap">
                    {formatDistanceToNow(new Date(s.started_at), { addSuffix: true })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
