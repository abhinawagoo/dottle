"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { sessionsApi } from "@/lib/api";
import { StatusBadge, LoopBadge } from "@/components/ui/Badge";
import { Card, EmptyState } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SideDrawer } from "@/components/ui/SideDrawer";
import { SessionDetailPanel } from "@/components/session/SessionDetailPanel";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import {
  Layers, ChevronLeft, ChevronRight, Settings, Search, X,
  ArrowRight, Tag, User, Download, GitCompare,
} from "lucide-react";
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
  const { selectedProject } = useProject();
  const PROJECT_ID = selectedProject?.id ?? "";

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());

  const [page, setPage]               = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [loopFilter, setLoopFilter]   = useState(false);
  const [search, setSearch]           = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [tagFilter, setTagFilter]     = useState("");
  const [tagInput, setTagInput]       = useState("");
  const [userFilter, setUserFilter]   = useState("");
  const [userInput, setUserInput]     = useState("");

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

  const sessions = data?.items ?? [];
  const totalPages = Math.ceil((data?.total ?? 0) / 25);
  const hasFilters = !!statusFilter || loopFilter || !!search || !!tagFilter || !!userFilter;

  // Drawer navigation
  const currentIndex = sessions.findIndex(s => s.id === selectedSessionId);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < sessions.length - 1;
  function goToPrev() { if (hasPrev) setSelectedSessionId(sessions[currentIndex - 1].id); }
  function goToNext() { if (hasNext) setSelectedSessionId(sessions[currentIndex + 1].id); }

  function toggleCompare(id: string) {
    setCompareIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 2) next.add(id);
      return next;
    });
  }

  function exportSessions(fmt: "csv" | "json") {
    const params = new URLSearchParams({ project_id: PROJECT_ID, format: fmt, limit: "5000" });
    if (statusFilter) params.set("status", statusFilter);
    if (tagFilter) params.set("tag", tagFilter);
    if (userFilter) params.set("user_email", userFilter);
    if (search) params.set("search", search);
    if (loopFilter) params.set("loop_detected", "true");
    window.open(
      `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1/sessions/export?${params}`,
      "_blank"
    );
  }

  function applySearch()    { setSearch(searchInput); setPage(1); }
  function applyTagFilter() { setTagFilter(tagInput.trim()); setPage(1); }
  function applyUserFilter(){ setUserFilter(userInput.trim()); setPage(1); }
  function applyAll()       { applySearch(); applyTagFilter(); applyUserFilter(); }

  function clearAll() {
    setStatusFilter(""); setLoopFilter(false);
    setSearch(""); setSearchInput("");
    setTagFilter(""); setTagInput("");
    setUserFilter(""); setUserInput("");
    setPage(1);
  }

  const selectedSession = sessions.find(s => s.id === selectedSessionId);

  return (
    <>
      <div className="space-y-3 max-w-7xl mx-auto">

        {/* ── Compact toolbar ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 flex-wrap">

          {/* Title + count */}
          <div className="flex items-center gap-2 mr-1">
            <h1 className="text-sm font-semibold text-ink-primary">Sessions</h1>
            <span className="text-[11px] text-ink-dim bg-dark-raised border border-dark-border px-2 py-0.5 rounded-full tabular-nums">
              {data?.total ?? 0}
            </span>
          </div>

          {/* Divider */}
          <div className="w-px h-4 bg-dark-divider mx-0.5" />

          {/* Search — agent name */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-ink-dim pointer-events-none" />
            <input
              type="text"
              placeholder="Agent…"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && applyAll()}
              className="input-dark pl-6 pr-2 h-7 w-28 text-[11px]"
            />
          </div>

          {/* Tag */}
          <div className="relative">
            <Tag className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-ink-dim pointer-events-none" />
            <input
              type="text"
              placeholder="Tag…"
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && applyAll()}
              className="input-dark pl-6 pr-2 h-7 w-24 text-[11px]"
            />
          </div>

          {/* User email */}
          <div className="relative">
            <User className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-ink-dim pointer-events-none" />
            <input
              type="text"
              placeholder="User…"
              value={userInput}
              onChange={e => setUserInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && applyAll()}
              className="input-dark pl-6 pr-2 h-7 w-28 text-[11px]"
            />
          </div>

          {/* Status */}
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            className="input-dark h-7 text-[11px] w-auto pr-6"
          >
            <option value="">All statuses</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="looping">Looping</option>
            <option value="timed_out">Timed out</option>
          </select>

          {/* Loops only toggle */}
          <label className="flex items-center gap-1.5 text-[11px] text-ink-muted cursor-pointer select-none whitespace-nowrap h-7 px-2 rounded border border-dark-border hover:border-dark-border/80 transition-colors">
            <input
              type="checkbox"
              checked={loopFilter}
              onChange={e => { setLoopFilter(e.target.checked); setPage(1); }}
              className="rounded border-dark-border bg-dark-raised accent-brand-500 w-3 h-3"
            />
            Loops
          </label>

          {/* Clear filters */}
          {hasFilters && (
            <button
              onClick={clearAll}
              className="flex items-center gap-1 text-[11px] text-ink-muted hover:text-ink-secondary h-7 px-2 rounded border border-dark-border/60 transition-colors"
            >
              <X className="w-3 h-3" /> Clear
            </button>
          )}

          {/* Push rest to the right */}
          <div className="flex-1" />

          {/* Compare */}
          {compareIds.size === 2 && (
            <Link
              href={`/sessions/compare?a=${[...compareIds][0]}&b=${[...compareIds][1]}`}
              className="flex items-center gap-1 text-[11px] text-white bg-brand-600 hover:bg-brand-500 border border-brand-500 rounded-md px-2 h-7 transition-colors font-medium"
            >
              <GitCompare className="w-3 h-3" /> Compare (2)
            </Link>
          )}
          {compareIds.size === 1 && (
            <span className="text-[11px] text-ink-dim border border-dark-border rounded-md px-2 h-7 flex items-center">
              Select 1 more
            </span>
          )}

          {/* Export */}
          {PROJECT_ID && (
            <>
              <button
                onClick={() => exportSessions("csv")}
                className="flex items-center gap-1 text-[11px] text-ink-muted hover:text-ink-secondary border border-dark-border rounded-md px-2 h-7 transition-colors"
                title="Export CSV"
              >
                <Download className="w-3 h-3" /> CSV
              </button>
              <button
                onClick={() => exportSessions("json")}
                className="flex items-center gap-1 text-[11px] text-ink-muted hover:text-ink-secondary border border-dark-border rounded-md px-2 h-7 transition-colors"
                title="Export JSON"
              >
                <Download className="w-3 h-3" /> JSON
              </button>
            </>
          )}
        </div>

        {/* Active filter pills */}
        {hasFilters && (
          <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
            {search && <span className="pill-filter">agent: {search}</span>}
            {statusFilter && <span className="pill-filter">status: {statusFilter}</span>}
            {loopFilter && <span className="pill-filter">loops only</span>}
            {tagFilter && <span className="pill-filter">tag: {tagFilter}</span>}
            {userFilter && <span className="pill-filter">user: {userFilter}</span>}
          </div>
        )}

        {/* ── Table ─────────────────────────────────────────────────────────── */}
        <Card>
          {isLoading ? (
            <div className="space-y-2 py-2">
              {[...Array(8)].map((_, i) => <div key={i} className="shimmer h-9 w-full" />)}
            </div>
          ) : !PROJECT_ID ? (
            <EmptyState
              icon={<Settings />}
              title="No project configured"
              description="Create a project in Settings to get your API key and start tracking sessions."
              action={<Link href="/settings"><Button icon={<ArrowRight />}>Go to Settings</Button></Link>}
            />
          ) : !sessions.length ? (
            <EmptyState
              icon={<Layers />}
              title="No sessions found"
              description={hasFilters ? "Try clearing the filters." : "Instrument your agent to start tracking runs."}
              action={
                hasFilters
                  ? <Button variant="secondary" onClick={clearAll}>Clear filters</Button>
                  : <Link href="/settings"><Button variant="secondary">Get API key</Button></Link>
              }
            />
          ) : (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] text-ink-muted border-b border-dark-divider">
                    <th className="pb-2.5 pr-3 w-5" />
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
                  {sessions.map((s) => (
                    <tr
                      key={s.id}
                      onClick={() => setSelectedSessionId(s.id)}
                      className={`table-row-hover border-b border-dark-divider/40 last:border-0 cursor-pointer ${
                        selectedSessionId === s.id ? "bg-brand-500/5 border-l-2 border-l-brand-500" : ""
                      } ${compareIds.has(s.id) ? "bg-brand-500/5" : ""}`}
                    >
                      <td className="py-2.5 pr-3 w-5" onClick={e => { e.stopPropagation(); toggleCompare(s.id); }}>
                        <input
                          type="checkbox"
                          checked={compareIds.has(s.id)}
                          onChange={() => toggleCompare(s.id)}
                          disabled={!compareIds.has(s.id) && compareIds.size >= 2}
                          className="rounded border-dark-border bg-dark-raised accent-brand-500"
                          onClick={e => e.stopPropagation()}
                        />
                      </td>
                      <td className="py-2.5 pr-4 max-w-[220px]">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className="text-brand-400 font-medium text-xs truncate">{s.agent_name}</span>
                            {s.loop_detected && <LoopBadge />}
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {s.agent_version && (
                              <span className="text-[10px] text-ink-dim font-mono bg-dark-border/40 px-1 py-0.5 rounded">
                                v{s.agent_version}
                              </span>
                            )}
                            {s.tags?.slice(0, 2).map(t => <TagPill key={t} tag={t} />)}
                            {(s.tags?.length ?? 0) > 2 && (
                              <span className="text-[10px] text-ink-dim">+{s.tags.length - 2}</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-1.5">
                          <StatusBadge status={s.status} />
                          {s.issue_count > 0 && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                              {s.issue_count} issue{s.issue_count !== 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 pr-4 text-[11px] text-ink-muted max-w-[140px]">
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
                  Page {page} of {totalPages} · {data?.total} results
                </span>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)} icon={<ChevronLeft />}>Prev</Button>
                  <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                    Next <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>

      {/* ── Session detail drawer ───────────────────────────────────────────── */}
      <SideDrawer
        open={!!selectedSessionId}
        onClose={() => setSelectedSessionId(null)}
        title={selectedSession?.agent_name}
        subtitle={
          selectedSession
            ? `${currentIndex + 1} of ${sessions.length} · ${selectedSession.status}`
            : undefined
        }
        onPrev={goToPrev}
        onNext={goToNext}
        hasPrev={hasPrev}
        hasNext={hasNext}
      >
        {selectedSessionId && (
          <SessionDetailPanel sessionId={selectedSessionId} />
        )}
      </SideDrawer>
    </>
  );
}
