"use client";
import { useQuery } from "@tanstack/react-query";
import { metricsApi, sessionsApi, issuesApi, alertsApi } from "@/lib/api";
import { AgentStat } from "@/lib/types";
import { StatCard, Card, EmptyState } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge, LoopBadge } from "@/components/ui/Badge";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import ReactECharts from "echarts-for-react";
import { clsx } from "clsx";
import {
  DollarSign, Clock, RefreshCw, AlertTriangle, Wrench,
  Layers, Settings, ArrowRight, Bot, ShieldAlert,
  TrendingUp, XCircle, AlertCircle, Info, Bell, CheckCircle2,
  ChevronRight,
} from "lucide-react";
import { useProject } from "@/lib/project-context";

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatCost(v: number) { return `$${v.toFixed(4)}`; }
function formatMs(ms: number) {
  if (!ms) return "—";
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

const SEVERITY_ICON: Record<string, React.ReactNode> = {
  critical: <XCircle    className="w-3.5 h-3.5 text-red-400"    />,
  high:     <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />,
  medium:   <AlertCircle  className="w-3.5 h-3.5 text-amber-400"  />,
  low:      <TrendingUp   className="w-3.5 h-3.5 text-sky-400"    />,
  info:     <Info         className="w-3.5 h-3.5 text-ink-dim"    />,
};

const SEVERITY_COLOR: Record<string, string> = {
  critical: "text-red-400 bg-red-500/8 border-red-500/20",
  high:     "text-orange-400 bg-orange-500/8 border-orange-500/20",
  medium:   "text-amber-400 bg-amber-500/8 border-amber-500/20",
  low:      "text-sky-400 bg-sky-500/8 border-sky-500/20",
  info:     "text-ink-muted bg-dark-raised border-dark-border",
};

// ── Agent health card ──────────────────────────────────────────────────────────

function AgentCard({ agent }: { agent: AgentStat }) {
  const errorColor =
    agent.error_rate_pct > 20 ? "text-red-400" :
    agent.error_rate_pct > 5  ? "text-amber-400" : "text-green-400";

  const health =
    agent.error_rate_pct > 20 ? "critical" :
    agent.error_rate_pct > 5  ? "degraded" : "healthy";

  const healthDot =
    health === "critical" ? "bg-red-500 animate-pulse" :
    health === "degraded" ? "bg-amber-400" : "bg-green-400";

  return (
    <Link
      href={`/sessions?agent=${encodeURIComponent(agent.agent_name)}`}
      className="bg-dark-surface border border-dark-border rounded-xl p-4 flex flex-col gap-3 hover:border-dark-divider hover:bg-dark-raised/40 transition-all group"
    >
      {/* Header */}
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-7 h-7 rounded-lg bg-brand-600/15 border border-brand-500/20 flex items-center justify-center shrink-0">
          <Bot className="w-3.5 h-3.5 text-brand-400" />
        </div>
        <p className="text-xs font-semibold text-ink-primary truncate flex-1">{agent.agent_name}</p>
        <div className={clsx("w-2 h-2 rounded-full shrink-0", healthDot)} title={health} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        <div>
          <p className="text-[10px] text-ink-dim">Sessions</p>
          <p className="text-sm font-bold font-mono text-ink-primary">{agent.session_count.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-[10px] text-ink-dim">Error rate</p>
          <p className={clsx("text-sm font-bold font-mono", errorColor)}>{agent.error_rate_pct.toFixed(1)}%</p>
        </div>
        <div>
          <p className="text-[10px] text-ink-dim">Avg latency</p>
          <p className="text-xs font-mono text-ink-secondary">{formatMs(agent.avg_latency_ms)}</p>
        </div>
        <div>
          <p className="text-[10px] text-ink-dim">Avg cost</p>
          <p className="text-xs font-mono text-ink-secondary">{formatCost(agent.avg_cost_usd)}</p>
        </div>
      </div>

      {/* Footer */}
      {agent.last_seen && (
        <p className="text-[10px] text-ink-dim">
          Last run {formatDistanceToNow(new Date(agent.last_seen), { addSuffix: true })}
        </p>
      )}
    </Link>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { selectedProject, isLoading: projectLoading } = useProject();
  const PROJECT_ID = selectedProject?.id ?? "";

  const { data: summary, isLoading: sumLoading } = useQuery({
    queryKey: ["metrics-summary", PROJECT_ID],
    queryFn: () => metricsApi.summary(PROJECT_ID),
    enabled: !!PROJECT_ID,
  });

  const { data: agents = [] } = useQuery<AgentStat[]>({
    queryKey: ["metrics-agents", PROJECT_ID],
    queryFn: () => metricsApi.agents(PROJECT_ID),
    enabled: !!PROJECT_ID,
  });

  const { data: sessions } = useQuery({
    queryKey: ["sessions", PROJECT_ID, "dashboard"],
    queryFn: () => sessionsApi.list({ project_id: PROJECT_ID, page_size: 8 }),
    enabled: !!PROJECT_ID,
  });

  const { data: issuesData } = useQuery({
    queryKey: ["issues", PROJECT_ID, "dashboard"],
    queryFn: () => issuesApi.list({ project_id: PROJECT_ID }),
    enabled: !!PROJECT_ID,
  });

  const { data: alertRules = [] } = useQuery({
    queryKey: ["alert-rules", PROJECT_ID],
    queryFn: () => alertsApi.listRules(PROJECT_ID),
    enabled: !!PROJECT_ID,
  });

  const { data: trendData } = useQuery({
    queryKey: ["cost-over-time", PROJECT_ID, "day"],
    queryFn: () => metricsApi.costOverTime(PROJECT_ID, "day"),
    enabled: !!PROJECT_ID,
  });

  // Top issues (critical/high first, max 5)
  const topIssues = (issuesData?.groups ?? [])
    .sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
      return (order[a.severity] ?? 5) - (order[b.severity] ?? 5);
    })
    .slice(0, 5);

  const activeAlerts = alertRules.filter((r) => r.enabled).length;
  const criticalCount = (issuesData?.groups ?? []).filter((g) => g.severity === "critical").length;

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

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ink-primary">Dashboard</h1>
          <p className="text-xs text-ink-muted mt-0.5">Last 7 days · {selectedProject?.name}</p>
        </div>
        <div className="flex items-center gap-2">
          {criticalCount > 0 && (
            <Link href="/issues" className="flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-1.5 hover:bg-red-500/15 transition-colors">
              <ShieldAlert className="w-3.5 h-3.5" />
              {criticalCount} critical issue{criticalCount !== 1 ? "s" : ""}
            </Link>
          )}
          <Link href="/sessions">
            <Button variant="secondary" size="sm" icon={<Layers />}>
              View Sessions
            </Button>
          </Link>
        </div>
      </div>

      {/* ── Stats row ── */}
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
          label="Error Rate"
          value={sumLoading ? "—" : `${summary?.error_rate_pct.toFixed(1) ?? 0}%`}
          sub={`Loop rate: ${summary?.loop_rate_pct.toFixed(1) ?? "—"}%`}
          color={summary && summary.error_rate_pct > 10 ? "red" : summary && summary.loop_rate_pct > 5 ? "orange" : "default"}
          icon={<AlertTriangle />}
        />
      </div>

      {/* ── Middle row: issues + trend ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">

        {/* Issues panel */}
        <div className="bg-dark-surface border border-dark-border rounded-xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-dark-divider">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-ink-dim" />
              <span className="text-xs font-semibold text-ink-secondary">Active Issues</span>
            </div>
            <div className="flex items-center gap-2">
              {issuesData && (
                <span className="text-[10px] text-ink-dim">{issuesData.total_signals} signals</span>
              )}
              <Link href="/issues" className="text-[10px] text-brand-400 hover:text-brand-300 transition-colors">
                View all →
              </Link>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-dark-divider/50">
            {topIssues.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-400" />
                <p className="text-xs text-ink-muted">No issues detected</p>
              </div>
            ) : (
              topIssues.map((issue, i) => (
                <Link
                  key={i}
                  href="/issues"
                  className="flex items-start gap-3 px-4 py-3 hover:bg-dark-raised/50 transition-colors group"
                >
                  <span className="mt-0.5 shrink-0">{SEVERITY_ICON[issue.severity]}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-ink-secondary truncate group-hover:text-ink-primary transition-colors">
                      {issue.title}
                    </p>
                    <p className="text-[10px] text-ink-dim mt-0.5">
                      {issue.occurrence_count} occurrences · {issue.session_count} sessions
                    </p>
                  </div>
                  <ChevronRight className="w-3 h-3 text-ink-dim shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              ))
            )}
          </div>

          {/* Alerts footer */}
          <div className="px-4 py-2.5 border-t border-dark-divider bg-dark-raised/30 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] text-ink-muted">
              <Bell className="w-3 h-3" />
              {activeAlerts > 0 ? (
                <span><span className="text-ink-secondary font-medium">{activeAlerts}</span> active alert rule{activeAlerts !== 1 ? "s" : ""}</span>
              ) : (
                <span>No alert rules set up</span>
              )}
            </div>
            <Link href="/alerts" className="text-[10px] text-ink-dim hover:text-ink-muted transition-colors">
              Manage →
            </Link>
          </div>
        </div>

        {/* Trend chart */}
        <Card title="Sessions & Cost" subtitle="Daily breakdown · last 14 days">
          {!trendData?.series.length ? (
            <EmptyState icon={<TrendingUp />} title="No trend data yet" description="Start recording sessions to see cost and volume trends." />
          ) : (
            <ReactECharts
              option={{
                backgroundColor: "transparent",
                tooltip: {
                  trigger: "axis",
                  backgroundColor: "#18181b",
                  borderColor: "#27272a",
                  textStyle: { color: "#fafafa", fontSize: 12 },
                },
                legend: {
                  data: ["Sessions", "Cost ($)"],
                  textStyle: { color: "#71717a", fontSize: 11 },
                  right: 0,
                },
                xAxis: {
                  type: "category",
                  data: trendData.series.map((b) => b.bucket.slice(5, 10)),
                  axisLabel: { color: "#52525b", fontSize: 10 },
                  axisLine: { lineStyle: { color: "#27272a" } },
                  splitLine: { show: false },
                },
                yAxis: [
                  {
                    type: "value",
                    name: "Sessions",
                    nameTextStyle: { color: "#52525b", fontSize: 10 },
                    axisLabel: { color: "#52525b", fontSize: 10 },
                    splitLine: { lineStyle: { color: "#1f1f23" } },
                  },
                  {
                    type: "value",
                    name: "Cost ($)",
                    nameTextStyle: { color: "#52525b", fontSize: 10 },
                    axisLabel: { color: "#52525b", fontSize: 10, formatter: (v: number) => `$${v.toFixed(3)}` },
                    splitLine: { show: false },
                  },
                ],
                series: [
                  {
                    name: "Sessions",
                    type: "bar",
                    data: trendData.series.map((b) => b.session_count),
                    itemStyle: { color: "#3a5c9a", borderRadius: [3, 3, 0, 0] },
                    barMaxWidth: 28,
                  },
                  {
                    name: "Cost ($)",
                    type: "line",
                    yAxisIndex: 1,
                    data: trendData.series.map((b) => parseFloat(b.cost_usd.toFixed(5))),
                    lineStyle: { color: "#C8613A", width: 2 },
                    itemStyle: { color: "#C8613A" },
                    symbol: "circle",
                    symbolSize: 4,
                    smooth: true,
                  },
                ],
                grid: { left: 45, right: 55, bottom: 28, top: 40 },
              }}
              style={{ height: 220 }}
            />
          )}
        </Card>
      </div>

      {/* ── Agent health grid ── */}
      {agents.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-ink-secondary flex items-center gap-2">
              <Bot className="w-4 h-4 text-ink-dim" />
              Agent Health
              <span className="text-[10px] font-normal text-ink-dim">· {agents.length} agent{agents.length !== 1 ? "s" : ""}</span>
            </h2>
            <Link href="/sessions" className="text-[11px] text-ink-dim hover:text-ink-muted transition-colors">
              View all sessions →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {agents.map((agent) => (
              <AgentCard key={agent.agent_name} agent={agent} />
            ))}
          </div>
        </div>
      )}

      {/* ── Recent sessions ── */}
      <Card
        title="Recent Sessions"
        subtitle="Latest 8 agent runs"
        action={
          <Link href="/sessions">
            <Button variant="ghost" size="sm">View all →</Button>
          </Link>
        }
      >
        {!sessions?.items.length ? (
          <EmptyState
            icon={<Layers />}
            title="No sessions yet"
            description="Instrument your agent with the Dottle SDK to start tracking runs."
            action={
              <Link href="/settings">
                <Button variant="secondary" size="sm">Get API key</Button>
              </Link>
            }
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-ink-muted border-b border-dark-divider">
                <th className="text-left pb-2.5 pr-4 font-semibold">Agent</th>
                <th className="text-left pb-2.5 pr-4 font-semibold">Status</th>
                <th className="text-left pb-2.5 pr-4 font-semibold">Duration</th>
                <th className="text-left pb-2.5 pr-4 font-semibold">Cost</th>
                <th className="text-left pb-2.5 font-semibold">When</th>
              </tr>
            </thead>
            <tbody>
              {sessions.items.map((s) => (
                <tr key={s.id} className="table-row-hover border-b border-dark-divider/40 last:border-0">
                  <td className="py-2 pr-4">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/sessions/${s.id}`}
                        className="text-brand-400 hover:text-brand-300 font-medium text-xs hover:underline underline-offset-2"
                      >
                        {s.agent_name}
                      </Link>
                      {s.loop_detected && <LoopBadge />}
                    </div>
                  </td>
                  <td className="py-2 pr-4"><StatusBadge status={s.status} /></td>
                  <td className="py-2 pr-4 font-mono text-[11px] text-ink-secondary">
                    {s.duration_ms ? formatMs(s.duration_ms) : "—"}
                  </td>
                  <td className="py-2 pr-4 font-mono text-[11px] text-ink-secondary">
                    {s.total_cost_usd !== null ? formatCost(s.total_cost_usd) : "—"}
                  </td>
                  <td className="py-2 text-[11px] text-ink-muted">
                    {formatDistanceToNow(new Date(s.started_at), { addSuffix: true })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Tool failure summary (if any) */}
      {summary && summary.tool_failure_rate_pct > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
          <Wrench className="w-4 h-4 text-amber-400 shrink-0" />
          <p className="text-xs text-amber-300">
            Tool failure rate is <span className="font-bold">{summary.tool_failure_rate_pct.toFixed(1)}%</span> over the last 7 days.{" "}
            <Link href="/metrics" className="underline underline-offset-2 hover:text-amber-200">View breakdown →</Link>
          </p>
        </div>
      )}

    </div>
  );
}
