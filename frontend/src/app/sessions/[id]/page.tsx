"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { sessionsApi } from "@/lib/api";
import { Span, SessionIssue, IssueSeverity } from "@/lib/types";
import { StatusBadge, LoopBadge, SpanTypeBadge } from "@/components/ui/Badge";
import { Card, StatCard } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import SessionAIChat from "@/components/ui/SessionAIChat";
import TraceTimeline from "@/components/timeline/TraceTimeline";
import { format } from "date-fns";
import Link from "next/link";
import {
  ArrowLeft, AlertTriangle, XCircle, Layers,
  ChevronDown, ChevronRight, Radio, ShieldAlert,
  AlertCircle, Info, TrendingUp, Zap, Tag, User, FlaskConical, Sparkles,
} from "lucide-react";

interface Props { params: { id: string } }

function formatMs(ms: number | null) {
  if (!ms) return "—";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
}

/* ── Issue severity config ─────────────────────────────────────────────────── */
const SEVERITY_CONFIG: Record<IssueSeverity, { icon: React.ReactNode; color: string; bg: string; border: string }> = {
  critical: { icon: <XCircle className="w-4 h-4" />,      color: "text-red-400",    bg: "bg-red-500/5",    border: "border-red-500/20" },
  high:     { icon: <ShieldAlert className="w-4 h-4" />,  color: "text-orange-400", bg: "bg-orange-500/5", border: "border-orange-500/20" },
  medium:   { icon: <AlertCircle className="w-4 h-4" />,  color: "text-amber-400",  bg: "bg-amber-500/5",  border: "border-amber-500/20" },
  low:      { icon: <TrendingUp className="w-4 h-4" />,   color: "text-sky-400",    bg: "bg-sky-500/5",    border: "border-sky-500/20" },
  info:     { icon: <Info className="w-4 h-4" />,         color: "text-ink-muted",  bg: "bg-dark-raised",  border: "border-dark-border" },
};

/* ── Issues panel ──────────────────────────────────────────────────────────── */
function IssueCard({ issue }: { issue: SessionIssue }) {
  const [open, setOpen] = useState(false);
  const cfg = SEVERITY_CONFIG[issue.severity] ?? SEVERITY_CONFIG.info;

  // Parse markdown-style bold (**text**) and inline code (`text`) for display
  const renderDescription = (text: string) => {
    return text.split("\n").map((line, i) => (
      <span key={i} className="block">
        {line.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((part, j) => {
          if (part.startsWith("**") && part.endsWith("**")) {
            return <strong key={j} className="font-semibold text-ink-primary">{part.slice(2, -2)}</strong>;
          }
          if (part.startsWith("`") && part.endsWith("`")) {
            return <code key={j} className="font-mono text-[10px] bg-dark-bg border border-dark-border rounded px-1">{part.slice(1, -1)}</code>;
          }
          return part;
        })}
      </span>
    ));
  };

  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} overflow-hidden`}>
      <button
        className="w-full flex items-start gap-3 px-4 py-3.5 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <span className={`mt-0.5 shrink-0 ${cfg.color}`}>{cfg.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold ${cfg.color}`}>{issue.title}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium uppercase tracking-wide ${cfg.color} ${cfg.border} bg-transparent`}>
              {issue.severity}
            </span>
          </div>
        </div>
        <span className="ml-2 shrink-0 text-ink-dim">
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </span>
      </button>
      {open && (
        <div className={`px-4 pb-4 pt-0 text-[12px] leading-relaxed text-ink-secondary border-t ${cfg.border}`}>
          <div className="pt-3 space-y-0.5">
            {renderDescription(issue.description)}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Expandable span row ───────────────────────────────────────────────────── */
function SpanRow({ span }: { span: Span }) {
  const [open, setOpen] = useState(false);
  const hasDetail = !!(span.input_text || span.output_text || span.error_message || Object.keys(span.attributes).length > 0);

  return (
    <>
      <tr
        className={`border-b border-dark-divider/40 last:border-0 transition-colors ${hasDetail ? "cursor-pointer" : ""}`}
        onClick={() => hasDetail && setOpen((o) => !o)}
      >
        <td className="py-2 pr-3 w-5">
          {hasDetail ? (
            open
              ? <ChevronDown className="w-3 h-3 text-ink-dim" />
              : <ChevronRight className="w-3 h-3 text-ink-dim" />
          ) : <span className="w-3 h-3 inline-block" />}
        </td>
        <td className="py-2 pr-3"><SpanTypeBadge type={span.span_type} /></td>
        <td className="py-2 pr-3 font-medium text-xs text-ink-secondary">{span.name}</td>
        <td className="py-2 pr-3"><StatusBadge status={span.status} /></td>
        <td className="py-2 pr-3 font-mono text-[11px] text-ink-muted">{formatMs(span.duration_ms)}</td>
        <td className="py-2 pr-3 text-[11px] text-ink-muted">{span.model ?? "—"}</td>
        <td className="py-2 pr-3 text-[11px] font-mono text-ink-muted">
          {span.input_tokens != null ? `↑${span.input_tokens}` : "—"}
          {span.output_tokens != null ? ` ↓${span.output_tokens}` : ""}
        </td>
        <td className="py-2 font-mono text-[11px] text-ink-muted">
          {span.cost_usd != null ? `$${Number(span.cost_usd).toFixed(6)}` : "—"}
        </td>
      </tr>

      {open && hasDetail && (
        <tr className="bg-dark-surface/50">
          <td colSpan={8} className="pb-4 pt-1 px-4">
            <div className="space-y-3">
              {/* Prompt */}
              {span.input_text && (
                <div>
                  <p className="text-[10px] font-semibold text-ink-dim uppercase tracking-widest mb-1.5">
                    Prompt / Input
                  </p>
                  <pre className="text-[11px] font-mono text-ink-secondary bg-dark-bg border border-dark-border rounded-lg p-3 whitespace-pre-wrap break-words leading-relaxed max-h-64 overflow-auto">
                    {span.input_text}
                  </pre>
                </div>
              )}

              {/* Response */}
              {span.output_text && (
                <div>
                  <p className="text-[10px] font-semibold text-brand-500 uppercase tracking-widest mb-1.5">
                    Response / Output
                  </p>
                  <pre className="text-[11px] font-mono text-ink-secondary bg-dark-bg border border-brand-600/30 rounded-lg p-3 whitespace-pre-wrap break-words leading-relaxed max-h-64 overflow-auto">
                    {span.output_text}
                  </pre>
                </div>
              )}

              {/* Error */}
              {span.error_message && (
                <div>
                  <p className="text-[10px] font-semibold text-status-red uppercase tracking-widest mb-1.5">
                    Error — {span.error_type}
                  </p>
                  <pre className="text-[11px] font-mono text-status-red/80 bg-status-red/5 border border-status-red/20 rounded-lg p-3 whitespace-pre-wrap break-words">
                    {span.error_message}
                  </pre>
                </div>
              )}

              {/* Attributes */}
              {Object.keys(span.attributes).length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-ink-dim uppercase tracking-widest mb-1.5">
                    Attributes
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(span.attributes).map(([k, v]) => (
                      <span key={k} className="text-[10px] font-mono bg-dark-raised border border-dark-border rounded px-2 py-1 text-ink-secondary">
                        <span className="text-ink-dim">{k}:</span> {String(v)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────────── */
export default function SessionDetailPage({ params }: Props) {
  const [chatOpen, setChatOpen] = useState(false);
  const isLive = (status: string) => status === "running" || status === "looping";

  const { data: session, isLoading, error } = useQuery({
    queryKey: ["session", params.id],
    queryFn: () => sessionsApi.get(params.id),
    // Poll every 2s while the session is still running
    refetchInterval: (query) => {
      const s = query.state.data;
      return s && isLive(s.status) ? 2000 : false;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-7xl mx-auto">
        <div className="shimmer h-5 w-36" />
        <div className="shimmer h-8 w-64" />
        <div className="grid grid-cols-5 gap-3">
          {[...Array(5)].map((_, i) => <div key={i} className="shimmer h-20" />)}
        </div>
        <div className="shimmer h-64 w-full" />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <XCircle className="w-8 h-8 text-status-red/60" />
        <p className="text-sm text-ink-muted">Session not found</p>
        <Link href="/sessions">
          <Button variant="secondary" size="sm" icon={<ArrowLeft />}>Back to Sessions</Button>
        </Link>
      </div>
    );
  }

  const sortedSpans = [...session.spans].sort(
    (a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
  );
  const live = isLive(session.status);

  return (
    <div className="relative">
    {/* Main content — shift right when chat is open */}
    <div className={`transition-all duration-300 ${chatOpen ? "mr-[390px]" : ""}`}>
    <div className="space-y-5 max-w-7xl mx-auto">

      {/* Back + header */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <Link
            href="/sessions"
            className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted hover:text-ink-secondary transition-colors"
          >
            <ArrowLeft className="w-3 h-3" /> Back to Sessions
          </Link>
          <div className="flex items-center gap-2">
            <a
              href={`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1/sessions/${session.id}/fixture?lang=python`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-[11px] text-ink-muted hover:text-ink-secondary border border-dark-border rounded px-2.5 py-1.5 transition-colors"
              title="Generate deterministic Python test fixture from this session"
            >
              <FlaskConical className="w-3 h-3" /> Python fixture
            </a>
            <a
              href={`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1/sessions/${session.id}/fixture?lang=typescript`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-[11px] text-ink-muted hover:text-ink-secondary border border-dark-border rounded px-2.5 py-1.5 transition-colors"
              title="Generate deterministic TypeScript test fixture from this session"
            >
              <FlaskConical className="w-3 h-3" /> TS fixture
            </a>
            <button
              onClick={() => setChatOpen(o => !o)}
              className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded border transition-all ${
                chatOpen
                  ? "bg-brand-600/20 border-brand-500/40 text-brand-400"
                  : "border-dark-border text-ink-muted hover:text-brand-400 hover:border-brand-500/30"
              }`}
            >
              <Sparkles className="w-3 h-3" /> Ask AI
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="text-lg font-semibold text-ink-primary">{session.agent_name}</h1>
          <StatusBadge status={session.status} />
          {session.loop_detected && <LoopBadge />}
          {live && (
            <span className="flex items-center gap-1.5 text-[11px] text-status-green font-semibold animate-pulse">
              <Radio className="w-3 h-3" /> Live
            </span>
          )}
        </div>
        <p className="text-[11px] text-ink-dim font-mono mt-1">{session.id}</p>
        <p className="text-xs text-ink-muted mt-1">
          {format(new Date(session.started_at), "MMM d, yyyy · HH:mm:ss")}
          {session.ended_at && ` → ${format(new Date(session.ended_at), "HH:mm:ss")}`}
        </p>

        {/* Attribution + tags row */}
        <div className="flex items-center gap-3 flex-wrap mt-2">
          {(session.user_email || session.user_id) && (
            <span className="flex items-center gap-1 text-[11px] text-ink-muted">
              <User className="w-3 h-3" />
              {session.user_email ?? session.user_id}
            </span>
          )}
          {session.agent_version && (
            <span className="text-[10px] font-mono text-ink-dim bg-dark-raised border border-dark-border px-1.5 py-0.5 rounded">
              v{session.agent_version}
            </span>
          )}
          {session.tags?.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-brand-500/10 text-brand-400 border border-brand-500/20">
              <Tag className="w-2.5 h-2.5" />
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* Loop warning */}
      {session.loop_detected && (
        <div className="flex items-start gap-3 bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
          <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-400">Loop Detected</p>
            <p className="text-xs text-amber-400/70 mt-0.5">{session.loop_reason}</p>
          </div>
        </div>
      )}

      {/* Error */}
      {session.error_message && (
        <div className="flex items-start gap-3 bg-red-500/5 border border-red-500/20 rounded-xl p-4">
          <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-400">{session.error_type ?? "Error"}</p>
            <p className="text-xs font-mono text-red-400/70 mt-0.5">{session.error_message}</p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard label="Duration" value={formatMs(session.duration_ms)} />
        <StatCard
          label="Total Cost"
          value={session.total_cost_usd !== null ? `$${Number(session.total_cost_usd).toFixed(6)}` : "—"}
        />
        <StatCard
          label="Tokens"
          value={session.total_tokens?.toLocaleString() ?? "—"}
          sub={`in: ${session.input_tokens ?? 0} · out: ${session.output_tokens ?? 0}`}
        />
        <StatCard label="LLM Iterations" value={session.iteration_count} />
        <StatCard label="Total Spans" value={session.spans.length} />
      </div>

      {/* Issues panel */}
      {session.issues && session.issues.length > 0 && (
        <Card
          title={
            <span className="flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              Issues Detected
            </span>
          }
          subtitle={`${session.issues.length} issue${session.issues.length !== 1 ? "s" : ""} found — click to expand`}
        >
          <div className="space-y-2">
            {session.issues.map((issue) => (
              <IssueCard key={issue.id} issue={issue} />
            ))}
          </div>
        </Card>
      )}

      {/* Trace timeline */}
      <Card title="Trace Timeline" subtitle="Click any span to inspect">
        {session.spans.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <Layers className="w-8 h-8 text-ink-dim" />
            <p className="text-sm text-ink-muted">
              {live ? "Waiting for spans…" : "No spans recorded for this session"}
            </p>
          </div>
        ) : (
          <TraceTimeline session={session} spans={session.spans} />
        )}
      </Card>

      {/* Span table — expandable rows */}
      <Card title="Spans" subtitle={`${session.spans.length} operations · click a row to see prompt & response`}>
        {sortedSpans.length === 0 ? (
          <p className="text-sm text-ink-muted py-4 text-center">No spans yet</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[11px] text-ink-muted border-b border-dark-divider">
                <th className="pb-2.5 pr-2 w-5" />
                <th className="text-left pb-2.5 pr-3 font-semibold">Type</th>
                <th className="text-left pb-2.5 pr-3 font-semibold">Name</th>
                <th className="text-left pb-2.5 pr-3 font-semibold">Status</th>
                <th className="text-left pb-2.5 pr-3 font-semibold">Duration</th>
                <th className="text-left pb-2.5 pr-3 font-semibold">Model</th>
                <th className="text-left pb-2.5 pr-3 font-semibold">Tokens</th>
                <th className="text-left pb-2.5 font-semibold">Cost</th>
              </tr>
            </thead>
            <tbody>
              {sortedSpans.map((span) => (
                <SpanRow key={span.id} span={span} />
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>{/* end space-y-5 */}
    </div>{/* end main shift wrapper */}

    {/* AI Chat — fixed panel sliding in from right */}
    {chatOpen && (
      <div className="fixed top-14 right-0 bottom-0 w-[390px] z-30 shadow-2xl">
        <SessionAIChat
          sessionId={session.id}
          agentName={session.agent_name}
          onClose={() => setChatOpen(false)}
        />
      </div>
    )}
    </div>
  );
}
