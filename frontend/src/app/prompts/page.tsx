"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { promptsApi } from "@/lib/api";
import { useProject } from "@/lib/project-context";
import { PromptVersion } from "@/lib/types";
import { clsx } from "clsx";
import { Plus, ChevronDown, ChevronRight, Check, Trash2, Tag, History, Copy } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractVariables(content: string): string[] {
  return [...new Set([...content.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]))];
}

// ── New Prompt modal ──────────────────────────────────────────────────────────

function NewPromptModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [label, setLabel] = useState("");
  const [commitMsg, setCommitMsg] = useState("");
  const [error, setError] = useState("");

  const create = useMutation({
    mutationFn: () => promptsApi.create({ project_id: projectId, name, content, label: label || undefined, commit_message: commitMsg || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["prompts", projectId] }); onClose(); },
    onError: (e: unknown) => setError((e as Error).message),
  });

  const vars = extractVariables(content);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-dark-surface border border-dark-border rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-border">
          <h2 className="text-[15px] font-semibold text-ink-primary">New prompt</h2>
          <button onClick={onClose} className="text-ink-dim hover:text-ink-muted text-sm">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide block mb-1.5">Name (slug)</label>
              <input value={name} onChange={e => setName(e.target.value.replace(/\s/g, "-").toLowerCase())}
                placeholder="e.g. summarize-article"
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-[13px] text-ink-primary placeholder-ink-dim focus:outline-none focus:border-brand-500/50" />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide block mb-1.5">Label (optional)</label>
              <input value={label} onChange={e => setLabel(e.target.value)}
                placeholder="e.g. v1-prod"
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-[13px] text-ink-primary placeholder-ink-dim focus:outline-none focus:border-brand-500/50" />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide block mb-1.5">
              Prompt content — use {"{{variable}}"} for variables
            </label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={10}
              placeholder={"You are a helpful assistant.\n\nSummarize the following article:\n\n{{article}}\n\nRespond in {{language}}."}
              className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2.5 text-[12px] font-mono text-ink-secondary placeholder-ink-dim resize-none focus:outline-none focus:border-brand-500/50"
            />
            {vars.length > 0 && (
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <span className="text-[10px] text-ink-dim">Variables:</span>
                {vars.map(v => (
                  <span key={v} className="text-[10px] px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-400 border border-brand-500/20 font-mono">{`{{${v}}}`}</span>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide block mb-1.5">Commit message (optional)</label>
            <input value={commitMsg} onChange={e => setCommitMsg(e.target.value)}
              placeholder="e.g. Improved tone, reduced verbosity"
              className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-[13px] text-ink-primary placeholder-ink-dim focus:outline-none focus:border-brand-500/50" />
          </div>

          {error && <p className="text-[12px] text-status-red">{error}</p>}
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-dark-border">
          <button onClick={onClose} className="px-4 py-2 text-[13px] text-ink-muted hover:text-ink-secondary transition-colors">Cancel</button>
          <button
            onClick={() => create.mutate()}
            disabled={!name.trim() || !content.trim() || create.isPending}
            className="px-4 py-2 bg-brand-600 text-white rounded-lg text-[13px] font-semibold hover:bg-brand-500 transition-colors disabled:opacity-40">
            {create.isPending ? "Saving…" : "Save prompt"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Version history panel ─────────────────────────────────────────────────────

function VersionRow({ v, projectId, onActivate }: { v: PromptVersion; projectId: string; onActivate: () => void }) {
  const [copied, setCopied] = useState(false);
  const qc = useQueryClient();

  const activate = useMutation({
    mutationFn: () => promptsApi.activate(v.name, v.version, projectId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["prompts", projectId] }); onActivate(); },
  });

  const del = useMutation({
    mutationFn: () => promptsApi.delete(v.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prompts", projectId] }),
  });

  return (
    <div className={clsx(
      "flex items-start gap-3 px-4 py-3 rounded-xl border transition-all",
      v.is_active ? "border-brand-500/30 bg-brand-500/5" : "border-dark-border bg-dark-raised/40"
    )}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[12px] font-semibold text-ink-primary">v{v.version}</span>
          {v.label && <span className="text-[10px] px-1.5 py-0.5 rounded bg-dark-raised border border-dark-border text-ink-muted">{v.label}</span>}
          {v.is_active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-500/15 text-brand-400 border border-brand-500/20 font-semibold">ACTIVE</span>}
          <span className="text-[10px] text-ink-dim ml-auto">{formatDistanceToNow(new Date(v.created_at), { addSuffix: true })}</span>
        </div>
        {v.commit_message && <p className="text-[11px] text-ink-muted truncate">{v.commit_message}</p>}
        <pre className="text-[10px] font-mono text-ink-dim mt-1.5 line-clamp-2 whitespace-pre-wrap">{v.content.slice(0, 120)}{v.content.length > 120 ? "…" : ""}</pre>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button onClick={() => { navigator.clipboard.writeText(v.content); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="p-1.5 rounded-lg hover:bg-dark-raised text-ink-dim hover:text-ink-muted transition-colors" title="Copy content">
          {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
        {!v.is_active && (
          <button onClick={() => activate.mutate()}
            className="px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-dark-raised border border-dark-border text-ink-muted hover:text-ink-primary hover:border-brand-500/30 transition-all">
            Activate
          </button>
        )}
        <button onClick={() => del.mutate()}
          className="p-1.5 rounded-lg hover:bg-dark-raised text-ink-dim hover:text-status-red transition-colors">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── Prompt row ────────────────────────────────────────────────────────────────

function PromptRow({ prompt, projectId }: { prompt: PromptVersion; projectId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const { data: versions } = useQuery({
    queryKey: ["prompt-versions", prompt.name, projectId],
    queryFn: () => promptsApi.versions(prompt.name, projectId),
    enabled: showHistory,
  });

  return (
    <div className="border border-dark-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-dark-raised/40 cursor-pointer hover:bg-dark-raised/60 transition-colors"
        onClick={() => setExpanded(e => !e)}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-[13px] font-semibold text-ink-primary font-mono">{prompt.name}</span>
            {prompt.label && <span className="text-[10px] px-1.5 py-0.5 rounded bg-dark-bg border border-dark-border text-ink-muted">{prompt.label}</span>}
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-400 border border-brand-500/20">v{prompt.version}</span>
            {prompt.variables.length > 0 && prompt.variables.map(v => (
              <span key={v} className="text-[9px] px-1 py-0.5 rounded bg-dark-bg border border-dark-border text-ink-dim font-mono">{`{{${v}}}`}</span>
            ))}
          </div>
          {prompt.commit_message && <p className="text-[11px] text-ink-muted mt-0.5">{prompt.commit_message}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-ink-dim">{formatDistanceToNow(new Date(prompt.created_at), { addSuffix: true })}</span>
          {expanded ? <ChevronDown className="w-4 h-4 text-ink-dim" /> : <ChevronRight className="w-4 h-4 text-ink-dim" />}
        </div>
      </div>

      {expanded && (
        <div className="px-4 py-4 border-t border-dark-border space-y-3">
          {/* Content */}
          <pre className="bg-dark-bg border border-dark-border rounded-xl p-4 text-[11px] font-mono text-ink-secondary whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
            {prompt.content}
          </pre>

          {/* SDK snippet */}
          <div className="bg-dark-bg border border-dark-border rounded-xl p-3">
            <p className="text-[10px] font-semibold text-ink-dim uppercase tracking-wide mb-2">SDK Usage</p>
            <pre className="text-[10px] font-mono text-ink-secondary">{`import dottle\nprompt = dottle.get_prompt("${prompt.name}")  # always gets active version\ntext = prompt.compile(${prompt.variables.map(v => `${v}="..."`).join(", ")})`}</pre>
          </div>

          {/* History toggle */}
          <button
            onClick={() => setShowHistory(h => !h)}
            className="flex items-center gap-1.5 text-[12px] text-ink-muted hover:text-ink-secondary transition-colors">
            <History className="w-3.5 h-3.5" />
            {showHistory ? "Hide" : "Show"} version history
          </button>

          {showHistory && versions && (
            <div className="space-y-2">
              {versions.map(v => (
                <VersionRow key={v.id} v={v} projectId={projectId} onActivate={() => setShowHistory(false)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PromptsPage() {
  const { selectedProject } = useProject();
  const [showNew, setShowNew] = useState(false);

  const { data: prompts = [], isLoading } = useQuery({
    queryKey: ["prompts", selectedProject?.id],
    queryFn: () => promptsApi.list(selectedProject!.id),
    enabled: !!selectedProject,
  });

  if (!selectedProject) return <div className="p-8 text-ink-muted text-sm">Select a project first.</div>;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-bold text-ink-primary">Prompt Management</h1>
          <p className="text-[13px] text-ink-muted mt-0.5">Version-controlled prompts. Fetch the active version from your code at runtime.</p>
        </div>
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg text-[13px] font-semibold hover:bg-brand-500 transition-colors">
          <Plus className="w-4 h-4" />
          New prompt
        </button>
      </div>

      {/* SDK snippet */}
      <div className="mb-6 p-4 bg-dark-raised border border-dark-border rounded-xl">
        <p className="text-[11px] font-semibold text-ink-dim uppercase tracking-wide mb-2">Fetch prompts at runtime</p>
        <pre className="text-[11px] font-mono text-ink-secondary">{`import dottle
dottle.configure(api_key=os.environ["DOTTLE_API_KEY"])

# Always gets the active version — change in dashboard, no deploy needed
prompt = dottle.get_prompt("your-prompt-name")
messages = [{"role": "user", "content": prompt.compile(variable="value")}]`}</pre>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-ink-muted text-sm">Loading…</div>
      ) : prompts.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-dark-border rounded-2xl">
          <Tag className="w-8 h-8 text-ink-dim mx-auto mb-3" />
          <p className="text-[14px] font-semibold text-ink-secondary">No prompts yet</p>
          <p className="text-[12px] text-ink-muted mt-1 mb-4">Create your first prompt to manage it with version control.</p>
          <button onClick={() => setShowNew(true)}
            className="px-4 py-2 bg-brand-600 text-white rounded-lg text-[13px] font-semibold hover:bg-brand-500 transition-colors">
            Create prompt
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {prompts.map(p => <PromptRow key={p.id} prompt={p} projectId={selectedProject.id} />)}
        </div>
      )}

      {showNew && <NewPromptModal projectId={selectedProject.id} onClose={() => setShowNew(false)} />}
    </div>
  );
}
