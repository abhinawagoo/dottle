"use client";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { sessionsApi } from "@/lib/api";
import { LoopBadge } from "@/components/ui/Badge";
import { SessionDetailPanel } from "@/components/session/SessionDetailPanel";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import {
  Search, X, Tag, User, Download, GitCompare,
  ChevronLeft, ChevronRight, Settings, Layers, ArrowRight,
} from "lucide-react";
import { useProject } from "@/lib/project-context";
import { Button } from "@/components/ui/Button";

function formatMs(ms: number | null): string {
  if (!ms) return "—";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
}

const STATUS_DOT: Record<string, string> = {
  completed: "bg-status-green",
  running:   "bg-blue-400",
  failed:    "bg-status-red",
  looping:   "bg-amber-400",
  timed_out: "bg-zinc-400",
};

export default function SessionsPage() {
  const { selectedProject } = useProject();
  const PROJECT_ID = selectedProject?.id ?? "";

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [compareIds, setCompareIds]               = useState<Set<string>>(new Set());

  const [page, setPage]                 = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [loopFilter, setLoopFilter]     = useState(false);
  const [search, setSearch]             = useState("");
  const [searchInput, setSearchInput]   = useState("");
  const [tagFilter, setTagFilter]       = useState("");
  const [tagInput, setTagInput]         = useState("");
  const [userFilter, setUserFilter]     = useState("");
  const [userInput, setUserInput]       = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["sessions", PROJECT_ID, page, statusFilter, loopFilter, search, tagFilter, userFilter],
    queryFn: () =>
      sessionsApi.list({
        project_id: PROJECT_ID,
        page,
        page_size: 50,
        status:       statusFilter || undefined,
        loop_detected: loopFilter  || undefined,
        search:       search       || undefined,
        tag:          tagFilter    || undefined,
        user_email:   userFilter   || undefined,
      }),
    enabled: !!PROJECT_ID,
  });

  const sessions   = data?.items ?? [];
  const totalPages = Math.ceil((data?.total ?? 0) / 50);
  const hasFilters = !!statusFilter || loopFilter || !!search || !!tagFilter || !!userFilter;

  // Detail-panel navigation
  const currentIndex = sessions.findIndex(s => s.id === selectedSessionId);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < sessions.length - 1;
  function goToPrev() { if (hasPrev) setSelectedSessionId(sessions[currentIndex - 1].id); }
  function goToNext() { if (hasNext) setSelectedSessionId(sessions[currentIndex + 1].id); }

  // Keyboard shortcuts when detail panel is open
  useEffect(() => {
    if (!selectedSessionId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape")     { setSelectedSessionId(null); }
      if (e.key === "ArrowLeft"  && hasPrev) { e.preventDefault(); goToPrev(); }
      if (e.key === "ArrowRight" && hasNext) { e.preventDefault(); goToNext(); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSessionId, hasPrev, hasNext, currentIndex]);

  function toggleCompare(id: string) {
    setCompareIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else if (next.size < 2) next.add(id);
      return next;
    });
  }

  function exportSessions(fmt: "csv" | "json") {
    const params = new URLSearchParams({ project_id: PROJECT_ID, format: fmt, limit: "5000" });
    if (statusFilter) params.set("status", statusFilter);
    if (tagFilter)    params.set("tag", tagFilter);
    if (userFilter)   params.set("user_email", userFilter);
    if (search)       params.set("search", search);
    if (loopFilter)   params.set("loop_detected", "true");
    window.open(
      `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1/sessions/export?${params}`,
      "_blank",
    );
  }

  function applySearch()     { setSearch(searchInput.trim()); setPage(1); }
  function applyTagFilter()  { setTagFilter(tagInput.trim()); setPage(1); }
  function applyUserFilter() { setUserFilter(userInput.trim()); setPage(1); }
  function applyAll()        { applySearch(); applyTagFilter(); applyUserFilter(); }

  function clearAll() {
    setStatusFilter(""); setLoopFilter(false);
    setSearch(""); setSearchInput("");
    setTagFilter(""); setTagInput("");
    setUserFilter(""); setUserInput("");
    setPage(1);
  }

  const selectedSession = sessions.find(s => s.id === selectedSessionId);
  const detailOpen      = !!selectedSessionId;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    // -m-6 cancels the parent <main> p-6 padding so we fill the full available height
    <div className="flex -m-6 h-[calc(100%+3rem)] overflow-hidden">

      {/* ── LEFT: Session list ────────────────────────────────────────────────── */}
      <div
        className={`flex flex-col border-r border-dark-border bg-dark-surface transition-all duration-200 ${
          detailOpen ? "w-[42%] shrink-0" : "flex-1"
        }`}
      >
        {/* Toolbar */}
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-dark-border flex-wrap">

          {/* Title + count */}
          <span className="text-[13px] font-semibold text-ink-primary whitespace-nowrap">Sessions</span>
          <span className="text-[10px] bg-dark-raised border border-dark-border px-1.5 py-0.5 rounded-full text-ink-muted tabular-nums mr-1">
            {data?.total ?? 0}
          </span>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-ink-dim pointer-events-none" />
            <input
              type="text" placeholder="Search…" value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && applyAll()}
              className="input-dark pl-6 pr-2 h-6 w-36 text-[11px]"
            />
          </div>

          {!detailOpen && (
            <>
              {/* Tag */}
              <div className="relative">
                <Tag className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-ink-dim pointer-events-none" />
                <input
                  type="text" placeholder="Tag…" value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && applyAll()}
                  className="input-dark pl-6 pr-2 h-6 w-24 text-[11px]"
                />
              </div>
              {/* User */}
              <div className="relative">
                <User className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-ink-dim pointer-events-none" />
                <input
                  type="text" placeholder="User…" value={userInput}
                  onChange={e => setUserInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && applyAll()}
                  className="input-dark pl-6 pr-2 h-6 w-28 text-[11px]"
                />
              </div>
            </>
          )}

          {/* Status */}
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            className="input-dark h-6 text-[11px]"
          >
            <option value="">All</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="looping">Looping</option>
            <option value="timed_out">Timed out</option>
          </select>

          {/* Loops */}
          <label className="flex items-center gap-1 text-[10px] text-ink-muted cursor-pointer whitespace-nowrap">
            <input
              type="checkbox" checked={loopFilter}
              onChange={e => { setLoopFilter(e.target.checked); setPage(1); }}
              className="rounded accent-brand-500 w-3 h-3"
            />
            Loops
          </label>

          {hasFilters && (
            <button
              onClick={clearAll}
              className="flex items-center gap-0.5 text-[10px] text-ink-dim hover:text-ink-muted transition-colors"
              title="Clear filters"
            >
              <X className="w-3 h-3" />
            </button>
          )}

          <div className="flex-1" />

          {/* Compare */}
          {compareIds.size === 2 && (
            <Link
              href={`/sessions/compare?a=${[...compareIds][0]}&b=${[...compareIds][1]}`}
              className="flex items-center gap-1 text-[10px] text-white bg-brand-600 hover:bg-brand-500 border border-brand-500 rounded px-2 h-6 transition-colors font-medium"
            >
              <GitCompare className="w-3 h-3" /> Compare
            </Link>
          )}
          {compareIds.size === 1 && (
            <span className="text-[10px] text-ink-dim border border-dark-border rounded px-2 h-6 flex items-center">
              +1 more
            </span>
          )}

          {/* Export */}
          {PROJECT_ID && !detailOpen && (
            <>
              <button onClick={() => exportSessions("csv")}
                className="flex items-center gap-1 text-[10px] text-ink-dim hover:text-ink-muted border border-dark-border rounded px-2 h-6 transition-colors"
                title="Export CSV">
                <Download className="w-3 h-3" /> CSV
              </button>
              <button onClick={() => exportSessions("json")}
                className="flex items-center gap-1 text-[10px] text-ink-dim hover:text-ink-muted border border-dark-border rounded px-2 h-6 transition-colors"
                title="Export JSON">
                <Download className="w-3 h-3" /> JSON
              </button>
            </>
          )}
        </div>

        {/* Active filter pills */}
        {hasFilters && (
          <div className="flex items-center gap-1 flex-wrap px-3 py-1.5 border-b border-dark-border text-[10px]">
            {search      && <span className="pill-filter">agent: {search}</span>}
            {statusFilter && <span className="pill-filter">status: {statusFilter}</span>}
            {loopFilter   && <span className="pill-filter">loops only</span>}
            {tagFilter    && <span className="pill-filter">tag: {tagFilter}</span>}
            {userFilter   && <span className="pill-filter">user: {userFilter}</span>}
          </div>
        )}

        {/* Table */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {isLoading ? (
            <div className="space-y-px p-2">
              {[...Array(10)].map((_, i) => <div key={i} className="shimmer h-8 w-full rounded" />)}
            </div>
          ) : !PROJECT_ID ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <Settings className="w-8 h-8 text-ink-dim mb-3" />
              <p className="text-sm font-semibold text-ink-secondary">No project configured</p>
              <p className="text-xs text-ink-muted mt-1 mb-4">Create a project in Settings to get your API key.</p>
              <Link href="/settings"><Button icon={<ArrowRight />}>Go to Settings</Button></Link>
            </div>
          ) : !sessions.length ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <Layers className="w-8 h-8 text-ink-dim mb-3" />
              <p className="text-sm font-semibold text-ink-secondary">No sessions found</p>
              <p className="text-xs text-ink-muted mt-1">{hasFilters ? "Try clearing filters." : "Instrument your agent to start tracking."}</p>
              {hasFilters && <button onClick={clearAll} className="mt-3 text-xs text-brand-400 hover:underline">Clear filters</button>}
            </div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 z-10 bg-dark-surface border-b border-dark-border">
                <tr className="text-[10px] text-ink-muted uppercase tracking-wide">
                  <th className="w-8 px-3 py-2 text-left">
                    <input type="checkbox" className="rounded border-dark-border accent-brand-500 w-3 h-3" />
                  </th>
                  <th className="px-3 py-2 text-left font-semibold">IDs / Names</th>
                  <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">Time</th>
                  <th className="px-3 py-2 text-left font-semibold whitespace-nowrap" title="Auto quality score (0–100)">Quality</th>
                  {!detailOpen && (
                    <>
                      <th className="px-3 py-2 text-left font-semibold">User</th>
                      <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">Duration</th>
                      <th className="px-3 py-2 text-left font-semibold">Cost</th>
                      <th className="px-3 py-2 text-left font-semibold">Tokens</th>
                      <th className="px-3 py-2 text-left font-semibold">Iters</th>
                    </>
                  )}
                  <th className="px-3 py-2 text-left font-semibold">Detail</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => {
                  const isSelected = selectedSessionId === s.id;
                  const isCompared = compareIds.has(s.id);
                  return (
                    <tr
                      key={s.id}
                      onClick={() => setSelectedSessionId(isSelected ? null : s.id)}
                      className={`border-b border-dark-divider/30 last:border-0 cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-brand-500/8 border-l-2 border-l-brand-500"
                          : isCompared
                          ? "bg-brand-500/5"
                          : "hover:bg-dark-raised/50"
                      }`}
                    >
                      {/* Checkbox */}
                      <td
                        className="w-8 px-3 py-2"
                        onClick={e => { e.stopPropagation(); toggleCompare(s.id); }}
                      >
                        <input
                          type="checkbox"
                          checked={isCompared}
                          readOnly
                          disabled={!isCompared && compareIds.size >= 2}
                          className="rounded border-dark-border accent-brand-500 w-3 h-3 pointer-events-none"
                        />
                      </td>

                      {/* IDs / Names */}
                      <td className="px-3 py-2 max-w-[180px]">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                              STATUS_DOT[s.status] ?? "bg-zinc-400"
                            }`}
                          />
                          <span className="text-ink-primary font-medium truncate text-[11px]">{s.agent_name}</span>
                          {s.loop_detected && <LoopBadge />}
                        </div>
                        <div className="flex items-center gap-1 mt-0.5 pl-3">
                          <span className="text-[9px] text-ink-dim font-mono truncate">{s.id.slice(0, 8)}…</span>
                          {s.issue_count > 0 && (
                            <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                              {s.issue_count}i
                            </span>
                          )}
                          {s.tags?.slice(0, detailOpen ? 1 : 2).map(t => (
                            <span key={t} className="text-[9px] px-1 py-0.5 rounded bg-brand-500/10 text-brand-400 border border-brand-500/20 truncate max-w-[60px]">
                              {t}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* Time */}
                      <td className="px-3 py-2 text-[10px] text-ink-muted whitespace-nowrap">
                        {formatDistanceToNow(new Date(s.started_at), { addSuffix: true })}
                      </td>

                      {/* Quality score */}
                      <td className="px-3 py-2">
                        {s.quality_score != null ? (
                          <span className={`text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded ${
                            s.quality_score >= 0.8 ? "text-green-700 dark:text-green-400 bg-green-500/10"
                            : s.quality_score >= 0.5 ? "text-amber-700 dark:text-amber-400 bg-amber-500/10"
                            : "text-red-700 dark:text-red-400 bg-red-500/10"
                          }`}>
                            {Math.round(s.quality_score * 100)}
                          </span>
                        ) : (
                          <span className="text-[10px] text-ink-dim">—</span>
                        )}
                      </td>

                      {/* Expanded columns — hidden when detail panel is open */}
                      {!detailOpen && (
                        <>
                          <td className="px-3 py-2 text-[10px] text-ink-muted max-w-[120px]">
                            {s.user_email ? (
                              <span title={s.user_email} className="truncate block">{s.user_email}</span>
                            ) : s.user_id ? (
                              <span title={s.user_id} className="font-mono truncate block">{s.user_id.slice(0, 12)}</span>
                            ) : (
                              <span className="text-ink-dim">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 font-mono text-[10px] text-ink-secondary whitespace-nowrap">{formatMs(s.duration_ms)}</td>
                          <td className="px-3 py-2 font-mono text-[10px] text-ink-secondary">
                            {s.total_cost_usd !== null ? `$${s.total_cost_usd.toFixed(4)}` : "—"}
                          </td>
                          <td className="px-3 py-2 text-[10px] text-ink-secondary tabular-nums">
                            {s.total_tokens?.toLocaleString() ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-[10px] text-ink-secondary tabular-nums">{s.iteration_count}</td>
                        </>
                      )}

                      {/* Detail preview */}
                      <td className="px-3 py-2 text-[10px] max-w-[200px]">
                        <span className="truncate block">
                          {s.error_message
                            ? <span className="text-status-red">{s.error_message.slice(0, detailOpen ? 40 : 80)}</span>
                            : s.loop_reason
                            ? <span className="text-amber-400">{s.loop_reason.slice(0, detailOpen ? 40 : 80)}</span>
                            : <span className="text-ink-dim">—</span>
                          }
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {sessions.length > 0 && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-dark-border text-[10px] text-ink-muted">
            <span>{data?.total} sessions · page {page}/{totalPages}</span>
            <div className="flex items-center gap-1">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="p-1 rounded hover:bg-dark-raised disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="w-3 h-3" />
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="p-1 rounded hover:bg-dark-raised disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── RIGHT: Session detail panel ────────────────────────────────────────── */}
      {detailOpen && (
        <div className="flex-1 flex flex-col overflow-hidden bg-dark-bg min-w-0">
          {/* Panel header */}
          <div className="flex items-center gap-2 px-4 py-2 border-b border-dark-border bg-dark-surface shrink-0">
            {/* Prev / Next */}
            <button
              onClick={goToPrev} disabled={!hasPrev}
              className="p-1 rounded text-ink-muted hover:text-ink-primary hover:bg-dark-raised disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Previous (←)"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={goToNext} disabled={!hasNext}
              className="p-1 rounded text-ink-muted hover:text-ink-primary hover:bg-dark-raised disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Next (→)"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <div className="w-px h-4 bg-dark-divider" />

            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[selectedSession?.status ?? ""] ?? "bg-zinc-400"}`}
              />
              <span className="text-[13px] font-semibold text-ink-primary truncate">
                {selectedSession?.agent_name}
              </span>
              <span className="text-[11px] text-ink-muted shrink-0">
                {currentIndex + 1} / {sessions.length}
              </span>
            </div>

            {/* Open full page */}
            <Link
              href={`/sessions/${selectedSessionId}`}
              className="text-[11px] text-ink-muted hover:text-ink-secondary transition-colors shrink-0"
              title="Open full page"
            >
              <ArrowRight className="w-4 h-4" />
            </Link>

            {/* Close */}
            <button
              onClick={() => setSelectedSessionId(null)}
              className="p-1 rounded text-ink-dim hover:text-ink-primary hover:bg-dark-raised transition-colors shrink-0"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Session content */}
          <div className="flex-1 overflow-y-auto overscroll-contain">
            <SessionDetailPanel sessionId={selectedSessionId} />
          </div>
        </div>
      )}
    </div>
  );
}
