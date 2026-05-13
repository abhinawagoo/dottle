"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { monitorsApi } from "@/lib/api";
import { useProject } from "@/lib/project-context";
import { SemanticMonitor, MonitorEvent } from "@/lib/types";
import { formatDistanceToNow } from "date-fns";
import {
  Plus, Trash2, ToggleLeft, ToggleRight, ChevronDown, ChevronRight,
  Brain, Zap, TrendingUp, X, AlertTriangle, ExternalLink,
} from "lucide-react";

// ── Preset templates ───────────────────────────────────────────────────────────
const PRESETS = [
  {
    name: "Refusing tasks",
    description: "Detects when the agent refuses to complete a requested task",
    pattern_prompt: "The agent refuses to complete the task the user requested, citing inability, policy restrictions, or safety concerns.",
  },
  {
    name: "Excessive apologies",
    description: "Detects when the agent apologises more than necessary",
    pattern_prompt: "The agent apologises excessively (more than twice) in a single session, suggesting defensive or overly cautious behavior.",
  },
  {
    name: "Hallucinating facts",
    description: "Detects factual claims that appear fabricated or ungrounded",
    pattern_prompt: "The agent's output contains specific facts, names, URLs, or statistics that appear to be fabricated rather than retrieved from a reliable source.",
  },
  {
    name: "Off-topic responses",
    description: "Detects responses that deviate from the expected domain",
    pattern_prompt: "The agent's responses drift significantly from the expected domain or topic of the original request.",
  },
  {
    name: "Stuck looping",
    description: "Detects agents repeating the same tool calls or steps",
    pattern_prompt: "The agent repeats the same tool calls or reasoning steps multiple times without making progress toward the goal.",
  },
  {
    name: "Prompt injection attempt",
    description: "Detects user inputs trying to override system instructions",
    pattern_prompt: "The user input contains an apparent attempt to override system instructions, ignore previous instructions, or manipulate the agent's persona.",
  },
];

// ── Create modal ───────────────────────────────────────────────────────────────
function CreateMonitorModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName]           = useState("");
  const [desc, setDesc]           = useState("");
  const [pattern, setPattern]     = useState("");
  const [threshold, setThreshold] = useState(20);
  const [window, setWindow]       = useState(60);
  const [minSess, setMinSess]     = useState(5);
  const [error, setError]         = useState("");

  const create = useMutation({
    mutationFn: () => monitorsApi.create({
      project_id:     projectId,
      name,
      description:    desc || undefined,
      pattern_prompt: pattern,
      threshold_pct:  threshold,
      window_minutes: window,
      min_sessions:   minSess,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["monitors", projectId] }); onClose(); },
    onError: (e: unknown) => setError((e as Error).message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl bg-dark-surface border border-dark-border rounded-2xl shadow-2xl flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-border">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-brand-400" />
            <h2 className="text-[15px] font-semibold text-ink-primary">New Semantic Monitor</h2>
          </div>
          <button onClick={onClose} className="text-ink-dim hover:text-ink-muted text-sm">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Presets */}
          <div>
            <p className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide mb-2">Start from template</p>
            <div className="flex gap-2 flex-wrap">
              {PRESETS.map(p => (
                <button key={p.name}
                  onClick={() => { setName(p.name); setDesc(p.description); setPattern(p.pattern_prompt); }}
                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-dark-raised border border-dark-border text-ink-secondary hover:border-brand-500/30 hover:text-ink-primary transition-all">
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide block mb-1.5">Monitor name</label>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Refusing tasks"
              className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-[13px] text-ink-primary placeholder-ink-dim focus:outline-none focus:border-brand-500/50" />
          </div>

          {/* Pattern prompt */}
          <div>
            <label className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide block mb-1.5">
              Behavior to detect
            </label>
            <textarea value={pattern} onChange={e => setPattern(e.target.value)} rows={4}
              placeholder="Describe the behavior pattern the LLM should look for in each session. Be specific and concrete."
              className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2.5 text-[12px] text-ink-secondary placeholder-ink-dim resize-none focus:outline-none focus:border-brand-500/50" />
            <p className="text-[10px] text-ink-dim mt-1">
              The LLM will evaluate each session and answer: "Does this session exhibit: <em>[your description]</em>?"
            </p>
          </div>

          {/* Settings grid */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide block mb-1.5">
                Alert threshold
              </label>
              <div className="relative">
                <input type="number" min={1} max={100} value={threshold} onChange={e => setThreshold(Number(e.target.value))}
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-[12px] text-ink-secondary focus:outline-none pr-7" />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-ink-dim">%</span>
              </div>
              <p className="text-[10px] text-ink-dim mt-1">Fire when ≥ this % of sessions match</p>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide block mb-1.5">
                Window
              </label>
              <div className="relative">
                <input type="number" min={10} value={window} onChange={e => setWindow(Number(e.target.value))}
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-[12px] text-ink-secondary focus:outline-none pr-9" />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-ink-dim">min</span>
              </div>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide block mb-1.5">
                Min sessions
              </label>
              <input type="number" min={1} value={minSess} onChange={e => setMinSess(Number(e.target.value))}
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-[12px] text-ink-secondary focus:outline-none" />
              <p className="text-[10px] text-ink-dim mt-1">Minimum sessions before evaluating</p>
            </div>
          </div>

          {error && <p className="text-[12px] text-status-red">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-dark-border">
          <button onClick={onClose} className="px-4 py-2 text-[13px] text-ink-muted hover:text-ink-secondary">Cancel</button>
          <button
            onClick={() => create.mutate()}
            disabled={!name || !pattern || create.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg text-[13px] font-semibold hover:bg-brand-500 disabled:opacity-40"
          >
            <Brain className="w-4 h-4" />
            {create.isPending ? "Creating…" : "Create monitor"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Monitor card ───────────────────────────────────────────────────────────────
function MonitorCard({ monitor, projectId }: { monitor: SemanticMonitor; projectId: string }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  const toggle = useMutation({
    mutationFn: () => monitorsApi.update(monitor.id, { enabled: !monitor.enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["monitors", projectId] }),
  });

  const del = useMutation({
    mutationFn: () => monitorsApi.delete(monitor.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["monitors", projectId] }),
  });

  const { data: events = [] } = useQuery<MonitorEvent[]>({
    queryKey: ["monitor-events", monitor.id],
    queryFn: () => monitorsApi.listEvents(monitor.id, 5),
    enabled: expanded,
  });

  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${monitor.enabled ? "border-dark-border" : "border-dark-border opacity-60"}`}>
      <div className="flex items-center gap-3 px-4 py-3 bg-dark-raised/40">
        <div className="w-8 h-8 rounded-lg bg-brand-600/15 border border-brand-500/20 flex items-center justify-center shrink-0">
          <Brain className="w-4 h-4 text-brand-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-ink-primary">{monitor.name}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-dark-bg border border-dark-border text-ink-muted">
              ≥{monitor.threshold_pct}% · {monitor.window_minutes}min
            </span>
          </div>
          <p className="text-[11px] text-ink-muted mt-0.5 truncate">{monitor.pattern_prompt}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {monitor.last_fired_at && (
            <span className="text-[10px] text-amber-700 dark:text-amber-400">
              fired {formatDistanceToNow(new Date(monitor.last_fired_at), { addSuffix: true })}
            </span>
          )}
          <button onClick={() => toggle.mutate()} className="text-ink-dim hover:text-ink-secondary transition-colors">
            {monitor.enabled
              ? <ToggleRight className="w-5 h-5 text-brand-400" />
              : <ToggleLeft className="w-5 h-5" />}
          </button>
          <button onClick={() => setExpanded(e => !e)} className="text-ink-dim hover:text-ink-secondary transition-colors">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          <button onClick={() => del.mutate()} className="p-1.5 rounded-lg hover:bg-dark-raised text-ink-dim hover:text-status-red transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-4 py-4 border-t border-dark-border space-y-4">
          <div>
            <p className="text-[10px] font-semibold text-ink-dim uppercase tracking-wide mb-1">Pattern to detect</p>
            <p className="text-[12px] text-ink-secondary leading-relaxed">{monitor.pattern_prompt}</p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-[11px]">
            <div><span className="text-ink-dim">Threshold:</span> <span className="text-ink-secondary">≥{monitor.threshold_pct}% match</span></div>
            <div><span className="text-ink-dim">Window:</span> <span className="text-ink-secondary">Last {monitor.window_minutes} min</span></div>
            <div><span className="text-ink-dim">Min sessions:</span> <span className="text-ink-secondary">{monitor.min_sessions}</span></div>
          </div>

          {/* Recent fire history */}
          {events.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-ink-dim uppercase tracking-wide mb-2">Recent fires</p>
              <div className="space-y-2">
                {events.map(ev => (
                  <div key={ev.id} className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="font-semibold text-amber-700 dark:text-amber-400">{ev.match_pct.toFixed(0)}% matched</span>
                        <span className="text-ink-dim">({ev.sessions_matched}/{ev.sessions_evaluated} sessions)</span>
                        <span className="text-ink-dim ml-auto">{formatDistanceToNow(new Date(ev.fired_at), { addSuffix: true })}</span>
                      </div>
                      {ev.ai_summary && (
                        <p className="text-[11px] text-ink-secondary mt-1 leading-relaxed">{ev.ai_summary}</p>
                      )}
                      {ev.sample_session_ids && (
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          <span className="text-[10px] text-ink-dim">Sample sessions:</span>
                          {ev.sample_session_ids.split(",").slice(0, 3).map(sid => (
                            <a key={sid} href={`/sessions/${sid}`}
                              className="text-[10px] text-brand-400 hover:underline font-mono flex items-center gap-0.5">
                              {sid.slice(0, 8)}… <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {events.length === 0 && (
            <p className="text-[11px] text-ink-dim">No fires yet — monitor is watching.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function MonitorsPage() {
  const { selectedProject } = useProject();
  const [showNew, setShowNew] = useState(false);

  const { data: monitors = [], isLoading } = useQuery<SemanticMonitor[]>({
    queryKey: ["monitors", selectedProject?.id],
    queryFn: () => monitorsApi.list(selectedProject!.id),
    enabled: !!selectedProject,
  });

  if (!selectedProject) return <div className="p-8 text-ink-muted text-sm">Select a project first.</div>;

  const active   = monitors.filter(m => m.enabled);
  const inactive = monitors.filter(m => !m.enabled);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-bold text-ink-primary">Semantic Monitors</h1>
          <p className="text-[13px] text-ink-muted mt-0.5">
            Detect behavioral patterns in your agent's outputs — no code changes, no labels.
          </p>
        </div>
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg text-[13px] font-semibold hover:bg-brand-500 transition-colors">
          <Plus className="w-4 h-4" />
          New monitor
        </button>
      </div>

      {/* How it works */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        {[
          { icon: Brain,      title: "Describe a behavior", desc: "Write what the agent should or shouldn't be doing in plain English" },
          { icon: Zap,        title: "Runs every 5 minutes", desc: "LLM evaluates recent sessions and checks for the pattern" },
          { icon: TrendingUp, title: "Alerts when threshold hit", desc: "Fires a Slack notification with sample sessions when rate exceeds threshold" },
        ].map(({ icon: Icon, title, desc }) => (
          <div key={title} className="p-3.5 rounded-xl bg-dark-raised border border-dark-border">
            <Icon className="w-4 h-4 text-brand-400 mb-2" />
            <p className="text-[12px] font-semibold text-ink-primary">{title}</p>
            <p className="text-[11px] text-ink-muted mt-0.5">{desc}</p>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="text-ink-muted text-sm">Loading…</div>
      ) : monitors.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-dark-border rounded-2xl">
          <Brain className="w-8 h-8 text-ink-dim mx-auto mb-3" />
          <p className="text-[14px] font-semibold text-ink-secondary">No monitors yet</p>
          <p className="text-[12px] text-ink-muted mt-1 mb-4">
            Create your first semantic monitor to detect behavioral patterns automatically.
          </p>
          <button onClick={() => setShowNew(true)}
            className="px-4 py-2 bg-brand-600 text-white rounded-lg text-[13px] font-semibold hover:bg-brand-500 transition-colors">
            Create monitor
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {active.length > 0 && (
            <>
              <p className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide">Active ({active.length})</p>
              {active.map(m => <MonitorCard key={m.id} monitor={m} projectId={selectedProject.id} />)}
            </>
          )}
          {inactive.length > 0 && (
            <>
              <p className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide mt-4">Disabled ({inactive.length})</p>
              {inactive.map(m => <MonitorCard key={m.id} monitor={m} projectId={selectedProject.id} />)}
            </>
          )}
        </div>
      )}

      {showNew && <CreateMonitorModal projectId={selectedProject.id} onClose={() => setShowNew(false)} />}
    </div>
  );
}
