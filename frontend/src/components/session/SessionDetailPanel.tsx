"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { sessionsApi } from "@/lib/api";
import { Span, SessionIssue, IssueSeverity } from "@/lib/types";
import { StatusBadge, LoopBadge, SpanTypeBadge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/Card";
import SessionAIChat from "@/components/ui/SessionAIChat";
import TraceTimeline from "@/components/timeline/TraceTimeline";
import { format, formatDistanceToNow } from "date-fns";
import Link from "next/link";
import {
  AlertTriangle, XCircle, Layers, ChevronDown, ChevronRight,
  Radio, ShieldAlert, AlertCircle, Info, TrendingUp, Zap, Tag,
  User, FlaskConical, Sparkles, ExternalLink, MessageSquare,
} from "lucide-react";
import DottleMascot from "@/components/dottle-mascot";

/* ── helpers ─────────────────────────────────────────────────────────────────── */
function formatMs(ms: number | null) {
  if (!ms) return "—";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
}

/* ── Severity config ─────────────────────────────────────────────────────────── */
const SEVERITY_CONFIG: Record<IssueSeverity, {
  icon: React.ReactNode; color: string; bg: string; border: string;
}> = {
  critical: { icon: <XCircle className="w-4 h-4" />,      color: "text-red-400",    bg: "bg-red-500/5",    border: "border-red-500/20" },
  high:     { icon: <ShieldAlert className="w-4 h-4" />,  color: "text-orange-400", bg: "bg-orange-500/5", border: "border-orange-500/20" },
  medium:   { icon: <AlertCircle className="w-4 h-4" />,  color: "text-amber-400",  bg: "bg-amber-500/5",  border: "border-amber-500/20" },
  low:      { icon: <TrendingUp className="w-4 h-4" />,   color: "text-sky-400",    bg: "bg-sky-500/5",    border: "border-sky-500/20" },
  info:     { icon: <Info className="w-4 h-4" />,         color: "text-ink-muted",  bg: "bg-dark-raised",  border: "border-dark-border" },
};

/* ── Issue card ──────────────────────────────────────────────────────────────── */
function IssueCard({ issue }: { issue: SessionIssue }) {
  const [open, setOpen] = useState(false);
  const cfg = SEVERITY_CONFIG[issue.severity] ?? SEVERITY_CONFIG.info;

  const renderDescription = (text: string) =>
    text.split("\n").map((line, i) => (
      <span key={i} className="block">
        {line.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((part, j) => {
          if (part.startsWith("**") && part.endsWith("**"))
            return <strong key={j} className="font-semibold text-ink-primary">{part.slice(2, -2)}</strong>;
          if (part.startsWith("`") && part.endsWith("`"))
            return <code key={j} className="font-mono text-[10px] bg-dark-bg border border-dark-border rounded px-1">{part.slice(1, -1)}</code>;
          return part;
        })}
      </span>
    ));

  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} overflow-hidden`}>
      <button
        className="w-full flex items-start gap-3 px-4 py-3.5 text-left"
        onClick={() => setOpen(o => !o)}
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
          <div className="pt-3 space-y-0.5">{renderDescription(issue.description)}</div>
        </div>
      )}
    </div>
  );
}

/* ── Expandable span row ─────────────────────────────────────────────────────── */
function SpanRow({ span }: { span: Span }) {
  const [open, setOpen] = useState(false);
  const hasDetail = !!(span.input_text || span.output_text || span.error_message || Object.keys(span.attributes).length > 0);

  return (
    <>
      <tr
        className={`border-b border-dark-divider/40 last:border-0 transition-colors ${hasDetail ? "cursor-pointer hover:bg-dark-raised/30" : ""}`}
        onClick={() => hasDetail && setOpen(o => !o)}
      >
        <td className="py-2 pr-3 w-5">
          {hasDetail
            ? open ? <ChevronDown className="w-3 h-3 text-ink-dim" /> : <ChevronRight className="w-3 h-3 text-ink-dim" />
            : <span className="w-3 h-3 inline-block" />}
        </td>
        <td className="py-2 pr-3"><SpanTypeBadge type={span.span_type} /></td>
        <td className="py-2 pr-3 font-medium text-xs text-ink-secondary">{span.name}</td>
        <td className="py-2 pr-3"><StatusBadge status={span.status} /></td>
        <td className="py-2 pr-3 font-mono text-[11px] text-ink-muted">{formatMs(span.duration_ms)}</td>
        <td className="py-2 pr-3 text-[11px] text-ink-muted hidden lg:table-cell">{span.model ?? "—"}</td>
        <td className="py-2 font-mono text-[11px] text-ink-muted">
          {span.cost_usd != null ? `$${Number(span.cost_usd).toFixed(6)}` : "—"}
        </td>
      </tr>

      {open && hasDetail && (
        <tr className="bg-dark-bg/60">
          <td colSpan={7} className="pb-4 pt-1 px-4">
            <div className="space-y-3">
              {span.input_text && (
                <div>
                  <p className="text-[10px] font-semibold text-ink-dim uppercase tracking-widest mb-1.5">Prompt / Input</p>
                  <pre className="text-[11px] font-mono text-ink-secondary bg-dark-bg border border-dark-border rounded-lg p-3 whitespace-pre-wrap break-words leading-relaxed max-h-48 overflow-auto">
                    {span.input_text}
                  </pre>
                </div>
              )}
              {span.output_text && (
                <div>
                  <p className="text-[10px] font-semibold text-brand-500 uppercase tracking-widest mb-1.5">Response / Output</p>
                  <pre className="text-[11px] font-mono text-ink-secondary bg-dark-bg border border-brand-600/30 rounded-lg p-3 whitespace-pre-wrap break-words leading-relaxed max-h-48 overflow-auto">
                    {span.output_text}
                  </pre>
                </div>
              )}
              {span.error_message && (
                <div>
                  <p className="text-[10px] font-semibold text-status-red uppercase tracking-widest mb-1.5">Error — {span.error_type}</p>
                  <pre className="text-[11px] font-mono text-status-red/80 bg-status-red/5 border border-status-red/20 rounded-lg p-3 whitespace-pre-wrap break-words">
                    {span.error_message}
                  </pre>
                </div>
              )}
              {Object.keys(span.attributes).length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-ink-dim uppercase tracking-widest mb-1.5">Attributes</p>
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

/* ── Conversation transcript ─────────────────────────────────────────────────── */
function TranscriptView({ spans }: { spans: Span[] }) {
  const llmSpans = spans
    .filter(s => s.span_type === "llm")
    .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());

  if (llmSpans.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-ink-muted">
        <MessageSquare className="w-8 h-8 text-ink-dim" />
        <p className="text-sm">No LLM calls recorded in this session.</p>
        <p className="text-xs text-ink-dim">Pass <code className="font-mono bg-dark-raised px-1 rounded">input_text</code> and <code className="font-mono bg-dark-raised px-1 rounded">output_text</code> to your spans to see a transcript.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-5">
      {llmSpans.map((span, i) => (
        <div key={span.id} className="space-y-2">
          {/* Step label */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-ink-dim uppercase tracking-widest">Step {i + 1} — {span.name}</span>
            <span className="text-[10px] text-ink-dim font-mono">{span.model ?? ""}</span>
            {span.duration_ms && (
              <span className="text-[10px] text-ink-dim ml-auto">{formatMs(span.duration_ms)}</span>
            )}
          </div>

          {/* User / Prompt bubble */}
          {span.input_text && (
            <div className="flex gap-2.5">
              <div className="w-6 h-6 rounded-full bg-dark-raised border border-dark-border flex items-center justify-center shrink-0 mt-0.5">
                <User className="w-3 h-3 text-ink-dim" />
              </div>
              <div className="flex-1 bg-dark-raised border border-dark-border rounded-2xl rounded-tl-sm px-4 py-3">
                <p className="text-[11px] text-ink-muted font-semibold mb-1.5 uppercase tracking-wide">Input</p>
                <pre className="text-xs text-ink-secondary whitespace-pre-wrap break-words leading-relaxed font-mono max-h-52 overflow-auto">
                  {span.input_text}
                </pre>
              </div>
            </div>
          )}

          {/* AI / Output bubble */}
          {span.output_text && (
            <div className="flex gap-2.5 flex-row-reverse">
              <div className="w-6 h-6 rounded-full bg-brand-600/20 border border-brand-500/30 flex items-center justify-center shrink-0 mt-0.5">
                <Zap className="w-3 h-3 text-brand-400" />
              </div>
              <div className="flex-1 bg-brand-500/5 border border-brand-500/20 rounded-2xl rounded-tr-sm px-4 py-3">
                <p className="text-[11px] text-brand-500 font-semibold mb-1.5 uppercase tracking-wide">Output</p>
                <pre className="text-xs text-ink-secondary whitespace-pre-wrap break-words leading-relaxed font-mono max-h-52 overflow-auto">
                  {span.output_text}
                </pre>
              </div>
            </div>
          )}

          {/* Error */}
          {span.error_message && (
            <div className="ml-8 bg-status-red/5 border border-status-red/20 rounded-xl px-4 py-3">
              <p className="text-[10px] font-semibold text-status-red uppercase tracking-widest mb-1">Error — {span.error_type}</p>
              <pre className="text-[11px] font-mono text-status-red/80 whitespace-pre-wrap break-words">{span.error_message}</pre>
            </div>
          )}

          {/* Token usage */}
          {(span.input_tokens || span.output_tokens) && (
            <div className="ml-8 flex items-center gap-3 text-[10px] text-ink-dim">
              {span.input_tokens && <span>↑ {span.input_tokens.toLocaleString()} in</span>}
              {span.output_tokens && <span>↓ {span.output_tokens.toLocaleString()} out</span>}
              {span.cost_usd && <span>${Number(span.cost_usd).toFixed(6)}</span>}
            </div>
          )}

          {i < llmSpans.length - 1 && <div className="border-b border-dark-divider/50 pt-2" />}
        </div>
      ))}
    </div>
  );
}

/* ── Tabs ────────────────────────────────────────────────────────────────────── */
type Tab = "overview" | "spans" | "transcript" | "issues";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview",    label: "Overview"    },
  { id: "spans",       label: "Spans"       },
  { id: "transcript",  label: "Transcript"  },
  { id: "issues",      label: "Issues"      },
];

/* ── Main panel ──────────────────────────────────────────────────────────────── */
export interface SessionDetailPanelProps {
  sessionId: string;
  /** If true, hides the top "open in full page" link (already on the full page) */
  hideExternalLink?: boolean;
}

export function SessionDetailPanel({ sessionId, hideExternalLink }: SessionDetailPanelProps) {
  const [tab, setTab]           = useState<Tab>("overview");
  const [chatOpen, setChatOpen] = useState(false);
  const isLive = (status: string) => status === "running" || status === "looping";

  const { data: session, isLoading } = useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => sessionsApi.get(sessionId),
    refetchInterval: (q) => {
      const s = q.state.data;
      return s && isLive(s.status) ? 2000 : false;
    },
    enabled: !!sessionId,
  });

  if (isLoading) {
    return (
      <div className="p-5 space-y-4 animate-pulse">
        <div className="shimmer h-5 w-48 rounded" />
        <div className="grid grid-cols-3 gap-3">
          {[...Array(5)].map((_, i) => <div key={i} className="shimmer h-16 rounded-xl" />)}
        </div>
        <div className="shimmer h-48 rounded-xl" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 p-5">
        <XCircle className="w-8 h-8 text-status-red/50" />
        <p className="text-sm text-ink-muted">Session not found</p>
      </div>
    );
  }

  const sortedSpans = [...session.spans].sort(
    (a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
  );
  const live = isLive(session.status);
  const issueCount = session.issues?.length ?? 0;

  return (
    <div className="flex h-full">
      {/* Main content */}
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${chatOpen ? "mr-[360px]" : ""}`}>

        {/* Session header */}
        <div className="px-5 pt-4 pb-3 border-b border-dark-border shrink-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h2 className="text-sm font-semibold text-ink-primary">{session.agent_name}</h2>
            <StatusBadge status={session.status} />
            {session.loop_detected && <LoopBadge />}
            {live && (
              <span className="flex items-center gap-1 text-[10px] text-status-green font-semibold animate-pulse">
                <Radio className="w-2.5 h-2.5" /> Live
              </span>
            )}
            {!hideExternalLink && (
              <Link
                href={`/sessions/${session.id}`}
                className="ml-auto flex items-center gap-1 text-[11px] text-ink-dim hover:text-ink-secondary transition-colors"
              >
                <ExternalLink className="w-3 h-3" /> Full page
              </Link>
            )}
          </div>

          <p className="text-[10px] text-ink-dim font-mono">{session.id}</p>
          <p className="text-[11px] text-ink-muted mt-0.5">
            {format(new Date(session.started_at), "MMM d, yyyy · HH:mm:ss")}
            {session.ended_at && ` → ${format(new Date(session.ended_at), "HH:mm:ss")}`}
          </p>

          {/* Attribution + tags */}
          <div className="flex items-center gap-2 flex-wrap mt-1.5">
            {(session.user_email || session.user_id) && (
              <span className="flex items-center gap-1 text-[10px] text-ink-muted">
                <User className="w-2.5 h-2.5" />
                {session.user_email ?? session.user_id}
              </span>
            )}
            {session.agent_version && (
              <span className="text-[10px] font-mono text-ink-dim bg-dark-raised border border-dark-border px-1.5 py-0.5 rounded">
                v{session.agent_version}
              </span>
            )}
            {session.tags?.map(t => (
              <span key={t} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-brand-500/10 text-brand-400 border border-brand-500/20">
                <Tag className="w-2.5 h-2.5" />{t}
              </span>
            ))}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <a
              href={`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1/sessions/${session.id}/fixture?lang=python`}
              target="_blank" rel="noreferrer"
              className="flex items-center gap-1 text-[10px] text-ink-muted hover:text-ink-secondary border border-dark-border rounded px-2 py-1 transition-colors"
            >
              <FlaskConical className="w-3 h-3" /> Python fixture
            </a>
            <a
              href={`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1/sessions/${session.id}/fixture?lang=typescript`}
              target="_blank" rel="noreferrer"
              className="flex items-center gap-1 text-[10px] text-ink-muted hover:text-ink-secondary border border-dark-border rounded px-2 py-1 transition-colors"
            >
              <FlaskConical className="w-3 h-3" /> TS fixture
            </a>
            <button
              onClick={() => setChatOpen(o => !o)}
              className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded border transition-all ${
                chatOpen
                  ? "bg-brand-600/20 border-brand-500/40 text-brand-400"
                  : "border-dark-border text-ink-muted hover:text-brand-400 hover:border-brand-500/30"
              }`}
            >
              <Sparkles className="w-3 h-3" /> Ask AI
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-0 px-5 border-b border-dark-border shrink-0">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-2.5 text-[12px] font-medium border-b-2 transition-all -mb-px ${
                tab === t.id
                  ? "border-brand-500 text-ink-primary"
                  : "border-transparent text-ink-muted hover:text-ink-secondary"
              }`}
            >
              {t.label}
              {t.id === "issues" && issueCount > 0 && (
                <span className="ml-1.5 text-[9px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1 py-0.5 rounded-full">
                  {issueCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Overview ── */}
          {tab === "overview" && (
            <div className="p-5 space-y-4">
              {/* Mascot status indicator */}
              <div className="flex justify-center">
                <DottleMascot
                  variant={
                    session.status === "failed" || session.loop_detected
                      ? "detecting"
                      : session.status === "running" || session.status === "looping"
                      ? "fixing"
                      : issueCount > 0
                      ? "detecting"
                      : session.status === "completed"
                      ? "happy"
                      : "idle"
                  }
                  size={160}
                />
              </div>

              {/* Alerts */}
              {session.loop_detected && (
                <div className="flex items-start gap-3 bg-amber-500/5 border border-amber-500/20 rounded-xl p-3">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-amber-400">Loop Detected</p>
                    <p className="text-[11px] text-amber-400/70 mt-0.5">{session.loop_reason}</p>
                  </div>
                </div>
              )}
              {session.error_message && (
                <div className="flex items-start gap-3 bg-red-500/5 border border-red-500/20 rounded-xl p-3">
                  <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-red-400">{session.error_type ?? "Error"}</p>
                    <p className="text-[11px] font-mono text-red-400/70 mt-0.5">{session.error_message}</p>
                  </div>
                </div>
              )}

              {/* Stats */}
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
                <StatCard label="Duration"      value={formatMs(session.duration_ms)} />
                <StatCard label="Total Cost"    value={session.total_cost_usd != null ? `$${Number(session.total_cost_usd).toFixed(6)}` : "—"} />
                <StatCard label="Tokens"        value={session.total_tokens?.toLocaleString() ?? "—"} sub={`in: ${session.input_tokens ?? 0} · out: ${session.output_tokens ?? 0}`} />
                <StatCard label="LLM Calls"     value={session.iteration_count} />
                <StatCard label="Total Spans"   value={session.spans.length} />
              </div>

              {/* Trace timeline preview */}
              {session.spans.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-ink-muted uppercase tracking-widest mb-2">Trace</p>
                  <TraceTimeline session={session} spans={session.spans} />
                </div>
              )}
            </div>
          )}

          {/* ── Spans ── */}
          {tab === "spans" && (
            <div className="p-5">
              {sortedSpans.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2">
                  <Layers className="w-8 h-8 text-ink-dim" />
                  <p className="text-sm text-ink-muted">{live ? "Waiting for spans…" : "No spans recorded"}</p>
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[11px] text-ink-muted border-b border-dark-divider">
                      <th className="pb-2.5 pr-2 w-5" />
                      <th className="text-left pb-2.5 pr-3 font-semibold">Type</th>
                      <th className="text-left pb-2.5 pr-3 font-semibold">Name</th>
                      <th className="text-left pb-2.5 pr-3 font-semibold">Status</th>
                      <th className="text-left pb-2.5 pr-3 font-semibold">Duration</th>
                      <th className="text-left pb-2.5 pr-3 font-semibold hidden lg:table-cell">Model</th>
                      <th className="text-left pb-2.5 font-semibold">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedSpans.map(span => <SpanRow key={span.id} span={span} />)}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ── Transcript ── */}
          {tab === "transcript" && <TranscriptView spans={sortedSpans} />}

          {/* ── Issues ── */}
          {tab === "issues" && (
            <div className="p-5">
              {issueCount === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2">
                  <ShieldAlert className="w-8 h-8 text-ink-dim" />
                  <p className="text-sm text-ink-muted">No issues detected in this session.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {session.issues.map(issue => <IssueCard key={issue.id} issue={issue} />)}
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* AI Chat sliding in from right within the drawer */}
      {chatOpen && (
        <div className="fixed top-0 right-0 h-full w-[360px] z-[60] shadow-2xl border-l border-dark-border">
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
