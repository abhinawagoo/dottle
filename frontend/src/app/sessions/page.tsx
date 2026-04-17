"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { sessionsApi } from "@/lib/api";
import { StatusBadge, LoopBadge } from "@/components/ui/Badge";
import { Card, EmptyState } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { Layers, ChevronLeft, ChevronRight, Settings, Search, X, ArrowRight, Tag, User, Download } from "lucide-react";
import { useProject } from "@/lib/project-context";

function formatMs(ms: number | null): string {
  if (!ms) return "—";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
}

function TagPill({ tag }: { tag: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-brand-500/10 text-brand-400 border border-brand-500/20">
      <Tag className="w-2.5 h-2.5" />
      {tag}
    </span>
  );
}

export default function SessionsPage() {
  const { selectedProject, isLoading: projectLoading } = useProject();
  const PROJECT_ID = selectedProject?.id ?? "";

  function exportSessions(fmt: "csv" | "json") {
    const params = new URLSearchParams({ project_id: PROJECT_ID, format: fmt, limit: "5000" });
    if (statusFilter) params.set("status", statusFilter);
    if (tagFilter) params.set("tag", tagFilter);
    if (userFilter) params.set("user_email", userFilter);
    if (search) params.set("search", search);
    if (loopFilter) params.set("loop_detected", "true");
    window.open(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1/sessions/export?${params}`, "_blank");
  }
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [loopFilter, setLoopFilter] = useState(false);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [userInput, setUserInput] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["sessions", PROJECT_ID, page, statusFilter, loopFilter, search, tagFilter, userFilter],
    queryFn: () =>
      sessionsApi.list({
        project_id: PROJECT_ID,
        page,
        page_size: 25,
        status: statusFilter || undefined,
        loop_detected: loopFilter || undefined,
        search: search || undefined,
        tag: tagFilter || undefined,
        user_email: userFilter || undefined,
      }),
    enabled: !!PROJECT_ID,
  });

  const totalPages = Math.ceil((data?.total ?? 0) / 25);
  const hasFilters = !!statusFilter || loopFilter || !!search || !!tagFilter || !!userFilter;

  function applySearch() {
    setSearch(searchInput);
    setPage(1);
  }

  function applyTagFilter() {
    setTagFilter(tagInput.trim());
    setPage(1);
  }

  function applyUserFilter() {
    setUserFilter(userInput.trim());
    setPage(1);
  }

  function clearAll() {
    setStatusFilter("");
    setLoopFilter(false);
    setSearch("");
    setSearchInput("");
    setTagFilter("");
    setTagInput("");
    setUserFilter("");
    setUserInput("");
    setPage(1);
  }

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-lg font-semibold text-ink-primary">Sessions</h1>
            <p className="text-xs text-ink-muted mt-0.5">
              {data?.total ?? 0} total agent runs
            </p>
          </div>
          {PROJECT_ID && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => exportSessions("csv")}
                className="flex items-center gap-1 text-[11px] text-ink-muted hover:text-ink-secondary border border-dark-border rounded px-2 py-1 transition-colors"
                title="Export as CSV"
              >
                <Download className="w-3 h-3" /> CSV
              </button>
              <button
                onClick={() => exportSessions("json")}
                className="flex items-center gap-1 text-[11px] text-ink-muted hover:text-ink-secondary border border-dark-border rounded px-2 py-1 transition-colors"
                title="Export as JSON"
              >
                <Download className="w-3 h-3" /> JSON
              </button>
            </div>
          )}
        </div>

        {/* Filters row */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Agent name search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-dim pointer-events-none" />
            <input
              type="text"
              placeholder="Agent name…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applySearch()}
              className="input-dark pl-8 pr-3 w-40 text-xs"
            />
          </div>

          {/* Tag filter */}
          <div className="relative">
            <Tag className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-dim pointer-events-none" />
            <input
              type="text"
              placeholder="Tag…"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyTagFilter()}
              className="input-dark pl-8 pr-3 w-32 text-xs"
            />
          </div>

          {/* User filter */}
          <div className="relative">
            <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-dim pointer-events-none" />
            <input
              type="text"
              placeholder="User email…"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyUserFilter()}
              className="input-dark pl-8 pr-3 w-36 text-xs"
            />
          </div>

          <Button variant="secondary" size="sm" onClick={() => { applySearch(); applyTagFilter(); applyUserFilter(); }}>
            Search
          </Button>

          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="input-dark w-auto text-xs"
          >
            <option value="">All statuses</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="looping">Looping</option>
          </select>

          <label className="flex items-center gap-2 text-xs text-ink-muted cursor-pointer select-none whitespace-nowrap">
            <input
              type="checkbox"
              checked={loopFilter}
              onChange={(e) => { setLoopFilter(e.target.checked); setPage(1); }}
              className="rounded border-dark-border bg-dark-raised accent-brand-500"
            />
            Loops only
          </label>

          {hasFilters && (
            <button
              onClick={clearAll}
              className="flex items-center gap-1 text-[11px] text-ink-muted hover:text-ink-secondary transition-colors"
            >
              <X className="w-3 h-3" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Active filter pills */}
      {hasFilters && (
        <div className="flex items-center gap-2 flex-wrap text-[11px]">
          <span className="text-ink-dim">Filters:</span>
          {search && <span className="pill-filter">agent: {search}</span>}
          {statusFilter && <span className="pill-filter">status: {statusFilter}</span>}
          {loopFilter && <span className="pill-filter">loops only</span>}
          {tagFilter && <span className="pill-filter">tag: {tagFilter}</span>}
          {userFilter && <span className="pill-filter">user: {userFilter}</span>}
        </div>
      )}

      <Card>
        {isLoading ? (
          <div className="space-y-2 py-2">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="shimmer h-9 w-full" />
            ))}
          </div>
        ) : !PROJECT_ID ? (
          <EmptyState
            icon={<Settings />}
            title="No project configured"
            description="Create a project in Settings to get your API key and start tracking sessions."
            action={<Link href="/settings"><Button icon={<ArrowRight />}>Go to Settings</Button></Link>}
          />
        ) : !data?.items.length ? (
          <EmptyState
            icon={<Layers />}
            title="No sessions found"
            description={
              hasFilters
                ? "Try clearing the filters to see all sessions."
                : "Instrument your agent with the Agentloop SDK to start tracking runs."
            }
            action={
              hasFilters ? (
                <Button variant="secondary" onClick={clearAll}>Clear filters</Button>
              ) : (
                <Link href="/settings"><Button variant="secondary">Get API key</Button></Link>
              )
            }
          />
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-ink-muted border-b border-dark-divider">
                  <th className="text-left pb-2.5 pr-4 font-semibold">Agent</th>
                  <th className="text-left pb-2.5 pr-4 font-semibold">Status</th>
                  <th className="text-left pb-2.5 pr-4 font-semibold">User</th>
                  <th className="text-left pb-2.5 pr-4 font-semibold">Duration</th>
                  <th className="text-left pb-2.5 pr-4 font-semibold">Cost</th>
                  <th className="text-left pb-2.5 pr-4 font-semibold">Tokens</th>
                  <th className="text-left pb-2.5 pr-4 font-semibold">Iters</th>
                  <th className="text-left pb-2.5 font-semibold">Started</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((s) => (
                  <tr key={s.id} className="table-row-hover border-b border-dark-divider/40 last:border-0">
                    <td className="py-2.5 pr-4 max-w-[220px]">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/sessions/${s.id}`}
                            className="text-brand-400 hover:text-brand-400/80 font-medium text-xs hover:underline underline-offset-2 truncate"
                          >
                            {s.agent_name}
                          </Link>
                          {s.loop_detected && <LoopBadge />}
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {s.external_id && (
                            <span className="text-[10px] text-ink-dim font-mono">#{s.external_id}</span>
                          )}
                          {s.agent_version && (
                            <span className="text-[10px] text-ink-dim font-mono bg-dark-border/40 px-1 py-0.5 rounded">
                              v{s.agent_version}
                            </span>
                          )}
                          {s.tags?.slice(0, 2).map((t) => <TagPill key={t} tag={t} />)}
                          {(s.tags?.length ?? 0) > 2 && (
                            <span className="text-[10px] text-ink-dim">+{s.tags.length - 2}</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 pr-4"><StatusBadge status={s.status} /></td>
                    <td className="py-2.5 pr-4 text-[11px] text-ink-muted max-w-[140px] truncate">
                      {s.user_email ? (
                        <span title={s.user_email} className="truncate block">{s.user_email}</span>
                      ) : s.user_id ? (
                        <span title={s.user_id} className="font-mono truncate block">{s.user_id}</span>
                      ) : (
                        <span className="text-ink-dim">—</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-[11px] text-ink-secondary">{formatMs(s.duration_ms)}</td>
                    <td className="py-2.5 pr-4 font-mono text-[11px] text-ink-secondary">
                      {s.total_cost_usd !== null ? `$${s.total_cost_usd.toFixed(4)}` : "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-[11px] text-ink-secondary tabular-nums">
                      {s.total_tokens?.toLocaleString() ?? "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-[11px] text-ink-secondary tabular-nums">{s.iteration_count}</td>
                    <td className="py-2.5 text-[11px] text-ink-muted whitespace-nowrap">
                      {formatDistanceToNow(new Date(s.started_at), { addSuffix: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-dark-divider">
              <span className="text-[11px] text-ink-muted">
                Page {page} of {totalPages} · {data.total} results
              </span>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)} icon={<ChevronLeft />}>Prev</Button>
                <Button variant="secondary" size="sm" disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}>
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
