"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sessionsApi, scoresApi, datasetsApi, playgroundApi, apiErrorMessage } from "@/lib/api";
import { ModelPicker } from "@/components/ui/model-picker";
import { Span, SessionIssue, IssueSeverity, DatasetSummary } from "@/lib/types";
import { StatusBadge, LoopBadge, SpanTypeBadge } from "@/components/ui/Badge";
import { Card, StatCard } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import SessionAIChat from "@/components/ui/SessionAIChat";
import TraceTimeline from "@/components/timeline/TraceTimeline";
import { useProject } from "@/lib/project-context";
import { useOrg } from "@/lib/org-context";
import { format } from "date-fns";
import Link from "next/link";
import { clsx } from "clsx";
import {
  ArrowLeft, AlertTriangle, XCircle, Layers,
  ChevronDown, ChevronRight, Radio, ShieldAlert,
  AlertCircle, Info, TrendingUp, Zap, Tag, User, FlaskConical, Sparkles,
  ThumbsUp, ThumbsDown, Database, Play, Loader2, Send, RotateCcw, GripVertical,
  Brain, ExternalLink,
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

/* ── Score panel ───────────────────────────────────────────────────────────── */
function ScorePanel({ sessionId, projectId }: { sessionId: string; projectId: string }) {
  const qc = useQueryClient();
  const [comment, setComment] = useState("");
  const [rescoreMsg, setRescoreMsg] = useState<string | null>(null);

  const { data: scores = [] } = useQuery({
    queryKey: ["scores", sessionId],
    queryFn: () => scoresApi.list(projectId, sessionId),
  });

  const addScore = useMutation({
    mutationFn: (value: number) => scoresApi.create({
      project_id: projectId,
      session_id: sessionId,
      name: "quality",
      value,
      comment: comment.trim() || undefined,
      source: "human",
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["scores", sessionId] }); setComment(""); },
  });

  const rescore = useMutation({
    mutationFn: () => sessionsApi.rescore(sessionId),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["scores", sessionId] });
      qc.invalidateQueries({ queryKey: ["session", sessionId] });
      setRescoreMsg(data.message);
      setTimeout(() => setRescoreMsg(null), 4000);
    },
    onError: (e) => {
      setRescoreMsg(apiErrorMessage(e));
      setTimeout(() => setRescoreMsg(null), 4000);
    },
  });

  const thumbsUp = scores.filter(s => s.name === "quality" && s.value > 0);
  const thumbsDown = scores.filter(s => s.name === "quality" && s.value < 0);
  const modelScores = scores.filter(s => s.source === "model");
  const hasAutoScores = modelScores.some(s => s.name === "auto_quality");

  return (
    <Card title={<span className="flex items-center gap-2"><ThumbsUp className="w-3.5 h-3.5 text-green-400" />Scores</span>}
      subtitle="Rate this session or see AI evaluator scores">
      <div className="space-y-4">
        {/* Thumbs */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => addScore.mutate(1)}
            disabled={addScore.isPending}
            className={clsx(
              "flex items-center gap-2 px-4 py-2 rounded-xl border text-[13px] font-medium transition-all",
              thumbsUp.length > 0
                ? "border-green-500/40 bg-green-500/10 text-green-400"
                : "border-dark-border bg-dark-raised text-ink-muted hover:border-green-500/30 hover:text-green-400",
            )}>
            <ThumbsUp className="w-4 h-4" />
            <span>{thumbsUp.length > 0 ? thumbsUp.length : "Good"}</span>
          </button>
          <button
            onClick={() => addScore.mutate(-1)}
            disabled={addScore.isPending}
            className={clsx(
              "flex items-center gap-2 px-4 py-2 rounded-xl border text-[13px] font-medium transition-all",
              thumbsDown.length > 0
                ? "border-red-500/40 bg-red-500/10 text-red-400"
                : "border-dark-border bg-dark-raised text-ink-muted hover:border-red-500/30 hover:text-red-400",
            )}>
            <ThumbsDown className="w-4 h-4" />
            <span>{thumbsDown.length > 0 ? thumbsDown.length : "Bad"}</span>
          </button>
          <input
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="Optional comment…"
            className="flex-1 bg-dark-bg border border-dark-border rounded-xl px-3 py-2 text-[12px] text-ink-secondary placeholder-ink-dim focus:outline-none focus:border-brand-500/50 transition-colors"
          />
        </div>

        {/* AI evaluator scores */}
        {modelScores.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-semibold text-ink-dim uppercase tracking-wide">AI Evaluators</p>
              <button
                onClick={() => rescore.mutate()}
                disabled={rescore.isPending}
                className="flex items-center gap-1 text-[10px] text-ink-dim hover:text-ink-muted border border-dark-border rounded px-2 h-5 transition-colors disabled:opacity-40"
                title="Re-run AI quality scoring"
              >
                {rescore.isPending
                  ? <><Loader2 className="w-2.5 h-2.5 animate-spin" /> Scoring…</>
                  : <><RotateCcw className="w-2.5 h-2.5" /> Re-score</>
                }
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {modelScores.map(s => (
                <div key={s.id} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-dark-raised border border-dark-border">
                  <span className="text-[11px] text-ink-muted font-medium">{s.name}</span>
                  <span className={clsx("text-[13px] font-bold", s.value >= 0.7 ? "text-green-400" : s.value >= 0.4 ? "text-yellow-400" : "text-red-400")}>
                    {(s.value * 100).toFixed(0)}%
                  </span>
                  {s.comment && <span className="text-[10px] text-ink-dim truncate max-w-[120px]" title={s.comment}>{s.comment}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No scores yet — show Re-score button to trigger on demand */}
        {!hasAutoScores && (
          <div className="flex items-center gap-3">
            <p className="text-[11px] text-ink-dim flex-1">
              {scores.length === 0
                ? "No scores yet. Rate above or run AI scoring."
                : "No AI evaluator scores yet."}
            </p>
            <button
              onClick={() => rescore.mutate()}
              disabled={rescore.isPending}
              className="flex items-center gap-1.5 text-[11px] text-brand-400 hover:text-brand-300 border border-brand-500/30 hover:border-brand-500/50 bg-brand-500/5 hover:bg-brand-500/10 rounded-lg px-3 py-1.5 transition-all disabled:opacity-40 font-medium"
              title="Run AI quality scoring now"
            >
              {rescore.isPending
                ? <><Loader2 className="w-3 h-3 animate-spin" /> Scoring…</>
                : <><Sparkles className="w-3 h-3" /> Run AI Score</>
              }
            </button>
          </div>
        )}

        {/* Feedback toast */}
        {rescoreMsg && (
          <p className="text-[11px] text-green-400 bg-green-500/5 border border-green-500/20 rounded-lg px-3 py-2">
            {rescoreMsg}
          </p>
        )}
      </div>
    </Card>
  );
}

/* ── Add to dataset button ─────────────────────────────────────────────────── */
function AddToDatasetButton({ sessionId, projectId }: { sessionId: string; projectId: string }) {
  const [open, setOpen] = useState(false);
  const [selectedDataset, setSelectedDataset] = useState("");
  const [expectedOutput, setExpectedOutput] = useState("");

  const { data: datasets = [] } = useQuery({
    queryKey: ["datasets", projectId],
    queryFn: () => datasetsApi.list(projectId),
    enabled: open,
  });

  const add = useMutation({
    mutationFn: () => datasetsApi.addItem(selectedDataset, {
      session_id: sessionId,
      expected_output: expectedOutput || undefined,
    }),
    onSuccess: () => { setOpen(false); setSelectedDataset(""); setExpectedOutput(""); },
  });

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-[11px] text-ink-muted hover:text-ink-secondary border border-dark-border rounded px-2.5 py-1.5 transition-colors hover:border-dark-divider">
        <Database className="w-3 h-3" /> Add to dataset
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-dark-surface border border-dark-border rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-dark-border">
              <h3 className="text-[14px] font-semibold text-ink-primary">Add to dataset</h3>
              <button onClick={() => setOpen(false)} className="text-ink-dim text-sm">✕</button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide block mb-1.5">Dataset</label>
                <select value={selectedDataset} onChange={e => setSelectedDataset(e.target.value)}
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-[12px] text-ink-secondary focus:outline-none">
                  <option value="">Select dataset…</option>
                  {(datasets as DatasetSummary[]).map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide block mb-1.5">Expected output (optional)</label>
                <textarea value={expectedOutput} onChange={e => setExpectedOutput(e.target.value)} rows={3}
                  placeholder="What should the ideal agent response be?"
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-[12px] text-ink-secondary placeholder-ink-dim resize-none focus:outline-none focus:border-brand-500/50" />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-dark-border">
              <button onClick={() => setOpen(false)} className="px-3 py-1.5 text-[12px] text-ink-muted">Cancel</button>
              <button onClick={() => add.mutate()} disabled={!selectedDataset || add.isPending}
                className="px-4 py-1.5 bg-brand-600 text-white rounded-lg text-[12px] font-semibold hover:bg-brand-500 disabled:opacity-40">
                {add.isPending ? "Adding…" : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ── Playground panel ──────────────────────────────────────────────────────── */
function PlaygroundPanel({ session }: { session: { id: string; spans: Span[] } }) {
  const { selectedOrg } = useOrg();
  const lastLlm = [...session.spans].reverse().find(s => s.span_type === "llm");
  const [system, setSystem] = useState("");
  const [userMsg, setUserMsg] = useState(lastLlm?.input_text ?? "");
  const [model, setModel] = useState(lastLlm?.model ?? "claude-sonnet-4-6");
  const [result, setResult] = useState<{ content: string; provider: string; input_tokens: number; output_tokens: number; cost_usd: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  async function runPlayground() {
    setRunning(true);
    setError("");
    setResult(null);
    try {
      const messages = [];
      if (userMsg.trim()) messages.push({ role: "user" as const, content: userMsg });
      const res = await playgroundApi.run({
        model, system: system || undefined, messages,
        org_id: selectedOrg?.id,
      });
      setResult(res);
    } catch (e: unknown) {
      setError(apiErrorMessage(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card title={<span className="flex items-center gap-2"><Play className="w-3.5 h-3.5 text-brand-400" />Playground</span>}
      subtitle="Edit the prompt and re-run it against any configured model">
      <div className="space-y-3">
        <div className="grid grid-cols-4 gap-2 items-end">
          <div className="col-span-3">
            <label className="text-[10px] font-semibold text-ink-dim uppercase tracking-wide block mb-1">Model</label>
            <ModelPicker orgId={selectedOrg?.id ?? null} value={model} onChange={setModel} />
          </div>
          <button onClick={() => { setSystem(""); setUserMsg(lastLlm?.input_text ?? ""); setResult(null); }}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dark-border text-[11px] text-ink-muted hover:text-ink-secondary transition-colors">
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </button>
        </div>

        <div>
          <label className="text-[10px] font-semibold text-ink-dim uppercase tracking-wide block mb-1">System prompt</label>
          <textarea value={system} onChange={e => setSystem(e.target.value)} rows={2}
            placeholder="Optional system prompt…"
            className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-[11px] font-mono text-ink-secondary placeholder-ink-dim resize-none focus:outline-none focus:border-brand-500/50" />
        </div>

        <div>
          <label className="text-[10px] font-semibold text-ink-dim uppercase tracking-wide block mb-1">User message</label>
          <textarea value={userMsg} onChange={e => setUserMsg(e.target.value)} rows={5}
            placeholder="Edit the prompt here…"
            className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-[11px] font-mono text-ink-secondary placeholder-ink-dim resize-none focus:outline-none focus:border-brand-500/50" />
        </div>

        <div className="flex justify-end">
          <button onClick={runPlayground} disabled={running || !userMsg.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg text-[13px] font-semibold hover:bg-brand-500 disabled:opacity-40 transition-colors">
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {running ? "Running…" : "Run"}
          </button>
        </div>

        {error && <p className="text-[12px] text-status-red">{error}</p>}

        {result && (
          <div className="space-y-2">
            <div className="flex items-center gap-3 text-[10px] text-ink-dim">
              <span>↑{result.input_tokens} in</span>
              <span>↓{result.output_tokens} out</span>
              <span>${result.cost_usd.toFixed(6)}</span>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-brand-400 uppercase tracking-wide mb-1">Response</p>
              <pre className="bg-dark-bg border border-brand-600/30 rounded-xl p-3 text-[11px] font-mono text-ink-secondary whitespace-pre-wrap max-h-64 overflow-y-auto leading-relaxed">
                {result.content}
              </pre>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────────── */
export default function SessionDetailPage({ params }: Props) {
  const [chatOpen, setChatOpen] = useState(false);
  const [chatWidth, setChatWidth] = useState(390);
  const chatDragging = useRef(false);
  const chatDragStart = useRef({ x: 0, width: 390 });
  const { selectedProject } = useProject();

  const onChatResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    chatDragging.current = true;
    chatDragStart.current = { x: e.clientX, width: chatWidth };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [chatWidth]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!chatDragging.current) return;
      const delta = chatDragStart.current.x - e.clientX;
      const next = Math.max(280, Math.min(720, chatDragStart.current.width + delta));
      setChatWidth(next);
    };
    const onUp = () => {
      if (!chatDragging.current) return;
      chatDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);
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

  const { data: behaviors = [] } = useQuery({
    queryKey: ["behaviors", params.id],
    queryFn: () => sessionsApi.behaviors(params.id),
    enabled: !!session,
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
    <div style={{ marginRight: chatOpen ? chatWidth : 0, transition: "margin-right 0.25s" }}>
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
            {selectedProject && (
              <AddToDatasetButton sessionId={session.id} projectId={selectedProject.id} />
            )}
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

      {/* Behavioral Flags */}
      {behaviors.length > 0 && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-amber-500/20">
            <Brain className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wide">
              Behavioral Flags
            </span>
            <span className="ml-auto inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[10px] font-bold">
              {behaviors.length}
            </span>
          </div>
          <div className="divide-y divide-amber-500/10">
            {behaviors.map((flag) => (
              <div key={flag.monitor_id} className="px-4 py-3 flex items-start gap-3">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-[12px] font-semibold text-amber-700 dark:text-amber-300">
                    {flag.monitor_name}
                  </span>
                  {flag.reason && (
                    <p className="text-[11px] text-amber-700/70 dark:text-amber-400/70 mt-0.5 leading-snug">
                      {flag.reason}
                    </p>
                  )}
                  <p className="text-[10px] text-ink-dim mt-1 italic">
                    Pattern: {flag.pattern_prompt}
                  </p>
                </div>
                <Link
                  href={`/monitors?highlight=${flag.monitor_id}`}
                  className="shrink-0 flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 hover:underline"
                >
                  Monitor <ExternalLink className="w-2.5 h-2.5" />
                </Link>
              </div>
            ))}
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
      {/* Score panel */}
      {selectedProject && (
        <ScorePanel sessionId={session.id} projectId={selectedProject.id} />
      )}

      {/* Playground */}
      <PlaygroundPanel session={session} />

    </div>{/* end space-y-5 */}
    </div>{/* end main shift wrapper */}

    {/* AI Chat — resizable panel sliding in from right */}
    {chatOpen && (
      <div
        style={{ width: chatWidth }}
        className="fixed top-14 right-0 bottom-0 z-30 shadow-2xl flex"
      >
        {/* Drag handle on left edge */}
        <div
          onMouseDown={onChatResizeStart}
          className="w-1 shrink-0 cursor-col-resize bg-dark-border hover:bg-brand-400/40 transition-colors group flex items-center justify-center"
          title="Drag to resize"
        >
          <GripVertical className="w-3 h-3 text-brand-400 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        <div className="flex-1 overflow-hidden">
          <SessionAIChat
            sessionId={session.id}
            agentName={session.agent_name}
            onClose={() => setChatOpen(false)}
          />
        </div>
      </div>
    )}
    </div>
  );
}
