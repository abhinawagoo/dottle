"use client";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { sessionsApi } from "@/lib/api";
import { SessionDetail } from "@/lib/types";
import { StatusBadge } from "@/components/ui/Badge";
import Link from "next/link";
import { ArrowLeft, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { format } from "date-fns";

function fmt(ms: number | null) {
  if (!ms) return "—";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
}
function fmtCost(v: number | null) {
  return v != null ? `$${v.toFixed(6)}` : "—";
}
function fmtNum(v: number | null | undefined) {
  return v != null ? v.toLocaleString() : "—";
}

// ── Delta indicator ────────────────────────────────────────────────────────────
function Delta({
  a, b, lowerIsBetter = false,
}: { a: number | null; b: number | null; lowerIsBetter?: boolean }) {
  if (a == null || b == null) return null;
  const diff = b - a;
  const pct = a !== 0 ? Math.round((diff / a) * 100) : 0;
  if (diff === 0) return <span className="text-[10px] text-ink-dim flex items-center gap-0.5"><Minus className="w-3 h-3" /> same</span>;

  const better = lowerIsBetter ? diff < 0 : diff > 0;
  return (
    <span className={`text-[10px] flex items-center gap-0.5 font-medium ${better ? "text-status-green" : "text-status-red"}`}>
      {diff > 0
        ? <TrendingUp className="w-3 h-3" />
        : <TrendingDown className="w-3 h-3" />}
      {diff > 0 ? "+" : ""}{pct}%
    </span>
  );
}

// ── Metric row ─────────────────────────────────────────────────────────────────
function Row({
  label, aVal, bVal, aDelta, bDelta, mono = false,
}: {
  label: string;
  aVal: React.ReactNode;
  bVal: React.ReactNode;
  aDelta?: React.ReactNode;
  bDelta?: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <tr className="border-b border-dark-divider/40 last:border-0">
      <td className="py-2.5 pr-4 text-[11px] text-ink-muted font-medium whitespace-nowrap">{label}</td>
      <td className={`py-2.5 pr-4 text-[11px] ${mono ? "font-mono" : ""} text-ink-secondary`}>
        <div className="flex items-center gap-2">{aVal}{aDelta}</div>
      </td>
      <td className={`py-2.5 text-[11px] ${mono ? "font-mono" : ""} text-ink-secondary`}>
        <div className="flex items-center gap-2">{bVal}{bDelta}</div>
      </td>
    </tr>
  );
}

// ── Span diff ──────────────────────────────────────────────────────────────────
function SpanDiff({ a, b }: { a: SessionDetail; b: SessionDetail }) {
  const aSpanNames = new Set(a.spans.map(s => s.name));
  const bSpanNames = new Set(b.spans.map(s => s.name));
  const allNames = [...new Set([...aSpanNames, ...bSpanNames])];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[11px] text-ink-muted border-b border-dark-divider">
            <th className="text-left pb-2 pr-4 font-semibold">Span</th>
            <th className="text-left pb-2 pr-4 font-semibold">{a.agent_name} A</th>
            <th className="text-left pb-2 font-semibold">{b.agent_name} B</th>
          </tr>
        </thead>
        <tbody>
          {allNames.map(name => {
            const sa = a.spans.filter(s => s.name === name);
            const sb = b.spans.filter(s => s.name === name);
            const inA = sa.length > 0;
            const inB = sb.length > 0;
            const aAvgMs = inA ? Math.round(sa.reduce((acc, s) => acc + (s.duration_ms ?? 0), 0) / sa.length) : null;
            const bAvgMs = inB ? Math.round(sb.reduce((acc, s) => acc + (s.duration_ms ?? 0), 0) / sb.length) : null;
            return (
              <tr key={name} className="border-b border-dark-divider/40 last:border-0">
                <td className="py-2 pr-4 text-ink-secondary font-mono">{name}</td>
                <td className={`py-2 pr-4 ${!inA ? "text-ink-dim" : "text-ink-secondary"}`}>
                  {inA ? (
                    <span className="flex items-center gap-2">
                      ×{sa.length} {aAvgMs != null && <span className="text-ink-muted font-mono">{fmt(aAvgMs)}</span>}
                      {sa.some(s => s.status === "error") && <span className="text-status-red text-[10px]">err</span>}
                    </span>
                  ) : "—"}
                </td>
                <td className={`py-2 ${!inB ? "text-ink-dim" : "text-ink-secondary"}`}>
                  {inB ? (
                    <span className="flex items-center gap-2">
                      ×{sb.length} {bAvgMs != null && <span className="text-ink-muted font-mono">{fmt(bAvgMs)}</span>}
                      {sb.some(s => s.status === "error") && <span className="text-status-red text-[10px]">err</span>}
                    </span>
                  ) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ComparePage() {
  const params = useSearchParams();
  const idA = params.get("a") ?? "";
  const idB = params.get("b") ?? "";

  const { data: sessionA, isLoading: loadA } = useQuery({
    queryKey: ["session", idA],
    queryFn: () => sessionsApi.get(idA),
    enabled: !!idA,
  });

  const { data: sessionB, isLoading: loadB } = useQuery({
    queryKey: ["session", idB],
    queryFn: () => sessionsApi.get(idB),
    enabled: !!idB,
  });

  const loading = loadA || loadB;

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/sessions" className="flex items-center gap-1.5 text-[11px] text-ink-muted hover:text-ink-secondary transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Sessions
        </Link>
        <span className="text-ink-dim">/</span>
        <h1 className="text-base font-semibold text-ink-primary">Session Comparison</h1>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-4">
          {[...Array(2)].map((_, i) => <div key={i} className="shimmer h-64 rounded-xl" />)}
        </div>
      ) : !sessionA || !sessionB ? (
        <div className="text-center py-16 text-sm text-ink-muted">
          Could not load one or both sessions.
        </div>
      ) : (
        <>
          {/* Session identity row */}
          <div className="grid grid-cols-2 gap-4">
            {[sessionA, sessionB].map((s, i) => (
              <div key={s.id} className="bg-dark-surface border border-dark-border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-bold text-ink-dim uppercase tracking-widest">
                    {i === 0 ? "A" : "B"}
                  </span>
                  <StatusBadge status={s.status} />
                </div>
                <p className="text-sm font-semibold text-ink-primary">{s.agent_name}</p>
                <p className="text-[10px] font-mono text-ink-dim mt-0.5">{s.id.slice(0, 16)}…</p>
                <p className="text-[11px] text-ink-muted mt-1">
                  {format(new Date(s.started_at), "MMM d, yyyy · HH:mm")}
                </p>
                {s.agent_version && (
                  <span className="text-[10px] font-mono text-ink-dim">v{s.agent_version}</span>
                )}
              </div>
            ))}
          </div>

          {/* Metrics comparison */}
          <div className="bg-dark-surface border border-dark-border rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-dark-border">
              <p className="text-[10px] font-semibold text-ink-muted uppercase tracking-widest">Metrics</p>
            </div>
            <div className="px-5 py-1">
              <table className="w-full">
                <thead>
                  <tr className="text-[11px] text-ink-muted border-b border-dark-divider">
                    <th className="text-left py-2.5 pr-4 font-semibold w-36">Metric</th>
                    <th className="text-left py-2.5 pr-4 font-semibold">
                      A — {sessionA.agent_name}
                    </th>
                    <th className="text-left py-2.5 font-semibold">
                      B — {sessionB.agent_name}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <Row
                    label="Duration"
                    aVal={fmt(sessionA.duration_ms)}
                    bVal={fmt(sessionB.duration_ms)}
                    bDelta={<Delta a={sessionA.duration_ms} b={sessionB.duration_ms} lowerIsBetter />}
                    mono
                  />
                  <Row
                    label="Total Cost"
                    aVal={fmtCost(sessionA.total_cost_usd)}
                    bVal={fmtCost(sessionB.total_cost_usd)}
                    bDelta={<Delta a={sessionA.total_cost_usd} b={sessionB.total_cost_usd} lowerIsBetter />}
                    mono
                  />
                  <Row
                    label="Total Tokens"
                    aVal={fmtNum(sessionA.total_tokens)}
                    bVal={fmtNum(sessionB.total_tokens)}
                    bDelta={<Delta a={sessionA.total_tokens ?? null} b={sessionB.total_tokens ?? null} lowerIsBetter />}
                    mono
                  />
                  <Row
                    label="Input Tokens"
                    aVal={fmtNum(sessionA.input_tokens)}
                    bVal={fmtNum(sessionB.input_tokens)}
                    mono
                  />
                  <Row
                    label="Output Tokens"
                    aVal={fmtNum(sessionA.output_tokens)}
                    bVal={fmtNum(sessionB.output_tokens)}
                    mono
                  />
                  <Row
                    label="LLM Calls"
                    aVal={sessionA.iteration_count}
                    bVal={sessionB.iteration_count}
                    bDelta={<Delta a={sessionA.iteration_count} b={sessionB.iteration_count} lowerIsBetter />}
                    mono
                  />
                  <Row
                    label="Spans"
                    aVal={sessionA.spans.length}
                    bVal={sessionB.spans.length}
                    mono
                  />
                  <Row
                    label="Issues"
                    aVal={sessionA.issues.length}
                    bVal={sessionB.issues.length}
                    bDelta={<Delta a={sessionA.issues.length} b={sessionB.issues.length} lowerIsBetter />}
                  />
                  <Row
                    label="Loop"
                    aVal={sessionA.loop_detected ? <span className="text-amber-400">Yes</span> : "No"}
                    bVal={sessionB.loop_detected ? <span className="text-amber-400">Yes</span> : "No"}
                  />
                  {(sessionA.error_message || sessionB.error_message) && (
                    <Row
                      label="Error"
                      aVal={sessionA.error_message
                        ? <span className="text-status-red text-[10px] font-mono truncate max-w-[200px] block">{sessionA.error_message}</span>
                        : <span className="text-ink-dim">—</span>}
                      bVal={sessionB.error_message
                        ? <span className="text-status-red text-[10px] font-mono truncate max-w-[200px] block">{sessionB.error_message}</span>
                        : <span className="text-ink-dim">—</span>}
                    />
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Span diff */}
          <div className="bg-dark-surface border border-dark-border rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-dark-border">
              <p className="text-[10px] font-semibold text-ink-muted uppercase tracking-widest">Span Breakdown</p>
            </div>
            <div className="px-5 py-3">
              <SpanDiff a={sessionA} b={sessionB} />
            </div>
          </div>

          {/* Open both links */}
          <div className="flex items-center gap-3 text-[11px] text-ink-muted">
            <Link href={`/sessions/${sessionA.id}`} className="hover:text-brand-400 transition-colors">
              Open A in full page →
            </Link>
            <Link href={`/sessions/${sessionB.id}`} className="hover:text-brand-400 transition-colors">
              Open B in full page →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
