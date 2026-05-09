"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { experimentsApi, datasetsApi, promptsApi, type ExperimentSummary, type ExperimentDetail, type ExperimentVariant } from "@/lib/api";
import { useProject } from "@/lib/project-context";
import { useOrg } from "@/lib/org-context";
import { ModelPicker } from "@/components/ui/model-picker";
import { DatasetSummary, PromptVersion } from "@/lib/types";
import {
  FlaskConical, Plus, Play, Trash2, ChevronRight, Check,
  Loader2, Trophy, Minus, RefreshCw, AlertCircle, Tag,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft:     "bg-ink-dim/20 text-ink-dim",
    running:   "bg-brand-500/15 text-brand-400",
    completed: "bg-green-500/15 text-green-400",
    failed:    "bg-red-500/15 text-red-400",
  };
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${map[status] ?? map.draft}`}>
      {status === "running" ? <span className="flex items-center gap-1"><Loader2 className="w-2.5 h-2.5 animate-spin" />{status}</span> : status}
    </span>
  );
}

// ── Variant config form ───────────────────────────────────────────────────────

function VariantForm({
  label,
  value,
  onChange,
  orgId,
  prompts,
}: {
  label: string;
  value: ExperimentVariant;
  onChange: (v: ExperimentVariant) => void;
  orgId: string | null;
  prompts: PromptVersion[];
}) {
  const [loadedFrom, setLoadedFrom] = useState<string>("");

  function loadPrompt(name: string) {
    if (!name) { setLoadedFrom(""); return; }
    const p = prompts.find(p => p.name === name);
    if (!p) return;
    setLoadedFrom(name);
    onChange({
      ...value,
      system_prompt: p.system || "",
      model: p.model || value.model,
      label: value.label || p.name,
    });
  }

  return (
    <div className="space-y-3 p-4 bg-dark-raised border border-dark-border rounded-xl">
      <p className="text-[11px] font-bold uppercase tracking-widest text-ink-dim">{label}</p>

      <div>
        <label className="form-label">Display name (optional)</label>
        <input className="input-dark" placeholder={`e.g. ${label} — GPT-4o + new prompt`}
          value={value.label ?? ""} onChange={e => onChange({ ...value, label: e.target.value })} />
      </div>

      {prompts.length > 0 && (
        <div>
          <label className="form-label flex items-center gap-1.5">
            <Tag className="w-3 h-3" />Load from prompt library
          </label>
          <select
            className="input-dark text-[12px]"
            value={loadedFrom}
            onChange={e => loadPrompt(e.target.value)}
          >
            <option value="">— manual entry —</option>
            {prompts.map(p => (
              <option key={p.id} value={p.name}>
                {p.name} {p.model ? `(${p.model})` : ""}
              </option>
            ))}
          </select>
          {loadedFrom && (
            <p className="text-[10px] text-brand-400 mt-1">
              Loaded system prompt from &ldquo;{loadedFrom}&rdquo; — edit below to customise.
            </p>
          )}
        </div>
      )}

      <div>
        <label className="form-label">Model</label>
        <ModelPicker orgId={orgId} value={value.model} onChange={model => onChange({ ...value, model })} />
      </div>

      <div>
        <label className="form-label">System prompt</label>
        <textarea className="input-dark font-mono text-[11px]" rows={4}
          placeholder="You are a helpful assistant…"
          value={value.system_prompt}
          onChange={e => onChange({ ...value, system_prompt: e.target.value })} />
      </div>
    </div>
  );
}

// ── Create experiment modal ───────────────────────────────────────────────────

function CreateModal({
  projectId,
  orgId,
  datasets,
  onClose,
  onCreate,
}: {
  projectId: string;
  orgId: string | null;
  datasets: DatasetSummary[];
  onClose: () => void;
  onCreate: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [datasetId, setDatasetId] = useState(datasets[0]?.id ?? "");
  const [evalCriteria, setEvalCriteria] = useState(
    "Rate the response on quality, accuracy, and helpfulness from 0 to 100."
  );
  const [variantA, setVariantA] = useState<ExperimentVariant>({ model: "claude-sonnet-4-6", system_prompt: "", label: "Variant A" });
  const [variantB, setVariantB] = useState<ExperimentVariant>({ model: "claude-sonnet-4-6", system_prompt: "", label: "Variant B" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const { data: prompts = [] } = useQuery({
    queryKey: ["prompts", projectId],
    queryFn: () => promptsApi.list(projectId),
    staleTime: 30_000,
  });

  async function handleCreate() {
    if (!name.trim()) { setError("Name is required"); return; }
    setSaving(true);
    setError("");
    try {
      await experimentsApi.create({
        project_id: projectId,
        name: name.trim(),
        description: description.trim() || undefined,
        dataset_id: datasetId || undefined,
        eval_criteria: evalCriteria.trim() || undefined,
        variant_a: variantA,
        variant_b: variantB,
      });
      onCreate();
      onClose();
    } catch {
      setError("Failed to create experiment");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-dark-surface border border-dark-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-card">
        <div className="px-6 py-4 border-b border-dark-border flex items-center justify-between sticky top-0 bg-dark-surface">
          <h2 className="text-sm font-semibold text-ink-primary flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-brand-400" /> New Experiment
          </h2>
          <button onClick={onClose} className="text-ink-dim hover:text-ink-secondary">✕</button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/5 border border-red-500/20 rounded-xl">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          <div>
            <label className="form-label">Experiment name</label>
            <input className="input-dark" placeholder="GPT-4o vs Claude on customer support"
              value={name} onChange={e => setName(e.target.value)} />
          </div>

          <div>
            <label className="form-label">Description (optional)</label>
            <input className="input-dark" placeholder="Testing whether a shorter system prompt improves scores"
              value={description} onChange={e => setDescription(e.target.value)} />
          </div>

          <div>
            <label className="form-label">Dataset</label>
            <select className="input-dark" value={datasetId} onChange={e => setDatasetId(e.target.value)}>
              <option value="">— No dataset (run manually) —</option>
              {datasets.map(d => <option key={d.id} value={d.id}>{d.name} ({d.item_count} items)</option>)}
            </select>
          </div>

          <div>
            <label className="form-label">Eval criteria (for the AI judge)</label>
            <textarea className="input-dark" rows={2}
              value={evalCriteria} onChange={e => setEvalCriteria(e.target.value)} />
            <p className="text-[10px] text-ink-dim mt-1">Claude will score each response 0–100 against this criteria.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <VariantForm label="Variant A" value={variantA} onChange={setVariantA} orgId={orgId} prompts={prompts} />
            <VariantForm label="Variant B" value={variantB} onChange={setVariantB} orgId={orgId} prompts={prompts} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-ink-muted hover:text-ink-secondary transition-colors">Cancel</button>
            <button onClick={handleCreate} disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-60">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {saving ? "Creating…" : "Create Experiment"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Results view ──────────────────────────────────────────────────────────────

function ResultsView({ detail }: { detail: ExperimentDetail }) {
  const summary = detail.result_summary;
  const runsA = detail.runs.filter(r => r.variant === "a");
  const runsB = detail.runs.filter(r => r.variant === "b");

  const labelA = detail.variant_a.label || `${detail.variant_a.model}`;
  const labelB = detail.variant_b.label || `${detail.variant_b.model}`;

  return (
    <div className="space-y-4 mt-4">
      {summary && (
        <div className="grid grid-cols-3 gap-3">
          {/* A score */}
          <div className={`p-4 rounded-xl border text-center ${summary.winner === "a" ? "border-green-500/40 bg-green-500/5" : "border-dark-border bg-dark-raised"}`}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-dim mb-1">{labelA}</p>
            <p className="text-3xl font-bold text-ink-primary">{summary.a_avg_score.toFixed(1)}</p>
            <p className="text-xs text-ink-muted mt-0.5">avg score</p>
            {summary.winner === "a" && <p className="flex items-center justify-center gap-1 text-xs text-green-400 mt-1.5"><Trophy className="w-3.5 h-3.5" /> Winner</p>}
          </div>

          {/* Center summary */}
          <div className="p-4 rounded-xl border border-dark-border bg-dark-raised text-center flex flex-col justify-center">
            <p className="text-xs text-ink-muted mb-2">{summary.total_items} items</p>
            <div className="space-y-1">
              <p className="text-[11px] text-ink-muted">A wins: <span className="text-ink-secondary font-medium">{summary.a_wins}</span></p>
              <p className="text-[11px] text-ink-muted">B wins: <span className="text-ink-secondary font-medium">{summary.b_wins}</span></p>
              <p className="text-[11px] text-ink-muted">Ties: <span className="text-ink-secondary font-medium">{summary.ties}</span></p>
            </div>
            {summary.winner === "tie" && <p className="flex items-center justify-center gap-1 text-xs text-ink-dim mt-2"><Minus className="w-3.5 h-3.5" /> Tie</p>}
          </div>

          {/* B score */}
          <div className={`p-4 rounded-xl border text-center ${summary.winner === "b" ? "border-green-500/40 bg-green-500/5" : "border-dark-border bg-dark-raised"}`}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-dim mb-1">{labelB}</p>
            <p className="text-3xl font-bold text-ink-primary">{summary.b_avg_score.toFixed(1)}</p>
            <p className="text-xs text-ink-muted mt-0.5">avg score</p>
            {summary.winner === "b" && <p className="flex items-center justify-center gap-1 text-xs text-green-400 mt-1.5"><Trophy className="w-3.5 h-3.5" /> Winner</p>}
          </div>
        </div>
      )}

      {/* Per-item comparison table */}
      {runsA.length > 0 && (
        <div className="border border-dark-border rounded-xl overflow-hidden">
          <div className="grid grid-cols-[32px_1fr_1fr_1fr] px-3 py-2 bg-dark-raised border-b border-dark-border text-[10px] font-semibold text-ink-dim uppercase tracking-wider">
            <span>#</span>
            <span>Input</span>
            <span>{labelA} ↗</span>
            <span>{labelB} ↗</span>
          </div>
          {runsA.map((runA, i) => {
            const runB = runsB[i];
            const scoreA = runA.score ?? 0;
            const scoreB = runB?.score ?? 0;
            const aWins = scoreA > scoreB;
            const bWins = scoreB > scoreA;

            return (
              <div key={runA.id} className={`grid grid-cols-[32px_1fr_1fr_1fr] px-3 py-3 gap-2 text-[11px] ${i < runsA.length - 1 ? "border-b border-dark-divider" : ""}`}>
                <span className="text-ink-dim pt-0.5">{i + 1}</span>
                <p className="text-ink-muted line-clamp-2 leading-relaxed">{runA.input_text || "—"}</p>

                {/* Variant A result */}
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`text-sm font-semibold ${aWins ? "text-green-400" : "text-ink-secondary"}`}>{scoreA.toFixed(0)}</span>
                    {aWins && <Check className="w-3 h-3 text-green-400" />}
                  </div>
                  {runA.status === "completed" && (
                    <p className="text-[10px] text-ink-dim line-clamp-2 leading-relaxed">{runA.response_text || "—"}</p>
                  )}
                  {runA.status === "running" && <Loader2 className="w-3.5 h-3.5 animate-spin text-ink-dim" />}
                  {runA.status === "failed" && <span className="text-[10px] text-red-400">Failed</span>}
                </div>

                {/* Variant B result */}
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`text-sm font-semibold ${bWins ? "text-green-400" : "text-ink-secondary"}`}>{scoreB.toFixed(0)}</span>
                    {bWins && <Check className="w-3 h-3 text-green-400" />}
                  </div>
                  {runB?.status === "completed" && (
                    <p className="text-[10px] text-ink-dim line-clamp-2 leading-relaxed">{runB.response_text || "—"}</p>
                  )}
                  {runB?.status === "running" && <Loader2 className="w-3.5 h-3.5 animate-spin text-ink-dim" />}
                  {runB?.status === "failed" && <span className="text-[10px] text-red-400">Failed</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Experiment row ────────────────────────────────────────────────────────────

function ExperimentRow({ exp, projectId }: { exp: ExperimentSummary; projectId: string }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  const { data: detail, refetch: refetchDetail } = useQuery<ExperimentDetail>({
    queryKey: ["experiment", exp.id],
    queryFn: () => experimentsApi.get(exp.id),
    enabled: expanded,
    refetchInterval: exp.status === "running" ? 3000 : false,
  });

  const startRun = useMutation({
    mutationFn: () => experimentsApi.run(exp.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["experiments", projectId] });
      refetchDetail();
    },
  });

  const deleteExp = useMutation({
    mutationFn: () => experimentsApi.delete(exp.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["experiments", projectId] }),
  });

  const labelA = exp.variant_a.label || exp.variant_a.model;
  const labelB = exp.variant_b.label || exp.variant_b.model;

  return (
    <div className="border border-dark-border rounded-xl overflow-hidden">
      {/* Header row */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-dark-raised/40 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <ChevronRight className={`w-4 h-4 text-ink-dim shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ink-primary">{exp.name}</p>
          <p className="text-[11px] text-ink-muted mt-0.5">
            {labelA} <span className="text-ink-dim mx-1">vs</span> {labelB}
          </p>
        </div>

        {/* Summary scores */}
        {exp.result_summary && (
          <div className="flex items-center gap-3 text-[12px] shrink-0">
            <span className={exp.result_summary.winner === "a" ? "text-green-400 font-semibold" : "text-ink-muted"}>
              A: {exp.result_summary.a_avg_score.toFixed(1)}
            </span>
            <span className="text-ink-dim">vs</span>
            <span className={exp.result_summary.winner === "b" ? "text-green-400 font-semibold" : "text-ink-muted"}>
              B: {exp.result_summary.b_avg_score.toFixed(1)}
            </span>
          </div>
        )}

        <StatusPill status={exp.status} />
        <span className="text-[11px] text-ink-dim shrink-0">
          {formatDistanceToNow(new Date(exp.created_at), { addSuffix: true })}
        </span>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
          {(exp.status === "draft" || exp.status === "completed" || exp.status === "failed") && exp.dataset_id && (
            <button
              onClick={() => startRun.mutate()}
              disabled={startRun.isPending}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] text-brand-400 border border-brand-500/30 hover:bg-brand-500/10 transition-colors disabled:opacity-50"
            >
              {startRun.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
              {exp.status === "completed" ? "Re-run" : "Run"}
            </button>
          )}
          <button
            onClick={() => { if (confirm("Delete this experiment?")) deleteExp.mutate(); }}
            className="p-1.5 rounded-lg text-ink-dim hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Expanded results */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-dark-divider">
          {exp.status === "draft" && !exp.dataset_id && (
            <p className="text-sm text-ink-muted mt-4">Select a dataset and click Run to start comparing variants.</p>
          )}
          {exp.status === "draft" && exp.dataset_id && (
            <p className="text-sm text-ink-muted mt-4">Click <strong>Run</strong> to start the experiment on the linked dataset.</p>
          )}
          {exp.status === "running" && !detail?.runs.length && (
            <div className="flex items-center gap-2 mt-4 text-sm text-brand-400">
              <Loader2 className="w-4 h-4 animate-spin" /> Running…
            </div>
          )}
          {detail && (exp.status === "running" || exp.status === "completed" || exp.status === "failed") && (
            <ResultsView detail={detail} />
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ExperimentsPage() {
  const { selectedProject } = useProject();
  const { selectedOrg } = useOrg();
  const projectId = selectedProject?.id ?? "";
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data: experiments = [], isLoading } = useQuery<ExperimentSummary[]>({
    queryKey: ["experiments", projectId],
    queryFn: () => experimentsApi.list(projectId),
    enabled: !!projectId,
    refetchInterval: 5000,
  });

  const { data: datasets = [] } = useQuery<DatasetSummary[]>({
    queryKey: ["datasets", projectId],
    queryFn: () => datasetsApi.list(projectId),
    enabled: !!projectId,
  });

  if (!projectId) {
    return <div className="flex items-center justify-center h-64 text-ink-muted text-sm">Select a project to view experiments.</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink-primary flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-brand-400" /> Experiments
          </h1>
          <p className="text-sm text-ink-muted mt-0.5">A/B test prompts and models against your datasets</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-xl transition-colors"
        >
          <Plus className="w-4 h-4" /> New Experiment
        </button>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 bg-brand-500/5 border border-brand-500/15 rounded-xl">
        <FlaskConical className="w-4 h-4 text-brand-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-[13px] font-medium text-ink-secondary">How experiments work</p>
          <p className="text-[12px] text-ink-muted mt-0.5">
            Pick two variants (different models or system prompts), link a dataset, and Dottle runs both on every item
            and scores the responses using an AI judge. You get a side-by-side score comparison to see which variant wins.
            Add API keys in <a href="/settings" className="text-brand-400 hover:underline">Settings → AI Providers</a> to enable more models.
          </p>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-5 h-5 animate-spin text-ink-dim" />
        </div>
      ) : experiments.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-center space-y-3 border border-dark-border rounded-xl bg-dark-raised/30">
          <FlaskConical className="w-8 h-8 text-ink-dim" />
          <p className="text-sm text-ink-muted">No experiments yet</p>
          <button onClick={() => setShowCreate(true)} className="text-[13px] text-brand-400 hover:text-brand-300 transition-colors flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Create your first experiment
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {experiments.map(exp => (
            <ExperimentRow key={exp.id} exp={exp} projectId={projectId} />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateModal
          projectId={projectId}
          orgId={selectedOrg?.id ?? null}
          datasets={datasets}
          onClose={() => setShowCreate(false)}
          onCreate={() => qc.invalidateQueries({ queryKey: ["experiments", projectId] })}
        />
      )}
    </div>
  );
}
