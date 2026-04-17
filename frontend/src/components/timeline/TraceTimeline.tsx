"use client";
import { useState } from "react";
import type { Span, Session } from "@/lib/types";
import { SpanTypeBadge, StatusBadge } from "@/components/ui/Badge";
import { clsx } from "clsx";

interface TraceTimelineProps {
  session: Session;
  spans: Span[];
}

const SPAN_COLORS: Record<string, string> = {
  llm:       "bg-brand-500",
  tool:      "bg-amber-400",
  retrieval: "bg-sky-500",
  agent:     "bg-violet-500",
  custom:    "bg-zinc-500",
};

function formatMs(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export default function TraceTimeline({ session, spans }: TraceTimelineProps) {
  const [selectedSpan, setSelectedSpan] = useState<Span | null>(null);

  const sessionStart = new Date(session.started_at).getTime();
  const sessionEnd = session.ended_at
    ? new Date(session.ended_at).getTime()
    : sessionStart + (session.duration_ms ?? 1);
  const totalDuration = sessionEnd - sessionStart || 1;

  const sortedSpans = [...spans].sort(
    (a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
  );

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex items-center gap-4 flex-wrap">
        {Object.entries(SPAN_COLORS).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1.5 text-[11px] text-ink-muted">
            <div className={clsx("w-2.5 h-2.5 rounded-sm", color)} />
            {type}
          </div>
        ))}
        <div className="flex items-center gap-1.5 text-[11px] text-ink-muted">
          <div className="w-2.5 h-2.5 rounded-sm bg-status-red" />
          error
        </div>
      </div>

      {/* Timeline container */}
      <div className="rounded-xl border border-dark-border overflow-hidden bg-dark-bg">
        {/* Time ruler */}
        <div className="flex items-center h-7 border-b border-dark-divider bg-dark-surface/50 px-4">
          <div className="w-[200px] shrink-0" />
          <div className="flex-1 relative">
            {[0, 25, 50, 75, 100].map(pct => (
              <span
                key={pct}
                className="absolute text-[10px] text-ink-dim font-mono -translate-x-1/2"
                style={{ left: `${pct}%` }}
              >
                {formatMs(Math.round(totalDuration * pct / 100))}
              </span>
            ))}
          </div>
          <div className="w-14 shrink-0" />
        </div>

        {/* Spans */}
        <div>
          {sortedSpans.map((span, i) => {
            const spanStart = new Date(span.started_at).getTime();
            const spanEnd = span.ended_at
              ? new Date(span.ended_at).getTime()
              : spanStart + (span.duration_ms ?? 50);

            const leftPct = Math.max(0, ((spanStart - sessionStart) / totalDuration) * 100);
            const widthPct = Math.max(0.2, ((spanEnd - spanStart) / totalDuration) * 100);

            const colorClass = span.status === "error" ? "bg-red-500" : (SPAN_COLORS[span.span_type] ?? "bg-zinc-500");
            const isSelected = selectedSpan?.id === span.id;

            return (
              <div
                key={span.id}
                className={clsx(
                  "flex items-center h-9 px-4 cursor-pointer border-b border-dark-divider/50 transition-colors",
                  isSelected ? "bg-dark-raised" : i % 2 === 0 ? "bg-transparent" : "bg-dark-surface/30",
                  "hover:bg-dark-raised"
                )}
                onClick={() => setSelectedSpan(isSelected ? null : span)}
              >
                {/* Label */}
                <div className="w-[200px] shrink-0 flex items-center gap-2 pr-4 min-w-0">
                  <SpanTypeBadge type={span.span_type} />
                  <span className="text-xs text-ink-secondary truncate">{span.name}</span>
                </div>

                {/* Bar */}
                <div className="flex-1 relative h-4">
                  <div
                    className={clsx("trace-bar", colorClass)}
                    style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                    title={`${span.name} — ${formatMs(span.duration_ms)}`}
                  />
                </div>

                {/* Duration */}
                <div className="w-14 shrink-0 text-right text-[11px] text-ink-muted font-mono">
                  {formatMs(span.duration_ms)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Span detail panel */}
      {selectedSpan && (
        <div className="bg-dark-raised rounded-xl border border-dark-border p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 flex-wrap">
              <SpanTypeBadge type={selectedSpan.span_type} />
              <h4 className="text-sm font-semibold text-ink-primary">{selectedSpan.name}</h4>
              <StatusBadge status={selectedSpan.status} />
            </div>
            <button
              onClick={() => setSelectedSpan(null)}
              className="text-xs text-ink-muted hover:text-ink-secondary px-2 py-1 rounded hover:bg-dark-surface transition-colors"
            >
              close ×
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-[10px] text-ink-muted uppercase tracking-wider mb-1">Duration</p>
              <p className="text-sm font-mono text-ink-primary">{formatMs(selectedSpan.duration_ms)}</p>
            </div>
            {selectedSpan.model && (
              <div>
                <p className="text-[10px] text-ink-muted uppercase tracking-wider mb-1">Model</p>
                <p className="text-sm font-mono text-ink-primary">{selectedSpan.model}</p>
              </div>
            )}
            {selectedSpan.cost_usd !== null && (
              <div>
                <p className="text-[10px] text-ink-muted uppercase tracking-wider mb-1">Cost</p>
                <p className="text-sm font-mono text-ink-primary">${selectedSpan.cost_usd?.toFixed(6)}</p>
              </div>
            )}
            {selectedSpan.input_tokens && (
              <div>
                <p className="text-[10px] text-ink-muted uppercase tracking-wider mb-1">Tokens in/out</p>
                <p className="text-sm font-mono text-ink-primary">
                  {selectedSpan.input_tokens} / {selectedSpan.output_tokens}
                </p>
              </div>
            )}
          </div>

          {selectedSpan.error_message && (
            <div className="mt-4">
              <p className="text-[10px] text-ink-muted uppercase tracking-wider mb-1">Error</p>
              <pre className="text-xs font-mono text-red-400 bg-red-500/5 border border-red-500/15 rounded-lg p-3 overflow-auto max-h-24">
                {selectedSpan.error_message}
              </pre>
            </div>
          )}

          {Object.keys(selectedSpan.attributes).length > 0 && (
            <div className="mt-4">
              <p className="text-[10px] text-ink-muted uppercase tracking-wider mb-1">Attributes</p>
              <pre className="text-xs font-mono text-ink-secondary bg-dark-surface border border-dark-border rounded-lg p-3 overflow-auto max-h-32">
                {JSON.stringify(selectedSpan.attributes, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
