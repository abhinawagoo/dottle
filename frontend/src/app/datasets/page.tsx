"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { datasetsApi } from "@/lib/api";
import { useProject } from "@/lib/project-context";
import { DatasetSummary, DatasetDetail, DatasetRun } from "@/lib/types";
import { clsx } from "clsx";
import { Plus, Trash2, Database, Play, ChevronLeft, CheckCircle2, XCircle, Loader2, BarChart2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

// ── New dataset modal ─────────────────────────────────────────────────────────

function NewDatasetModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const create = useMutation({
    mutationFn: () => datasetsApi.create({ project_id: projectId, name, description: desc || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["datasets", projectId] }); onClose(); },
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-dark-surface border border-dark-border rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-border">
          <h2 className="text-[15px] font-semibold text-ink-primary">New dataset</h2>
          <button onClick={onClose} className="text-ink-dim hover:text-ink-muted text-sm">✕</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide block mb-1.5">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Edge cases Q3"
              className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-[13px] text-ink-primary placeholder-ink-dim focus:outline-none focus:border-brand-500/50" />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide block mb-1.5">Description (optional)</label>
            <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="What is this dataset for?"
              className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-[13px] text-ink-primary placeholder-ink-dim focus:outline-none focus:border-brand-500/50" />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-dark-border">
          <button onClick={onClose} className="px-4 py-2 text-[13px] text-ink-muted">Cancel</button>
          <button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}
            className="px-4 py-2 bg-brand-600 text-white rounded-lg text-[13px] font-semibold hover:bg-brand-500 disabled:opacity-40">
            {create.isPending ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Run modal ─────────────────────────────────────────────────────────────────

function RunModal({ datasetId, onClose }: { datasetId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(`Run ${new Date().toLocaleDateString()}`);
  const [model, setModel] = useState("claude-haiku-4-5-20251001");
  const [criteria, setCriteria] = useState("");

  const run = useMutation({
    mutationFn: () => datasetsApi.createRun(datasetId, { name, model, eval_criteria: criteria || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["dataset", datasetId] }); onClose(); },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-dark-surface border border-dark-border rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-border">
          <h2 className="text-[15px] font-semibold text-ink-primary">Run evaluation</h2>
          <button onClick={onClose} className="text-ink-dim hover:text-ink-muted text-sm">✕</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide block mb-1.5">Run name</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-[13px] text-ink-primary focus:outline-none focus:border-brand-500/50" />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide block mb-1.5">Judge model</label>
            <select value={model} onChange={e => setModel(e.target.value)}
              className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-[12px] text-ink-secondary focus:outline-none">
              <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5 (fast, cheap)</option>
              <option value="claude-sonnet-4-6">Claude Sonnet 4.6 (balanced)</option>
              <option value="claude-opus-4-6">Claude Opus 4.6 (most accurate)</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide block mb-1.5">Eval criteria (optional)</label>
            <textarea value={criteria} onChange={e => setCriteria(e.target.value)} rows={3}
              placeholder="Leave blank to use default: quality, accuracy, helpfulness (0–1)"
              className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2.5 text-[12px] text-ink-secondary placeholder-ink-dim resize-none focus:outline-none focus:border-brand-500/50" />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-dark-border">
          <button onClick={onClose} className="px-4 py-2 text-[13px] text-ink-muted">Cancel</button>
          <button onClick={() => run.mutate()} disabled={!name.trim() || run.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg text-[13px] font-semibold hover:bg-brand-500 disabled:opacity-40">
            <Play className="w-4 h-4" />
            {run.isPending ? "Queuing…" : "Run"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Run row ───────────────────────────────────────────────────────────────────

function RunRow({ run }: { run: DatasetRun }) {
  const completed = run.results.filter(r => r.status === "completed").length;
  const failed = run.results.filter(r => r.status === "failed").length;
  return (
    <div className="flex items-center gap-4 px-4 py-3 rounded-xl bg-dark-raised/40 border border-dark-border">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[12px] font-semibold text-ink-primary">{run.name}</span>
          {run.status === "running" && <Loader2 className="w-3 h-3 text-brand-400 animate-spin" />}
          {run.status === "completed" && <CheckCircle2 className="w-3 h-3 text-green-400" />}
          {run.status === "failed" && <XCircle className="w-3 h-3 text-status-red" />}
        </div>
        <div className="flex items-center gap-3 text-[10px] text-ink-dim">
          <span>{run.model || "default"}</span>
          <span>{completed} scored, {failed} failed</span>
          <span>{formatDistanceToNow(new Date(run.created_at), { addSuffix: true })}</span>
        </div>
      </div>
      {run.avg_score != null && (
        <div className="text-right shrink-0">
          <div className={clsx("text-[18px] font-bold", run.avg_score >= 0.7 ? "text-green-400" : run.avg_score >= 0.4 ? "text-yellow-400" : "text-status-red")}>
            {(run.avg_score * 100).toFixed(0)}<span className="text-[11px] font-normal text-ink-dim">%</span>
          </div>
          <p className="text-[9px] text-ink-dim">avg score</p>
        </div>
      )}
    </div>
  );
}

// ── Dataset detail view ───────────────────────────────────────────────────────

function DatasetDetailView({ datasetId, projectId, onBack }: { datasetId: string; projectId: string; onBack: () => void }) {
  const qc = useQueryClient();
  const [showRun, setShowRun] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["dataset", datasetId],
    queryFn: () => datasetsApi.get(datasetId),
    refetchInterval: (d) => (d.state.data?.runs.some((r: { status: string }) => r.status === "running") ? 3000 : false),
  });

  const removeItem = useMutation({
    mutationFn: (itemId: string) => datasetsApi.deleteItem(datasetId, itemId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dataset", datasetId] }),
  });

  if (isLoading) return <div className="p-8 text-ink-muted text-sm">Loading…</div>;
  if (!data) return null;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="flex items-center gap-1.5 text-[12px] text-ink-muted hover:text-ink-secondary transition-colors">
          <ChevronLeft className="w-4 h-4" />Back
        </button>
        <div className="flex-1">
          <h1 className="text-[20px] font-bold text-ink-primary">{data.name}</h1>
          {data.description && <p className="text-[12px] text-ink-muted">{data.description}</p>}
        </div>
        <button onClick={() => setShowRun(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg text-[13px] font-semibold hover:bg-brand-500 transition-colors">
          <Play className="w-4 h-4" />Run eval
        </button>
      </div>

      {/* Runs */}
      {data.runs.length > 0 && (
        <div className="mb-6">
          <p className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide mb-2">Evaluation runs ({data.runs.length})</p>
          <div className="space-y-2">
            {data.runs.map(r => <RunRow key={r.id} run={r} />)}
          </div>
        </div>
      )}

      {/* Items */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide">Test items ({data.items.length})</p>
        </div>
        {data.items.length === 0 ? (
          <div className="text-center py-10 border-2 border-dashed border-dark-border rounded-xl">
            <p className="text-[13px] text-ink-muted">No items yet</p>
            <p className="text-[11px] text-ink-dim mt-1">Add sessions from the Sessions page → "Add to dataset"</p>
          </div>
        ) : (
          <div className="space-y-2">
            {data.items.map(item => (
              <div key={item.id} className="flex items-start gap-3 px-4 py-3 rounded-xl border border-dark-border bg-dark-raised/30">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {item.session_id && (
                      <span className="text-[10px] font-mono text-ink-dim px-1.5 py-0.5 bg-dark-bg rounded border border-dark-border">
                        session:{item.session_id.slice(0, 8)}
                      </span>
                    )}
                    <span className="text-[10px] text-ink-dim">{formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}</span>
                  </div>
                  {item.expected_output && (
                    <p className="text-[11px] text-ink-muted">Expected: <span className="text-ink-secondary">{item.expected_output.slice(0, 120)}</span></p>
                  )}
                  {Object.keys(item.input).length > 0 && (
                    <pre className="text-[10px] font-mono text-ink-dim mt-1 truncate">{JSON.stringify(item.input).slice(0, 100)}</pre>
                  )}
                </div>
                <button onClick={() => removeItem.mutate(item.id)}
                  className="p-1.5 rounded-lg hover:bg-dark-raised text-ink-dim hover:text-status-red transition-colors shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {showRun && <RunModal datasetId={datasetId} onClose={() => setShowRun(false)} />}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DatasetsPage() {
  const { selectedProject } = useProject();
  const [showNew, setShowNew] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: datasets = [], isLoading } = useQuery({
    queryKey: ["datasets", selectedProject?.id],
    queryFn: () => datasetsApi.list(selectedProject!.id),
    enabled: !!selectedProject,
  });

  if (!selectedProject) return <div className="p-8 text-ink-muted text-sm">Select a project first.</div>;

  if (selectedId) {
    return <DatasetDetailView datasetId={selectedId} projectId={selectedProject.id} onBack={() => setSelectedId(null)} />;
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-bold text-ink-primary">Datasets</h1>
          <p className="text-[13px] text-ink-muted mt-0.5">Collect sessions as test cases. Run eval suites to track regressions.</p>
        </div>
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg text-[13px] font-semibold hover:bg-brand-500 transition-colors">
          <Plus className="w-4 h-4" />New dataset
        </button>
      </div>

      {isLoading ? (
        <div className="text-ink-muted text-sm">Loading…</div>
      ) : datasets.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-dark-border rounded-2xl">
          <Database className="w-8 h-8 text-ink-dim mx-auto mb-3" />
          <p className="text-[14px] font-semibold text-ink-secondary">No datasets yet</p>
          <p className="text-[12px] text-ink-muted mt-1 mb-4">Create a dataset, add sessions as test cases, then run evaluations.</p>
          <button onClick={() => setShowNew(true)}
            className="px-4 py-2 bg-brand-600 text-white rounded-lg text-[13px] font-semibold hover:bg-brand-500 transition-colors">
            Create dataset
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {datasets.map((d: DatasetSummary) => (
            <div key={d.id} onClick={() => setSelectedId(d.id)}
              className="flex items-center gap-4 px-5 py-4 rounded-xl border border-dark-border bg-dark-raised/30 hover:bg-dark-raised/60 cursor-pointer transition-all">
              <div className="w-9 h-9 rounded-xl bg-brand-600/10 border border-brand-500/20 flex items-center justify-center shrink-0">
                <Database className="w-4 h-4 text-brand-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-ink-primary">{d.name}</p>
                {d.description && <p className="text-[11px] text-ink-muted truncate">{d.description}</p>}
              </div>
              <div className="flex items-center gap-4 text-[11px] text-ink-dim shrink-0">
                <span>{d.item_count} items</span>
                <span>{d.run_count} runs</span>
                <span>{formatDistanceToNow(new Date(d.updated_at), { addSuffix: true })}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showNew && <NewDatasetModal projectId={selectedProject.id} onClose={() => setShowNew(false)} />}
    </div>
  );
}
