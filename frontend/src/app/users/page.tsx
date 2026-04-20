"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { metricsApi, sessionsApi } from "@/lib/api";
import { UserStat } from "@/lib/types";
import { useProject } from "@/lib/project-context";
import { formatDistanceToNow, formatDistanceToNow as fdt } from "date-fns";
import { SideDrawer } from "@/components/ui/SideDrawer";
import { SessionDetailPanel } from "@/components/session/SessionDetailPanel";
import { EmptyState } from "@/components/ui/Card";
import {
  Users, TrendingUp, DollarSign, AlertTriangle,
  ChevronRight, User, ArrowUpDown, Settings, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import Link from "next/link";
import { StatusBadge, LoopBadge } from "@/components/ui/Badge";

function formatMs(ms: number) {
  if (!ms) return "—";
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function formatCost(v: number) {
  return `$${v.toFixed(4)}`;
}

type SortKey = "session_count" | "total_cost_usd" | "failure_rate_pct" | "avg_latency_ms" | "last_seen";

// ── User row ──────────────────────────────────────────────────────────────────

function UserRow({ user, onClick, selected }: {
  user: UserStat;
  onClick: () => void;
  selected: boolean;
}) {
  const failureColor =
    user.failure_rate_pct > 30 ? "text-status-red" :
    user.failure_rate_pct > 10 ? "text-amber-400" : "text-ink-secondary";

  return (
    <tr
      onClick={onClick}
      className={`table-row-hover border-b border-dark-divider/40 last:border-0 cursor-pointer ${selected ? "bg-brand-500/5" : ""}`}
    >
      <td className="py-3 pr-4">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-dark-raised border border-dark-border flex items-center justify-center shrink-0">
            <User className="w-3.5 h-3.5 text-ink-dim" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-ink-primary truncate max-w-[200px]">
              {user.user_email ?? user.user_id ?? user.user_key}
            </p>
            {user.user_email && user.user_id && user.user_id !== user.user_email && (
              <p className="text-[10px] text-ink-dim font-mono truncate max-w-[200px]">{user.user_id}</p>
            )}
          </div>
        </div>
      </td>
      <td className="py-3 pr-4 text-xs text-ink-secondary tabular-nums font-semibold">
        {user.session_count.toLocaleString()}
      </td>
      <td className="py-3 pr-4 font-mono text-[11px] text-ink-secondary">
        {formatCost(user.total_cost_usd)}
      </td>
      <td className="py-3 pr-4">
        <span className={`text-[11px] font-semibold tabular-nums ${failureColor}`}>
          {user.failure_rate_pct.toFixed(1)}%
        </span>
      </td>
      <td className="py-3 pr-4">
        <span className={`text-[11px] tabular-nums ${user.loop_rate_pct > 10 ? "text-amber-400" : "text-ink-secondary"}`}>
          {user.loop_rate_pct.toFixed(1)}%
        </span>
      </td>
      <td className="py-3 pr-4 font-mono text-[11px] text-ink-secondary">
        {formatMs(user.avg_latency_ms)}
      </td>
      <td className="py-3 text-[11px] text-ink-muted whitespace-nowrap">
        {user.last_seen ? formatDistanceToNow(new Date(user.last_seen), { addSuffix: true }) : "—"}
      </td>
      <td className="py-3 pl-2">
        <ChevronRight className="w-3.5 h-3.5 text-ink-dim" />
      </td>
    </tr>
  );
}

// ── User detail drawer ────────────────────────────────────────────────────────

function UserDetailContent({
  user,
  projectId,
  onSelectSession,
}: {
  user: UserStat;
  projectId: string;
  onSelectSession: (id: string) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["user-sessions", user.user_key, projectId],
    queryFn: () =>
      sessionsApi.list({
        project_id: projectId,
        user_email: user.user_email ?? undefined,
        user_id: !user.user_email ? (user.user_id ?? undefined) : undefined,
        page_size: 50,
      }),
    enabled: !!projectId,
  });

  const failureColor =
    user.failure_rate_pct > 30 ? "text-status-red" :
    user.failure_rate_pct > 10 ? "text-amber-400" : "text-status-green";

  return (
    <div className="p-5 space-y-5">
      {/* User header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-brand-600/20 border border-brand-500/30 flex items-center justify-center shrink-0">
          <User className="w-5 h-5 text-brand-400" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink-primary truncate">
            {user.user_email ?? user.user_id ?? user.user_key}
          </p>
          {user.user_id && user.user_id !== user.user_email && (
            <p className="text-[11px] text-ink-dim font-mono">{user.user_id}</p>
          )}
          {user.last_seen && (
            <p className="text-[11px] text-ink-muted mt-0.5">
              Last active {formatDistanceToNow(new Date(user.last_seen), { addSuffix: true })}
            </p>
          )}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-dark-raised border border-dark-border rounded-xl p-3">
          <p className="text-[10px] font-semibold text-ink-muted uppercase tracking-widest mb-1">Sessions</p>
          <p className="text-xl font-bold text-ink-primary tabular-nums">{user.session_count.toLocaleString()}</p>
        </div>
        <div className="bg-dark-raised border border-dark-border rounded-xl p-3">
          <p className="text-[10px] font-semibold text-ink-muted uppercase tracking-widest mb-1">Total Cost</p>
          <p className="text-xl font-bold text-ink-primary tabular-nums font-mono">{formatCost(user.total_cost_usd)}</p>
        </div>
        <div className="bg-dark-raised border border-dark-border rounded-xl p-3">
          <p className="text-[10px] font-semibold text-ink-muted uppercase tracking-widest mb-1">Failure Rate</p>
          <p className={`text-xl font-bold tabular-nums ${failureColor}`}>{user.failure_rate_pct.toFixed(1)}%</p>
        </div>
        <div className="bg-dark-raised border border-dark-border rounded-xl p-3">
          <p className="text-[10px] font-semibold text-ink-muted uppercase tracking-widest mb-1">Avg Latency</p>
          <p className="text-xl font-bold text-ink-primary tabular-nums">{formatMs(user.avg_latency_ms)}</p>
        </div>
      </div>

      {/* Sessions table */}
      <div>
        <p className="text-[10px] font-semibold text-ink-muted uppercase tracking-widest mb-3">
          Recent Sessions
        </p>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => <div key={i} className="shimmer h-10 w-full rounded-lg" />)}
          </div>
        ) : !data?.items?.length ? (
          <p className="py-8 text-center text-sm text-ink-muted">No sessions found for this user.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-ink-muted border-b border-dark-divider">
                <th className="text-left pb-2.5 pr-3 font-semibold">Agent</th>
                <th className="text-left pb-2.5 pr-3 font-semibold">Status</th>
                <th className="text-left pb-2.5 pr-3 font-semibold">Cost</th>
                <th className="text-left pb-2.5 font-semibold">When</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map(s => (
                <tr
                  key={s.id}
                  onClick={() => onSelectSession(s.id)}
                  className="table-row-hover border-b border-dark-divider/40 last:border-0 cursor-pointer group"
                >
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-brand-400 font-medium group-hover:underline underline-offset-2">
                        {s.agent_name}
                      </span>
                      {s.loop_detected && <LoopBadge />}
                    </div>
                  </td>
                  <td className="py-2.5 pr-3"><StatusBadge status={s.status} /></td>
                  <td className="py-2.5 pr-3 font-mono text-[11px] text-ink-secondary">
                    {s.total_cost_usd != null ? formatCost(s.total_cost_usd) : "—"}
                  </td>
                  <td className="py-2.5 text-[11px] text-ink-muted whitespace-nowrap">
                    {fdt(new Date(s.started_at), { addSuffix: true })}
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const { selectedProject } = useProject();
  const PROJECT_ID = selectedProject?.id ?? "";

  const [sortKey, setSortKey]         = useState<SortKey>("session_count");
  const [sortAsc, setSortAsc]         = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserStat | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["users", PROJECT_ID],
    queryFn: () => metricsApi.users(PROJECT_ID),
    enabled: !!PROJECT_ID,
    refetchInterval: 60_000,
  });

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(false); }
  }

  const sorted = [...(data?.users ?? [])].sort((a, b) => {
    const va = sortKey === "last_seen"
      ? (a.last_seen ? new Date(a.last_seen).getTime() : 0)
      : (a[sortKey] as number);
    const vb = sortKey === "last_seen"
      ? (b.last_seen ? new Date(b.last_seen).getTime() : 0)
      : (b[sortKey] as number);
    return sortAsc ? va - vb : vb - va;
  });

  // Summary stats
  const totalSessions = data?.users.reduce((s, u) => s + u.session_count, 0) ?? 0;
  const totalCost     = data?.users.reduce((s, u) => s + u.total_cost_usd, 0) ?? 0;
  const avgFailure    = data?.users.length
    ? data.users.reduce((s, u) => s + u.failure_rate_pct, 0) / data.users.length
    : 0;

  function SortHeader({ label, k }: { label: string; k: SortKey }) {
    return (
      <th className="text-left pb-2.5 pr-4 font-semibold">
        <button
          onClick={() => toggleSort(k)}
          className={`flex items-center gap-1 hover:text-ink-secondary transition-colors ${sortKey === k ? "text-brand-400" : ""}`}
        >
          {label}
          <ArrowUpDown className="w-2.5 h-2.5" />
        </button>
      </th>
    );
  }

  return (
    <>
      <div className="space-y-5 max-w-7xl mx-auto">

        {/* Header */}
        <div>
          <h1 className="text-lg font-semibold text-ink-primary">Users</h1>
          <p className="text-xs text-ink-muted mt-0.5">
            Per-user agent usage, cost, and failure breakdown · last 7 days
          </p>
        </div>

        {/* Summary cards */}
        {data && data.users.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-3.5 h-3.5 text-ink-dim" />
                <p className="text-[10px] font-semibold text-ink-muted uppercase tracking-widest">Users</p>
              </div>
              <p className="text-2xl font-bold text-ink-primary">{data.users.length}</p>
            </div>
            <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-3.5 h-3.5 text-ink-dim" />
                <p className="text-[10px] font-semibold text-ink-muted uppercase tracking-widest">Total Sessions</p>
              </div>
              <p className="text-2xl font-bold text-ink-primary">{totalSessions.toLocaleString()}</p>
            </div>
            <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-3.5 h-3.5 text-ink-dim" />
                <p className="text-[10px] font-semibold text-ink-muted uppercase tracking-widest">Total Cost</p>
              </div>
              <p className="text-2xl font-bold text-ink-primary font-mono">{formatCost(totalCost)}</p>
            </div>
            <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-3.5 h-3.5 text-ink-dim" />
                <p className="text-[10px] font-semibold text-ink-muted uppercase tracking-widest">Avg Failure Rate</p>
              </div>
              <p className={`text-2xl font-bold ${avgFailure > 20 ? "text-status-red" : avgFailure > 10 ? "text-amber-400" : "text-status-green"}`}>
                {avgFailure.toFixed(1)}%
              </p>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-dark-surface border border-dark-border rounded-xl overflow-hidden">
          {isLoading ? (
            <div className="p-5 space-y-2">
              {[...Array(8)].map((_, i) => <div key={i} className="shimmer h-10 w-full rounded-lg" />)}
            </div>
          ) : !PROJECT_ID ? (
            <div className="p-5">
              <EmptyState
                icon={<Settings />}
                title="No project configured"
                description="Create a project in Settings to start tracking users."
                action={<Link href="/settings"><Button icon={<ArrowRight />}>Go to Settings</Button></Link>}
              />
            </div>
          ) : !sorted.length ? (
            <div className="p-5">
              <EmptyState
                icon={<Users />}
                title="No user data yet"
                description="Pass user_email or user_id when starting sessions to see per-user analytics."
              />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-ink-muted border-b border-dark-divider px-5">
                  <th className="text-left pb-2.5 pr-4 font-semibold pl-5 pt-4">User</th>
                  <SortHeader label="Sessions"     k="session_count" />
                  <SortHeader label="Total Cost"   k="total_cost_usd" />
                  <SortHeader label="Failure Rate" k="failure_rate_pct" />
                  <th className="text-left pb-2.5 pr-4 font-semibold text-[11px] text-ink-muted">Loop Rate</th>
                  <SortHeader label="Avg Latency"  k="avg_latency_ms" />
                  <SortHeader label="Last Seen"    k="last_seen" />
                  <th className="pb-2.5 pr-5" />
                </tr>
              </thead>
              <tbody>
                {sorted.map(user => (
                  <UserRow
                    key={user.user_key}
                    user={user}
                    selected={selectedUser?.user_key === user.user_key}
                    onClick={() => setSelectedUser(user)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* User detail drawer */}
      <SideDrawer
        open={!!selectedUser && !selectedSessionId}
        onClose={() => setSelectedUser(null)}
        width="660px"
        title={selectedUser?.user_email ?? selectedUser?.user_id ?? selectedUser?.user_key}
        subtitle="User activity breakdown"
      >
        {selectedUser && (
          <UserDetailContent
            user={selectedUser}
            projectId={PROJECT_ID}
            onSelectSession={(id) => setSelectedSessionId(id)}
          />
        )}
      </SideDrawer>

      {/* Session detail drawer (nested) */}
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
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                Back to user
              </button>
            </div>
            <SessionDetailPanel sessionId={selectedSessionId} />
          </>
        )}
      </SideDrawer>
    </>
  );
}
