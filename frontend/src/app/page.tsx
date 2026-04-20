"use client";
import { useQuery } from "@tanstack/react-query";
import { metricsApi, sessionsApi } from "@/lib/api";
import { StatCard, Card, EmptyState } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge, LoopBadge } from "@/components/ui/Badge";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import {
  DollarSign,
  Clock,
  RefreshCw,
  AlertTriangle,
  Wrench,
  Layers,
  Settings,
  ArrowRight,
} from "lucide-react";
import { useProject } from "@/lib/project-context";
import DottleMascot from "@/components/dottle-mascot";

function formatCost(v: number) {
  return `$${v.toFixed(4)}`;
}
function formatMs(ms: number) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function DashboardPage() {
  const { selectedProject, isLoading: projectLoading } = useProject();
  const PROJECT_ID = selectedProject?.id ?? "";

  const { data: summary, isLoading: sumLoading } = useQuery({
    queryKey: ["metrics-summary", PROJECT_ID],
    queryFn: () => metricsApi.summary(PROJECT_ID),
    enabled: !!PROJECT_ID,
  });

  const { data: sessions, isLoading: sessLoading } = useQuery({
    queryKey: ["sessions", PROJECT_ID],
    queryFn: () => sessionsApi.list({ project_id: PROJECT_ID, page_size: 10 }),
    enabled: !!PROJECT_ID,
  });

  /* ── No project configured ─────────────────────────────────────────────── */
  if (!projectLoading && !PROJECT_ID) {
    return (
      <div className="max-w-lg mx-auto mt-20 text-center">
        <div className="w-12 h-12 rounded-2xl bg-brand-600/10 border border-brand-500/20 flex items-center justify-center mx-auto mb-5">
          <Settings className="w-6 h-6 text-brand-400" />
        </div>
        <h2 className="text-base font-semibold text-ink-primary mb-2">No project configured</h2>
        <p className="text-sm text-ink-muted leading-relaxed mb-6">
          Create a project in Settings to get your API key and start instrumenting agents.
        </p>
        <Link href="/settings">
          <Button icon={<ArrowRight />}>Go to Settings</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ink-primary">Dashboard</h1>
          <p className="text-xs text-ink-muted mt-0.5">Last 7 days · All agents</p>
        </div>
        <Link href="/sessions">
          <Button variant="secondary" size="sm" icon={<Layers />}>
            View Sessions
          </Button>
        </Link>
      </div>

      {/* Stats row 1 */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard
          label="Total Sessions"
          value={sumLoading ? "—" : (summary?.total_sessions ?? 0).toLocaleString()}
          sub="all agent runs"
          icon={<RefreshCw />}
        />
        <StatCard
          label="Total Cost"
          value={sumLoading ? "—" : formatCost(summary?.total_cost_usd ?? 0)}
          sub={summary ? `avg ${formatCost(summary.avg_cost_per_session)}/run` : ""}
          icon={<DollarSign />}
        />
        <StatCard
          label="Avg Latency"
          value={sumLoading ? "—" : formatMs(summary?.avg_latency_ms ?? 0)}
          sub={summary ? `p95: ${formatMs(summary.p95_latency_ms)}` : ""}
          icon={<Clock />}
        />
        <StatCard
          label="Loop Rate"
          value={sumLoading ? "—" : `${summary?.loop_rate_pct.toFixed(1) ?? 0}%`}
          sub={`Error rate: ${summary?.error_rate_pct.toFixed(1) ?? "—"}%`}
          color={summary && summary.loop_rate_pct > 5 ? "orange" : "default"}
          icon={<AlertTriangle />}
        />
      </div>

      {/* Stats row 2 */}
      {summary && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <StatCard
            label="Tool Failure Rate"
            value={`${summary.tool_failure_rate_pct.toFixed(1)}%`}
            color={summary.tool_failure_rate_pct > 10 ? "red" : "default"}
            icon={<Wrench />}
          />
          <Card>
            <p className="text-[10px] font-semibold text-ink-muted uppercase tracking-widest mb-3">
              Sessions by Status
            </p>
            <div className="space-y-2">
              {Object.entries(summary.sessions_by_status).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between">
                  <StatusBadge status={status} />
                  <span className="text-sm font-bold tabular-nums text-ink-primary">
                    {count}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Recent sessions */}
      <Card
        title="Recent Sessions"
        subtitle="Latest 10 agent runs"
        action={
          <Link href="/sessions">
            <Button variant="ghost" size="sm">
              View all →
            </Button>
          </Link>
        }
      >
        {sessLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="shimmer h-8 w-full" />
            ))}
          </div>
        ) : !sessions?.items.length ? (
          <div className="flex flex-col items-center pt-2">
            <DottleMascot variant="sleeping" size={200} />
            <EmptyState
              icon={<Layers />}
              title="No sessions yet"
              description="Instrument your agent with the Dottle SDK to start tracking runs."
              action={
                <Link href="/settings">
                  <Button variant="secondary" size="sm">
                    Get API key
                  </Button>
                </Link>
              }
            />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-ink-muted border-b border-dark-divider">
                <th className="text-left pb-2.5 pr-4 font-semibold">Agent</th>
                <th className="text-left pb-2.5 pr-4 font-semibold">Status</th>
                <th className="text-left pb-2.5 pr-4 font-semibold">Duration</th>
                <th className="text-left pb-2.5 pr-4 font-semibold">Cost</th>
                <th className="text-left pb-2.5 pr-4 font-semibold">Iterations</th>
                <th className="text-left pb-2.5 font-semibold">When</th>
              </tr>
            </thead>
            <tbody>
              {sessions.items.map((s) => (
                <tr
                  key={s.id}
                  className="table-row-hover border-b border-dark-divider/40 last:border-0"
                >
                  <td className="py-2.5 pr-4">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/sessions/${s.id}`}
                        className="text-brand-400 hover:text-brand-400/80 font-medium text-xs hover:underline underline-offset-2"
                      >
                        {s.agent_name}
                      </Link>
                      {s.loop_detected && <LoopBadge />}
                    </div>
                  </td>
                  <td className="py-2.5 pr-4">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="py-2.5 pr-4 font-mono text-[11px] text-ink-secondary">
                    {s.duration_ms ? formatMs(s.duration_ms) : "—"}
                  </td>
                  <td className="py-2.5 pr-4 font-mono text-[11px] text-ink-secondary">
                    {s.total_cost_usd !== null ? formatCost(s.total_cost_usd) : "—"}
                  </td>
                  <td className="py-2.5 pr-4 text-[11px] text-ink-secondary tabular-nums">
                    {s.iteration_count}
                  </td>
                  <td className="py-2.5 text-[11px] text-ink-muted">
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
