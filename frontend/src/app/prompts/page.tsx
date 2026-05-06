"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { promptsApi, playgroundApi, apiErrorMessage } from "@/lib/api";
import { useProject } from "@/lib/project-context";
import { useOrg } from "@/lib/org-context";
import { PromptVersion } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ModelPicker } from "@/components/ui/model-picker";
import {
  Plus, ChevronRight, Check, Trash2, Tag, History,
  Copy, Play, Loader2, Save, RotateCcw, Zap,
  ChevronDown, Code2, FlaskConical, Clock, Hash,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

// ── Helpers ────────────────────────────────────────────────────────────────────

function extractVariables(content: string): string[] {
  return [...new Set([...content.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]))];
}

function compilePrompt(content: string, vars: Record<string, string>): string {
  return content.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

// ── New Prompt modal ──────────────────────────────────────────────────────────

function NewPromptModal({ projectId, onClose, onCreated }: {
  projectId: string;
  onClose: () => void;
  onCreated: (name: string) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");

  const create = useMutation({
    mutationFn: () => promptsApi.create({ project_id: projectId, name, content, label: label || undefined }),
    onSuccess: (p) => { qc.invalidateQueries({ queryKey: ["prompts", projectId] }); onCreated(p.name); },
    onError: (e: unknown) => setError((e as Error).message),
  });

  const vars = extractVariables(content);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-[#111113] border border-dark-border rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-border">
          <h2 className="text-[15px] font-semibold text-ink-primary">New prompt</h2>
          <button onClick={onClose} className="text-ink-dim hover:text-ink-muted">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide block mb-1.5">Name (slug)</label>
              <input
                autoFocus
                value={name}
                onChange={e => setName(e.target.value.replace(/\s+/g, "-").toLowerCase())}
                placeholder="e.g. summarize-article"
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-[13px] text-ink-primary placeholder-ink-dim focus:outline-none focus:border-brand-500/60"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide block mb-1.5">Label (optional)</label>
              <input
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="e.g. v1-prod"
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-[13px] text-ink-primary placeholder-ink-dim focus:outline-none focus:border-brand-500/60"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide block mb-1.5">
              Prompt content — use {"{{variable}}"} for template variables
            </label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={12}
              placeholder={"You are a helpful assistant.\n\nSummarize the following article:\n\n{{article}}\n\nRespond in {{language}}."}
              className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2.5 text-[12px] font-mono text-ink-secondary placeholder-ink-dim resize-none focus:outline-none focus:border-brand-500/60 leading-relaxed"
            />
            {vars.length > 0 && (
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <span className="text-[10px] text-ink-dim">Variables detected:</span>
                {vars.map(v => (
                  <span key={v} className="text-[10px] px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-400 border border-brand-500/20 font-mono">{`{{${v}}}`}</span>
                ))}
              </div>
            )}
          </div>

          {error && <p className="text-[12px] text-red-400">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-dark-border">
          <button onClick={onClose} className="px-4 py-2 text-[13px] text-ink-muted hover:text-ink-secondary">Cancel</button>
          <button
            onClick={() => create.mutate()}
            disabled={!name.trim() || !content.trim() || create.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg text-[13px] font-semibold hover:bg-brand-500 disabled:opacity-40 transition-colors"
          >
            {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {create.isPending ? "Creating…" : "Create prompt"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Version history item ───────────────────────────────────────────────────────

function VersionItem({
  v,
  projectId,
  isLoaded,
  onLoad,
  onActivated,
}: {
  v: PromptVersion;
  projectId: string;
  isLoaded: boolean;
  onLoad: (content: string) => void;
  onActivated: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const qc = useQueryClient();

  const activate = useMutation({
    mutationFn: () => promptsApi.activate(v.name, v.version, projectId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["prompt-versions", v.name, projectId] }); onActivated(); },
  });

  const del = useMutation({
    mutationFn: () => promptsApi.delete(v.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prompt-versions", v.name, projectId] }),
  });

  return (
    <div className={cn(
      "rounded-xl border p-3 transition-all",
      v.is_active ? "border-brand-500/30 bg-brand-500/5" : "border-dark-border bg-dark-raised/30",
      isLoaded && "ring-1 ring-brand-400/40",
    )}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[12px] font-bold text-ink-primary">v{v.version}</span>
        {v.label && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-dark-raised border border-dark-border text-ink-muted">{v.label}</span>
        )}
        {v.is_active && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-500/15 text-brand-400 border border-brand-500/20 font-semibold">ACTIVE</span>
        )}
        <span className="text-[10px] text-ink-dim ml-auto">{formatDistanceToNow(new Date(v.created_at), { addSuffix: true })}</span>
      </div>

      {v.commit_message && (
        <p className="text-[11px] text-ink-muted mb-1.5 truncate">{v.commit_message}</p>
      )}

      <pre className="text-[10px] font-mono text-ink-dim line-clamp-2 whitespace-pre-wrap mb-2">
        {v.content.slice(0, 100)}{v.content.length > 100 ? "…" : ""}
      </pre>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onLoad(v.content)}
          className={cn(
            "px-2 py-0.5 rounded text-[10px] font-semibold border transition-colors",
            isLoaded
              ? "bg-brand-500/15 border-brand-500/30 text-brand-400"
              : "border-dark-border text-ink-muted hover:text-ink-primary hover:border-dark-divider"
          )}
        >
          {isLoaded ? "Loaded" : "Load"}
        </button>
        {!v.is_active && (
          <button
            onClick={() => activate.mutate()}
            disabled={activate.isPending}
            className="px-2 py-0.5 rounded text-[10px] font-semibold border border-dark-border text-ink-muted hover:text-brand-400 hover:border-brand-500/30 transition-colors"
          >
            Activate
          </button>
        )}
        <button
          onClick={() => { navigator.clipboard.writeText(v.content); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="p-1 rounded hover:bg-dark-raised text-ink-dim hover:text-ink-muted transition-colors ml-auto"
        >
          {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
        </button>
        {!v.is_active && (
          <button
            onClick={() => del.mutate()}
            className="p-1 rounded hover:bg-dark-raised text-ink-dim hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Prompt detail view ─────────────────────────────────────────────────────────

function PromptDetailView({
  promptName,
  projectId,
  orgId,
  onBack,
}: {
  promptName: string;
  projectId: string;
  orgId: string | null;
  onBack: () => void;
}) {
  const qc = useQueryClient();

  // Load active version
  const { data: active } = useQuery({
    queryKey: ["prompt-active", promptName, projectId],
    queryFn: () => promptsApi.get(promptName, projectId),
  });

  // Load all versions
  const { data: versions = [] } = useQuery({
    queryKey: ["prompt-versions", promptName, projectId],
    queryFn: () => promptsApi.versions(promptName, projectId),
  });

  // Editor state
  const [content, setContent] = useState("");
  const [commitMsg, setCommitMsg] = useState("");
  const [loadedVersion, setLoadedVersion] = useState<number | null>(null);

  // Populate editor from active version once loaded
  useEffect(() => {
    if (active && content === "") {
      setContent(active.content);
      setLoadedVersion(active.version);
    }
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  const vars = extractVariables(content);
  const isDirty = content !== (versions.find(v => v.version === loadedVersion)?.content ?? active?.content ?? "");

  // Test runner state
  const [varValues, setVarValues] = useState<Record<string, string>>({});
  const [model, setModel] = useState("claude-haiku-4-5-20251001");
  const [testResult, setTestResult] = useState<{
    content: string; input_tokens: number; output_tokens: number; cost_usd: number;
  } | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const runTest = useMutation({
    mutationFn: () => {
      const compiled = compilePrompt(content, varValues);
      return playgroundApi.run({
        model,
        messages: [{ role: "user", content: compiled }],
        max_tokens: 1024,
        org_id: orgId ?? undefined,
      });
    },
    onSuccess: (r) => { setTestResult(r); setTestError(null); },
    onError: (e: unknown) => { setTestError(apiErrorMessage(e)); setTestResult(null); },
  });

  // Save new version
  const save = useMutation({
    mutationFn: () => promptsApi.create({
      project_id: projectId,
      name: promptName,
      content,
      commit_message: commitMsg || undefined,
    }),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ["prompt-versions", promptName, projectId] });
      qc.invalidateQueries({ queryKey: ["prompt-active", promptName, projectId] });
      qc.invalidateQueries({ queryKey: ["prompts", projectId] });
      setCommitMsg("");
      setLoadedVersion(p.version);
    },
  });

  // Right panel drag resize
  const [rightWidth, setRightWidth] = useState(340);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startX - e.clientX;
      setRightWidth(Math.max(280, Math.min(520, dragRef.current.startW + delta)));
    };
    const onUp = () => { dragRef.current = null; document.body.style.cursor = ""; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  const activeVersion = versions.find(v => v.is_active);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-4 h-11 border-b border-dark-border bg-[#111113] shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-[12px] text-ink-muted hover:text-ink-secondary transition-colors shrink-0"
        >
          <ChevronRight className="w-3.5 h-3.5 rotate-180" />Prompts
        </button>
        <span className="text-ink-muted">/</span>
        <span className="text-[13px] font-semibold text-ink-primary font-mono">{promptName}</span>
        {activeVersion && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-400 border border-brand-500/20 font-semibold">
            v{activeVersion.version} active
          </span>
        )}
        {isDirty && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/25">
            unsaved changes
          </span>
        )}

        <div className="flex items-center gap-2 ml-auto shrink-0">
          {isDirty && (
            <button
              onClick={() => {
                const base = versions.find(v => v.version === loadedVersion) ?? active;
                if (base) setContent(base.content);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] text-ink-muted hover:text-ink-secondary border border-dark-border rounded-lg hover:bg-dark-raised transition-colors"
            >
              <RotateCcw className="w-3 h-3" />Revert
            </button>
          )}
          <button
            onClick={() => save.mutate()}
            disabled={!isDirty || save.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 text-white rounded-lg text-[12px] font-semibold hover:bg-brand-500 disabled:opacity-40 transition-colors"
          >
            {save.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {save.isPending ? "Saving…" : "Save version"}
          </button>
        </div>
      </div>

      {/* Main split */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>

        {/* Left: editor */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Commit message bar */}
          <div className="flex items-center gap-3 px-4 py-2 border-b border-dark-border bg-dark-bg shrink-0">
            <Code2 className="w-3.5 h-3.5 text-ink-muted shrink-0" />
            <input
              value={commitMsg}
              onChange={e => setCommitMsg(e.target.value)}
              placeholder="Describe this version… (optional)"
              className="flex-1 bg-transparent text-[12px] text-ink-secondary placeholder-ink-dim outline-none"
            />
            {vars.length > 0 && (
              <div className="flex items-center gap-1 shrink-0">
                {vars.map(v => (
                  <span key={v} className="text-[10px] px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-400 border border-brand-500/20 font-mono">{`{{${v}}}`}</span>
                ))}
              </div>
            )}
          </div>

          {/* Prompt textarea */}
          <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              spellCheck={false}
              className="w-full h-full resize-none bg-dark-bg text-[13px] font-mono text-ink-primary placeholder-ink-dim outline-none px-6 py-5 leading-relaxed"
              placeholder={"You are a helpful assistant.\n\nSummarize the following:\n\n{{input}}"}
              style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace" }}
            />
          </div>

          {/* SDK snippet bar */}
          <div className="shrink-0 border-t border-dark-border bg-dark-bg px-4 py-2.5">
            <div className="flex items-center gap-2">
              <Hash className="w-3 h-3 text-ink-muted" />
              <pre className="text-[10px] font-mono text-ink-dim flex-1 truncate">
                {`import dottle; prompt = dottle.get_prompt("${promptName}"); text = prompt.compile(${vars.map(v => `${v}="..."`).join(", ")})`}
              </pre>
              <button
                onClick={() => navigator.clipboard.writeText(`import dottle\nprompt = dottle.get_prompt("${promptName}")\ntext = prompt.compile(${vars.map(v => `${v}="..."`).join(", ")})`)}
                className="p-1 rounded hover:bg-dark-raised text-ink-dim hover:text-ink-muted transition-colors shrink-0"
              >
                <Copy className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        {/* Drag handle */}
        <div
          onMouseDown={e => {
            e.preventDefault();
            dragRef.current = { startX: e.clientX, startW: rightWidth };
            document.body.style.cursor = "col-resize";
          }}
          style={{ width: 5, flexShrink: 0, cursor: "col-resize", background: "var(--c-border)" }}
          className="hover:bg-brand-400/50 transition-colors"
        />

        {/* Right: test runner + history */}
        <div style={{ width: rightWidth, flexShrink: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>

          {/* Test runner */}
          <div className="shrink-0 border-b border-dark-border">
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-dark-border bg-[#111113]">
              <FlaskConical className="w-3.5 h-3.5 text-brand-400" />
              <span className="text-[12px] font-semibold text-ink-primary">Test runner</span>
            </div>

            <div className="p-3 space-y-2.5 bg-[#0d0d0f]">
              {/* Variable inputs */}
              {vars.length > 0 && (
                <div className="space-y-2">
                  {vars.map(v => (
                    <div key={v}>
                      <label className="text-[10px] font-semibold text-ink-muted uppercase tracking-wide block mb-1">
                        <span className="font-mono text-brand-400">{`{{${v}}}`}</span>
                      </label>
                      <input
                        value={varValues[v] ?? ""}
                        onChange={e => setVarValues(prev => ({ ...prev, [v]: e.target.value }))}
                        placeholder={`Value for ${v}…`}
                        className="w-full bg-dark-bg border border-dark-border rounded-lg px-2.5 py-1.5 text-[12px] text-ink-primary placeholder-ink-dim focus:outline-none focus:border-brand-500/60"
                      />
                    </div>
                  ))}
                </div>
              )}

              {vars.length === 0 && (
                <p className="text-[11px] text-ink-dim">No variables — prompt will run as-is.</p>
              )}

              {/* Model + run */}
              <div>
                <label className="text-[10px] font-semibold text-ink-muted uppercase tracking-wide block mb-1">Model</label>
                <ModelPicker orgId={orgId} value={model} onChange={setModel} className="text-[12px]" />
              </div>

              <button
                onClick={() => runTest.mutate()}
                disabled={runTest.isPending || !content.trim()}
                className="w-full flex items-center justify-center gap-2 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-[12px] font-semibold disabled:opacity-40 transition-colors"
              >
                {runTest.isPending
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Running…</>
                  : <><Play className="w-3.5 h-3.5" />Run test</>
                }
              </button>

              {/* Test output */}
              {testError && (
                <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-2.5 space-y-1">
                  <p className="text-[11px] text-red-400">{testError}</p>
                  {(testError.toLowerCase().includes("api key") || testError.toLowerCase().includes("provider") || testError.toLowerCase().includes("configure")) && (
                    <a href="/settings?tab=providers" className="text-[11px] text-brand-400 hover:underline block">
                      → Go to Settings → AI Providers
                    </a>
                  )}
                </div>
              )}
              {testResult && (
                <div className="rounded-xl bg-dark-raised border border-dark-border overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-1.5 border-b border-dark-border bg-dark-bg">
                    <Zap className="w-3 h-3 text-green-400" />
                    <span className="text-[10px] font-semibold text-ink-muted uppercase tracking-wide">Output</span>
                    <span className="ml-auto text-[10px] text-ink-dim">
                      {testResult.input_tokens}↑ {testResult.output_tokens}↓ · ${testResult.cost_usd.toFixed(4)}
                    </span>
                  </div>
                  <pre className="px-3 py-2.5 text-[11px] text-ink-secondary whitespace-pre-wrap font-mono leading-relaxed max-h-48 overflow-y-auto">
                    {testResult.content}
                  </pre>
                </div>
              )}
            </div>
          </div>

          {/* Version history */}
          <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-dark-border bg-[#111113] shrink-0">
              <History className="w-3.5 h-3.5 text-ink-muted" />
              <span className="text-[12px] font-semibold text-ink-primary">Version history</span>
              <span className="ml-auto text-[10px] text-ink-dim">{versions.length} versions</span>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#0d0d0f]">
              {versions.length === 0 && (
                <p className="text-[11px] text-ink-dim text-center py-4">No versions yet</p>
              )}
              {versions.map(v => (
                <VersionItem
                  key={v.id}
                  v={v}
                  projectId={projectId}
                  isLoaded={loadedVersion === v.version}
                  onLoad={(c) => { setContent(c); setLoadedVersion(v.version); }}
                  onActivated={() => qc.invalidateQueries({ queryKey: ["prompt-active", promptName, projectId] })}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Prompt list ────────────────────────────────────────────────────────────────

function PromptListView({
  projectId,
  prompts,
  isLoading,
  onSelect,
  onNew,
}: {
  projectId: string;
  prompts: PromptVersion[];
  isLoading: boolean;
  onSelect: (name: string) => void;
  onNew: () => void;
}) {
  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-bold text-ink-primary">Prompts</h1>
          <p className="text-[13px] text-ink-muted mt-0.5">
            Version-controlled prompts — fetch the active version at runtime, no redeploys needed.
          </p>
        </div>
        <button
          onClick={onNew}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg text-[13px] font-semibold hover:bg-brand-500 transition-colors"
        >
          <Plus className="w-4 h-4" />New prompt
        </button>
      </div>

      {/* SDK banner */}
      <div className="mb-6 p-4 bg-dark-raised border border-dark-border rounded-xl">
        <p className="text-[10px] font-semibold text-ink-dim uppercase tracking-wide mb-2">Fetch at runtime</p>
        <pre className="text-[11px] font-mono text-ink-secondary whitespace-pre-wrap">{`import dottle
dottle.configure(api_key=os.environ["DOTTLE_API_KEY"])
prompt = dottle.get_prompt("your-prompt-name")   # always returns active version
messages = [{"role": "user", "content": prompt.compile(variable="value")}]`}</pre>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-ink-muted text-sm">
          <Loader2 className="w-4 h-4 animate-spin mr-2" />Loading…
        </div>
      ) : prompts.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-dark-border rounded-2xl">
          <Tag className="w-8 h-8 text-ink-dim mx-auto mb-3" />
          <p className="text-[14px] font-semibold text-ink-secondary">No prompts yet</p>
          <p className="text-[12px] text-ink-muted mt-1 mb-4">
            Create your first prompt to manage it with version control.
          </p>
          <button
            onClick={onNew}
            className="px-4 py-2 bg-brand-600 text-white rounded-lg text-[13px] font-semibold hover:bg-brand-500 transition-colors"
          >
            Create prompt
          </button>
        </div>
      ) : (
        <div className="border border-dark-border rounded-xl overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-dark-border bg-dark-raised/40">
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Name</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Variables</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Version</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Label</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Updated</th>
              </tr>
            </thead>
            <tbody>
              {prompts.map(p => (
                <tr
                  key={p.id}
                  onClick={() => onSelect(p.name)}
                  className="border-b border-dark-border/40 hover:bg-dark-raised/40 cursor-pointer transition-colors group"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-ink-primary font-mono">{p.name}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-ink-dim opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    {p.commit_message && (
                      <p className="text-[11px] text-ink-muted mt-0.5 truncate max-w-xs">{p.commit_message}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {p.variables.length > 0 ? (
                      <div className="flex items-center gap-1 flex-wrap">
                        {p.variables.slice(0, 4).map(v => (
                          <span key={v} className="text-[10px] px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-400 border border-brand-500/20 font-mono">{`{{${v}}}`}</span>
                        ))}
                        {p.variables.length > 4 && (
                          <span className="text-[10px] text-ink-dim">+{p.variables.length - 4}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-400 border border-brand-500/20">v{p.version}</span>
                  </td>
                  <td className="px-4 py-3">
                    {p.label
                      ? <span className="text-[11px] px-1.5 py-0.5 rounded bg-dark-raised border border-dark-border text-ink-muted">{p.label}</span>
                      : <span className="text-ink-muted">—</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-ink-muted text-[12px] whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDistanceToNow(new Date(p.created_at), { addSuffix: true })}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function PromptsPage() {
  const { selectedProject } = useProject();
  const { selectedOrg } = useOrg();
  const [showNew, setShowNew] = useState(false);
  const [selectedName, setSelectedName] = useState<string | null>(null);

  const { data: prompts = [], isLoading } = useQuery({
    queryKey: ["prompts", selectedProject?.id],
    queryFn: () => promptsApi.list(selectedProject!.id),
    enabled: !!selectedProject,
  });

  if (!selectedProject) {
    return <div className="p-8 text-ink-muted text-sm">Select a project first.</div>;
  }

  if (selectedName) {
    return (
      <PromptDetailView
        promptName={selectedName}
        projectId={selectedProject.id}
        orgId={selectedOrg?.id ?? null}
        onBack={() => setSelectedName(null)}
      />
    );
  }

  return (
    <>
      <PromptListView
        projectId={selectedProject.id}
        prompts={prompts}
        isLoading={isLoading}
        onSelect={setSelectedName}
        onNew={() => setShowNew(true)}
      />
      {showNew && (
        <NewPromptModal
          projectId={selectedProject.id}
          onClose={() => setShowNew(false)}
          onCreated={(name) => { setShowNew(false); setSelectedName(name); }}
        />
      )}
    </>
  );
}
