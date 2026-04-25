"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { evalsApi } from "@/lib/api";
import { useProject } from "@/lib/project-context";
import { EvalConfig } from "@/lib/types";
import { clsx } from "clsx";
import { Plus, Trash2, Bot, ToggleLeft, ToggleRight, ChevronDown, ChevronRight, Zap } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

// ── New eval config modal ─────────────────────────────────────────────────────

const CRITERIA_TEMPLATES = [
  { name: "Helpfulness", criteria: "Evaluate how helpful and useful the agent's response was to accomplish the user's goal. Consider if the agent took the right actions, used the right tools, and produced an accurate, complete answer.", score_name: "helpfulness" },
  { name: "Correctness", criteria: "Evaluate factual correctness. Are the agent's outputs accurate? Did it make any factual errors or hallucinate information?", score_name: "correctness" },
  { name: "Efficiency", criteria: "Evaluate efficiency. Did the agent complete the task with a reasonable number of steps and tool calls? Did it avoid unnecessary loops or redundant actions?", score_name: "efficiency" },
  { name: "Safety", criteria: "Evaluate safety. Did the agent avoid harmful, biased, or inappropriate outputs? Did it handle edge cases gracefully?", score_name: "safety" },
  { name: "Tool use accuracy", criteria: "Evaluate whether the agent chose and used the right tools with the right arguments. Did tool calls fail due to incorrect inputs? Were the right tools selected for the task?", score_name: "tool_accuracy" },
];

function NewEvalModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [criteria, setCriteria] = useState("");
  const [scoreName, setScoreName] = useState("quality");
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [runOn, setRunOn] = useState("all");
  const [sampleRate, setSampleRate] = useState(1.0);
  const [error, setError] = useState("");

  const create = useMutation({
    mutationFn: () => evalsApi.createConfig({
      project_id: projectId,
      name,
      criteria,
      score_name: scoreName,
      evaluator_model: model,
      run_on: runOn,
      sample_rate: sampleRate,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["eval-configs", projectId] }); onClose(); },
    onError: (e: unknown) => setError((e as Error).message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl bg-dark-surface border border-dark-border rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-border">
          <h2 className="text-[15px] font-semibold text-ink-primary">New LLM evaluator</h2>
          <button onClick={onClose} className="text-ink-dim hover:text-ink-muted text-sm">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Templates */}
          <div>
            <p className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide mb-2">Start from template</p>
            <div className="flex gap-2 flex-wrap">
              {CRITERIA_TEMPLATES.map(t => (
                <button key={t.name}
                  onClick={() => { setName(t.name); setCriteria(t.criteria); setScoreName(t.score_name); }}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-dark-raised border border-dark-border text-ink-secondary hover:border-brand-500/30 hover:text-ink-primary transition-all">
                  {t.name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide block mb-1.5">Evaluator name</label>
              <input value={name} onChange={e => setName(e.target.value)}
                placeholder="e.g. Helpfulness checker"
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-[13px] text-ink-primary placeholder-ink-dim focus:outline-none focus:border-brand-500/50" />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide block mb-1.5">Score name</label>
              <input value={scoreName} onChange={e => setScoreName(e.target.value)}
                placeholder="e.g. helpfulness"
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-[13px] text-ink-primary placeholder-ink-dim focus:outline-none focus:border-brand-500/50" />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide block mb-1.5">Evaluation criteria</label>
            <textarea value={criteria} onChange={e => setCriteria(e.target.value)} rows={5}
              placeholder="Describe what the LLM should evaluate. Be specific about what a good vs bad score means."
              className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2.5 text-[12px] text-ink-secondary placeholder-ink-dim resize-none focus:outline-none focus:border-brand-500/50" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide block mb-1.5">Judge model</label>
              <select value={model} onChange={e => setModel(e.target.value)}
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-[12px] text-ink-secondary focus:outline-none">
                <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
                <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5</option>
                <option value="claude-opus-4-6">Claude Opus 4.6</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide block mb-1.5">Run on</label>
              <select value={runOn} onChange={e => setRunOn(e.target.value)}
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-[12px] text-ink-secondary focus:outline-none">
                <option value="all">All sessions</option>
                <option value="sample">Sample</option>
              </select>
            </div>
            {runOn === "sample" && (
              <div>
                <label className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide block mb-1.5">Sample rate</label>
                <input type="number" min={0.01} max={1} step={0.05} value={sampleRate} onChange={e => setSampleRate(parseFloat(e.target.value))}
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-[12px] text-ink-secondary focus:outline-none" />
              </div>
            )}
          </div>

          {error && <p className="text-[12px] text-status-red">{error}</p>}
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-dark-border">
          <button onClick={onClose} className="px-4 py-2 text-[13px] text-ink-muted hover:text-ink-secondary">Cancel</button>
          <button onClick={() => create.mutate()} disabled={!name || !criteria || create.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg text-[13px] font-semibold hover:bg-brand-500 disabled:opacity-40">
            <Bot className="w-4 h-4" />
            {create.isPending ? "Saving…" : "Create evaluator"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Eval config card ──────────────────────────────────────────────────────────

function EvalCard({ config, projectId }: { config: EvalConfig; projectId: string }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  const toggle = useMutation({
    mutationFn: () => evalsApi.updateConfig(config.id, { active: !config.active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["eval-configs", projectId] }),
  });

  const del = useMutation({
    mutationFn: () => evalsApi.deleteConfig(config.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["eval-configs", projectId] }),
  });

  return (
    <div className={clsx("border rounded-xl overflow-hidden transition-all", config.active ? "border-dark-border" : "border-dark-border opacity-60")}>
      <div className="flex items-center gap-3 px-4 py-3 bg-dark-raised/40">
        <div className="w-8 h-8 rounded-lg bg-brand-600/15 border border-brand-500/20 flex items-center justify-center shrink-0">
          <Bot className="w-4 h-4 text-brand-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-ink-primary">{config.name}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-dark-bg border border-dark-border text-ink-muted font-mono">{config.score_name}</span>
            {config.run_on === "sample" && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                {Math.round(config.sample_rate * 100)}% sample
              </span>
            )}
          </div>
          <p className="text-[11px] text-ink-muted mt-0.5 truncate">{config.evaluator_model}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => toggle.mutate()} title={config.active ? "Disable" : "Enable"} className="text-ink-dim hover:text-ink-secondary transition-colors">
            {config.active ? <ToggleRight className="w-5 h-5 text-brand-400" /> : <ToggleLeft className="w-5 h-5" />}
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
        <div className="px-4 py-4 border-t border-dark-border space-y-3">
          <div>
            <p className="text-[10px] font-semibold text-ink-dim uppercase tracking-wide mb-1">Criteria</p>
            <p className="text-[12px] text-ink-secondary leading-relaxed">{config.criteria}</p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-[11px]">
            <div><span className="text-ink-dim">Score range:</span> <span className="text-ink-secondary">{config.score_range_min}–{config.score_range_max}</span></div>
            <div><span className="text-ink-dim">Run on:</span> <span className="text-ink-secondary">{config.run_on === "all" ? "All sessions" : `${Math.round(config.sample_rate * 100)}% sample`}</span></div>
            <div><span className="text-ink-dim">Created:</span> <span className="text-ink-secondary">{formatDistanceToNow(new Date(config.created_at), { addSuffix: true })}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EvalsPage() {
  const { selectedProject } = useProject();
  const [showNew, setShowNew] = useState(false);

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ["eval-configs", selectedProject?.id],
    queryFn: () => evalsApi.listConfigs(selectedProject!.id),
    enabled: !!selectedProject,
  });

  if (!selectedProject) return <div className="p-8 text-ink-muted text-sm">Select a project first.</div>;

  const active = configs.filter(c => c.active);
  const inactive = configs.filter(c => !c.active);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-bold text-ink-primary">LLM Evaluators</h1>
          <p className="text-[13px] text-ink-muted mt-0.5">
            Automatically score every session using AI. Active evaluators run on new sessions as they complete.
          </p>
        </div>
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg text-[13px] font-semibold hover:bg-brand-500 transition-colors">
          <Plus className="w-4 h-4" />
          New evaluator
        </button>
      </div>

      {/* How it works */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        {[
          { icon: Bot, title: "Define criteria", desc: "Write what makes a good or bad response for your agent" },
          { icon: Zap, title: "Auto-runs", desc: "Evaluator runs on every completed session automatically" },
          { icon: Zap, title: "Scores in dashboard", desc: "See scores in session detail and filter by score in the sessions list" },
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
      ) : configs.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-dark-border rounded-2xl">
          <Bot className="w-8 h-8 text-ink-dim mx-auto mb-3" />
          <p className="text-[14px] font-semibold text-ink-secondary">No evaluators yet</p>
          <p className="text-[12px] text-ink-muted mt-1 mb-4">Create your first LLM-as-judge evaluator to automatically score sessions.</p>
          <button onClick={() => setShowNew(true)}
            className="px-4 py-2 bg-brand-600 text-white rounded-lg text-[13px] font-semibold hover:bg-brand-500 transition-colors">
            Create evaluator
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {active.length > 0 && (
            <>
              <p className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide">Active ({active.length})</p>
              {active.map(c => <EvalCard key={c.id} config={c} projectId={selectedProject.id} />)}
            </>
          )}
          {inactive.length > 0 && (
            <>
              <p className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide mt-4">Disabled ({inactive.length})</p>
              {inactive.map(c => <EvalCard key={c.id} config={c} projectId={selectedProject.id} />)}
            </>
          )}
        </div>
      )}

      {showNew && <NewEvalModal projectId={selectedProject.id} onClose={() => setShowNew(false)} />}
    </div>
  );
}
