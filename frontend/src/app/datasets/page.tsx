"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { datasetsApi } from "@/lib/api";
import { useProject } from "@/lib/project-context";
import { useOrg } from "@/lib/org-context";
import { DatasetSummary, DatasetDetail, DatasetItem, DatasetRun } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ModelPicker } from "@/components/ui/model-picker";
import {
  Plus, Filter, SlidersHorizontal, Search, Upload, Play,
  ChevronDown, ChevronRight, Hash, Calendar, Tag, Braces, MoreHorizontal,
  CheckCircle2, XCircle, Loader2, FileJson, FileSpreadsheet,
  FlaskConical, Telescope, Trash2, Columns, Check, Eye, EyeOff,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Group, Panel, Separator } from "react-resizable-panels";

// ── Column visibility state ────────────────────────────────────────────────────

const ALL_ITEM_COL_KEYS = ["created", "input", "expected", "tags", "metadata", "origin"] as const;
type ItemColKey = typeof ALL_ITEM_COL_KEYS[number];

const ITEM_COL_LABELS: Record<ItemColKey, string> = {
  created: "Created", input: "Input", expected: "Expected",
  tags: "Tags", metadata: "Metadata", origin: "Origin",
};

// ── Display dropdown ───────────────────────────────────────────────────────────

function DisplayMenu({
  visibleCols,
  onToggle,
  colKeys,
  colLabels,
}: {
  visibleCols: Set<string>;
  onToggle: (key: string) => void;
  colKeys: readonly string[];
  colLabels: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const hidden = colKeys.filter(k => !visibleCols.has(k)).length;

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          "flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-md transition-colors",
          open ? "bg-dark-raised text-ink-primary" : "text-ink-secondary hover:text-ink-primary hover:bg-dark-raised/60"
        )}
      >
        <SlidersHorizontal className="w-3.5 h-3.5" />
        Display
        {hidden > 0 && (
          <span className="text-[10px] bg-brand-500/20 text-brand-400 px-1.5 py-0.5 rounded-full font-medium">{hidden} hidden</span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-64 bg-[#111113] border border-dark-border rounded-xl shadow-2xl overflow-hidden">
          {/* Columns section */}
          <div className="px-3 pt-3 pb-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-2 flex items-center gap-1.5">
              <Columns className="w-3 h-3" />Columns
              {hidden > 0 && <span className="text-ink-dim">{hidden} hidden</span>}
            </p>
            <div className="space-y-0.5">
              {colKeys.map(key => (
                <button
                  key={key}
                  onClick={() => onToggle(key)}
                  className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-dark-raised/80 transition-colors text-left"
                >
                  <span className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0",
                    visibleCols.has(key) ? "bg-brand-500 border-brand-500" : "border-dark-border")}>
                    {visibleCols.has(key) && <Check className="w-3 h-3 text-white" />}
                  </span>
                  <span className={cn("text-[12px]", visibleCols.has(key) ? "text-ink-primary" : "text-ink-muted")}>
                    {colLabels[key]}
                  </span>
                </button>
              ))}
            </div>
          </div>
          {/* Footer actions */}
          <div className="flex items-center gap-1 px-3 py-2 border-t border-dark-border mt-1">
            <button
              onClick={() => colKeys.forEach(k => { if (!visibleCols.has(k)) onToggle(k); })}
              className="flex-1 text-[11px] text-ink-secondary hover:text-ink-primary py-1 rounded-md hover:bg-dark-raised transition-colors"
            >
              Show all
            </button>
            <div className="w-px h-4 bg-dark-border" />
            <button
              onClick={() => colKeys.forEach(k => { if (visibleCols.has(k)) onToggle(k); })}
              className="flex-1 text-[11px] text-ink-secondary hover:text-ink-primary py-1 rounded-md hover:bg-dark-raised transition-colors"
            >
              Hide all
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Filter dropdown ────────────────────────────────────────────────────────────

function FilterMenu({ activeFilters, onClear }: { activeFilters: number; onClear: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          "flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-md transition-colors",
          open || activeFilters > 0 ? "bg-dark-raised text-ink-primary" : "text-ink-secondary hover:text-ink-primary hover:bg-dark-raised/60"
        )}
      >
        <Filter className="w-3.5 h-3.5" />
        Filter
        {activeFilters > 0 && (
          <span className="text-[10px] bg-brand-500/20 text-brand-400 px-1.5 py-0.5 rounded-full font-medium">{activeFilters}</span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-64 bg-[#111113] border border-dark-border rounded-xl shadow-2xl overflow-hidden p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-3">Filter by</p>
          <p className="text-[12px] text-ink-dim text-center py-4">
            No filters yet — filter options coming soon
          </p>
          {activeFilters > 0 && (
            <button onClick={onClear} className="w-full mt-2 py-1.5 text-[12px] text-status-red hover:bg-red-500/5 rounded-lg transition-colors">
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Resizable column table ─────────────────────────────────────────────────────

interface ColDef {
  key: string;
  label: string;
  icon?: React.ReactNode;
  width: number;
  minWidth?: number;
  render: (item: DatasetItem, idx: number) => React.ReactNode;
}

function ResizableTable({
  cols,
  items,
  selectedIds,
  onToggle,
  onToggleAll,
}: {
  cols: ColDef[];
  items: DatasetItem[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
}) {
  const [widths, setWidths] = useState<Record<string, number>>(() =>
    Object.fromEntries(cols.map(c => [c.key, c.width]))
  );
  const dragging = useRef<{ key: string; startX: number; startW: number } | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const { key, startX, startW } = dragging.current;
      const delta = e.clientX - startX;
      const col = cols.find(c => c.key === key);
      const min = col?.minWidth ?? 60;
      setWidths(prev => ({ ...prev, [key]: Math.max(min, startW + delta) }));
    };
    const onUp = () => { dragging.current = null; document.body.style.cursor = ""; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [cols]);

  const allSelected = items.length > 0 && items.every(i => selectedIds.has(i.id));

  return (
    <div className="overflow-auto h-full">
      <table className="border-collapse text-[12px]" style={{ tableLayout: "fixed", minWidth: "100%" }}>
        <colgroup>
          <col style={{ width: 36 }} />
          <col style={{ width: 36 }} />
          {cols.map(c => <col key={c.key} style={{ width: widths[c.key] ?? c.width }} />)}
        </colgroup>
        <thead className="sticky top-0 z-10 bg-[#111113]">
          <tr className="border-b border-dark-border">
            <th className="px-2 py-2.5 text-center w-9">
              <input type="checkbox" checked={allSelected} onChange={onToggleAll}
                className="rounded border-dark-border accent-brand-400 cursor-pointer" />
            </th>
            <th className="px-2 py-2.5 text-center text-ink-muted w-9 font-normal text-[11px]">#</th>
            {cols.map(c => (
              <th key={c.key} className="relative px-3 py-2.5 text-left font-semibold text-ink-secondary group select-none text-[11px]">
                <span className="flex items-center gap-1.5 truncate">
                  {c.icon && <span className="text-ink-muted shrink-0">{c.icon}</span>}
                  {c.label}
                </span>
                <span
                  onMouseDown={e => {
                    e.preventDefault();
                    dragging.current = { key: c.key, startX: e.clientX, startW: widths[c.key] ?? c.width };
                    document.body.style.cursor = "col-resize";
                  }}
                  className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-brand-400/50 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={cols.length + 2} className="py-16 text-center text-ink-muted text-[13px]">
                No items yet — import a CSV/JSON file to get started
              </td>
            </tr>
          ) : (
            items.map((item, idx) => (
              <tr key={item.id}
                className={cn(
                  "border-b border-dark-border/40 hover:bg-dark-raised/30 transition-colors group/row",
                  selectedIds.has(item.id) && "bg-brand-500/5"
                )}
              >
                <td className="px-2 py-2 text-center">
                  <input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => onToggle(item.id)}
                    className="rounded border-dark-border accent-brand-400 cursor-pointer" />
                </td>
                <td className="px-2 py-2 text-center text-ink-muted font-mono text-[11px]">{idx + 1}</td>
                {cols.map(c => (
                  <td key={c.key} className="px-3 py-2 truncate max-w-0">
                    {c.render(item, idx)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── New dataset modal (Braintrust-style) ───────────────────────────────────────

function NewDatasetModal({ projectId, datasetCount, onClose, onCreated }: {
  projectId: string;
  datasetCount: number;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(`Dataset ${datasetCount + 1}`);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<{ imported: number; failed: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const create = useMutation({
    mutationFn: async () => {
      const ds = await datasetsApi.create({ project_id: projectId, name: name.trim() || `Dataset ${datasetCount + 1}` });
      if (file) {
        const r = await datasetsApi.importItems(ds.id, file);
        setResult({ imported: r.imported, failed: r.failed });
      }
      return ds;
    },
    onSuccess: (ds) => {
      qc.invalidateQueries({ queryKey: ["datasets", projectId] });
      onCreated(ds.id);
    },
  });

  const handleFile = useCallback((f: File) => {
    if (!f.name.toLowerCase().match(/\.(csv|json)$/)) { alert("Please select a .csv or .json file."); return; }
    setFile(f);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-6">
      <div className="w-full max-w-2xl bg-[#111113] border border-dark-border rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-dark-border shrink-0">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-1">Dataset name</p>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && create.mutate()}
              placeholder="Untitled dataset"
              className="w-full bg-transparent text-[22px] font-bold text-ink-primary placeholder-ink-muted outline-none"
            />
          </div>
          <button onClick={onClose} className="text-ink-dim hover:text-ink-muted text-xl p-1 shrink-0">✕</button>
        </div>

        {/* Format hints */}
        <div className="px-6 pt-4 shrink-0">
          <p className="text-[11px] text-ink-muted mb-3">Import a CSV or JSON file — or create an empty dataset and add rows manually.</p>
          <div className="grid grid-cols-2 gap-2.5 text-[11px]">
            <div className="rounded-xl border border-dark-border bg-dark-bg px-3 py-2.5">
              <div className="flex items-center gap-1.5 mb-1.5"><FileSpreadsheet className="w-3.5 h-3.5 text-green-400" /><span className="font-semibold text-ink-primary">CSV format</span></div>
              <code className="text-ink-muted block leading-relaxed">input,expected_output<br />"Hello","Hi there"</code>
            </div>
            <div className="rounded-xl border border-dark-border bg-dark-bg px-3 py-2.5">
              <div className="flex items-center gap-1.5 mb-1.5"><FileJson className="w-3.5 h-3.5 text-yellow-400" /><span className="font-semibold text-ink-primary">JSON format</span></div>
              <code className="text-ink-muted block leading-relaxed">{`[{"input":"Hi",`}<br />{`"expected_output":"Hello"}]`}</code>
            </div>
          </div>
        </div>

        {/* Drop zone */}
        <div className="px-6 py-4 flex-1 overflow-hidden">
          <div
            onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed cursor-pointer transition-all",
              "min-h-[200px] px-6",
              dragOver ? "border-brand-500 bg-brand-600/5" : file ? "border-brand-500/40 bg-brand-600/3" : "border-dark-border hover:border-dark-border/80 hover:bg-dark-raised/20"
            )}
          >
            <input ref={inputRef} type="file" accept=".csv,.json" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            {file ? (
              <>
                <div className="w-12 h-12 rounded-2xl bg-brand-500/15 border border-brand-500/30 flex items-center justify-center">
                  {file.name.endsWith(".csv") ? <FileSpreadsheet className="w-6 h-6 text-green-400" /> : <FileJson className="w-6 h-6 text-yellow-400" />}
                </div>
                <div className="text-center">
                  <p className="text-[15px] font-semibold text-ink-primary">{file.name}</p>
                  <p className="text-[12px] text-ink-muted mt-0.5">{(file.size / 1024).toFixed(1)} KB · ready to import</p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); setFile(null); }}
                  className="text-[11px] text-ink-muted hover:text-status-red transition-colors mt-1"
                >
                  Remove file
                </button>
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-2xl bg-dark-raised border border-dark-border flex items-center justify-center">
                  <Upload className="w-6 h-6 text-ink-muted" />
                </div>
                <div className="text-center">
                  <p className="text-[15px] font-semibold text-ink-primary">Drag and drop CSV or JSON file here</p>
                  <p className="text-[12px] text-ink-muted mt-1">or <span className="text-brand-400">click to browse</span></p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-dark-border shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-[13px] text-ink-muted hover:text-ink-secondary transition-colors">
            Cancel
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => create.mutate()}
              disabled={create.isPending || !!file}
              className="px-4 py-2 text-[13px] text-ink-secondary border border-dark-border rounded-lg hover:bg-dark-raised disabled:opacity-30 transition-colors"
            >
              Create empty
            </button>
            <button
              onClick={() => create.mutate()}
              disabled={!name.trim() || create.isPending || (!file && false)}
              className="flex items-center gap-2 px-5 py-2 bg-brand-500 text-white rounded-lg text-[13px] font-semibold hover:bg-brand-400 disabled:opacity-40 transition-colors"
            >
              {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : file ? <Upload className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {create.isPending ? "Creating…" : file ? "Create & import" : "Create dataset"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Import modal ───────────────────────────────────────────────────────────────

function ImportModal({ datasetId, onClose }: { datasetId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<{ imported: number; failed: number; errors: string[] } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const importMut = useMutation({
    mutationFn: (f: File) => datasetsApi.importItems(datasetId, f),
    onSuccess: (data) => { setResult(data); qc.invalidateQueries({ queryKey: ["dataset", datasetId] }); },
  });
  const handleFile = useCallback((f: File) => {
    if (!f.name.toLowerCase().match(/\.(csv|json)$/)) { alert("Please select a .csv or .json file."); return; }
    setFile(f); setResult(null);
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-[#111113] border border-dark-border rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-border">
          <h2 className="text-[15px] font-semibold text-ink-primary">Import items</h2>
          <button onClick={onClose} className="text-ink-dim hover:text-ink-muted text-lg leading-none">✕</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-[11px]">
            <div className="rounded-xl border border-dark-border bg-dark-bg px-3 py-2.5">
              <div className="flex items-center gap-1.5 mb-1"><FileSpreadsheet className="w-3.5 h-3.5 text-green-400" /><span className="font-semibold text-ink-primary">CSV</span></div>
              <code className="text-ink-muted block">input,expected_output<br />"Hello","Hi there"</code>
            </div>
            <div className="rounded-xl border border-dark-border bg-dark-bg px-3 py-2.5">
              <div className="flex items-center gap-1.5 mb-1"><FileJson className="w-3.5 h-3.5 text-yellow-400" /><span className="font-semibold text-ink-primary">JSON</span></div>
              <code className="text-ink-muted block">{`[{"input":"Hi","expected_output":"Hello"}]`}</code>
            </div>
          </div>
          <div onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onClick={() => inputRef.current?.click()}
            className={cn("flex flex-col items-center justify-center gap-2 py-8 rounded-xl border-2 border-dashed cursor-pointer transition-colors",
              dragging ? "border-brand-500 bg-brand-600/5" : "border-dark-border hover:border-dark-border/80")}>
            <input ref={inputRef} type="file" accept=".csv,.json" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            {file
              ? <span className="text-[13px] font-semibold text-ink-primary">{file.name} <span className="text-ink-muted font-normal">({(file.size / 1024).toFixed(1)} KB)</span></span>
              : <><Upload className="w-6 h-6 text-ink-muted" /><p className="text-[13px] text-ink-secondary">Drop or <span className="text-brand-400">click to browse</span></p><p className="text-[11px] text-ink-muted">.csv or .json</p></>}
          </div>
          {result && (
            <div className={cn("rounded-xl px-4 py-3 text-[12px]", result.failed === 0 ? "bg-green-500/10 border border-green-500/20" : "bg-yellow-500/10 border border-yellow-500/20")}>
              <p className="font-semibold text-ink-primary">{result.imported} item{result.imported !== 1 ? "s" : ""} imported{result.failed > 0 && `, ${result.failed} failed`}</p>
              {result.errors.map((e, i) => <p key={i} className="text-ink-muted mt-0.5">{e}</p>)}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-dark-border">
          <button onClick={onClose} className="px-4 py-2 text-[13px] text-ink-muted">{result ? "Close" : "Cancel"}</button>
          {!result && <button onClick={() => { if (file) importMut.mutate(file); }} disabled={!file || importMut.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded-lg text-[13px] font-semibold disabled:opacity-40 transition-colors">
            <Upload className="w-4 h-4" />{importMut.isPending ? "Importing…" : "Import"}
          </button>}
        </div>
      </div>
    </div>
  );
}

// ── Run eval modal ─────────────────────────────────────────────────────────────

function RunModal({ datasetId, orgId, onClose }: { datasetId: string; orgId: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(`Run ${new Date().toLocaleDateString()}`);
  const [model, setModel] = useState("claude-haiku-4-5-20251001");
  const [criteria, setCriteria] = useState("");
  const run = useMutation({
    mutationFn: () => datasetsApi.createRun(datasetId, { name, model, eval_criteria: criteria || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["dataset", datasetId] }); onClose(); },
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-[#111113] border border-dark-border rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-border">
          <h2 className="text-[15px] font-semibold text-ink-primary">Run evaluation</h2>
          <button onClick={onClose} className="text-ink-dim hover:text-ink-muted text-lg leading-none">✕</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide block mb-1.5">Run name</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-[13px] text-ink-primary focus:outline-none focus:ring-1 focus:ring-brand-400" />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide block mb-1.5">Judge model</label>
            <ModelPicker orgId={orgId} value={model} onChange={setModel} />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide block mb-1.5">Eval criteria (optional)</label>
            <textarea value={criteria} onChange={e => setCriteria(e.target.value)} rows={3}
              placeholder="Leave blank to use default quality/accuracy criteria"
              className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-[12px] text-ink-secondary placeholder-ink-dim resize-none focus:outline-none focus:ring-1 focus:ring-brand-400" />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-dark-border">
          <button onClick={onClose} className="px-4 py-2 text-[13px] text-ink-muted">Cancel</button>
          <button onClick={() => run.mutate()} disabled={!name.trim() || run.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded-lg text-[13px] font-semibold disabled:opacity-40 transition-colors">
            <Play className="w-4 h-4" />{run.isPending ? "Queuing…" : "Run"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Right panel ────────────────────────────────────────────────────────────────

function RightPanel({ data, onRunEval }: {
  data: DatasetDetail;
  orgId: string | null;
  onRunEval: () => void;
  onImport: () => void;
}) {
  const [tab, setTab] = useState<"details" | "runs">("details");

  return (
    <div className="h-full flex flex-col bg-[#111113] border-l border-dark-border overflow-hidden">
      {/* Tabs */}
      <div className="flex items-center border-b border-dark-border shrink-0 px-3 pt-1">
        {(["details", "runs"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("px-3 py-2.5 text-[12px] font-medium capitalize transition-colors border-b-2 -mb-px",
              tab === t ? "border-brand-400 text-ink-primary" : "border-transparent text-ink-muted hover:text-ink-secondary")}>
            {t} {t === "runs" && `(${data.runs.length})`}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === "details" ? (
          <div className="p-4 space-y-5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-1.5">Description</p>
              <textarea rows={3} defaultValue={data.description ?? ""}
                placeholder="Enter dataset description"
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-[12px] text-ink-primary placeholder-ink-muted resize-none focus:outline-none focus:ring-1 focus:ring-brand-400" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-2">Stats</p>
              <div className="flex gap-2">
                <div className="flex-1 bg-dark-raised rounded-xl px-3 py-2.5 min-w-0">
                  <p className="text-[22px] font-bold text-ink-primary leading-none">{data.items.length}</p>
                  <p className="text-[10px] text-ink-muted mt-1">examples</p>
                </div>
                <div className="flex-1 bg-dark-raised rounded-xl px-3 py-2.5 min-w-0">
                  <p className="text-[22px] font-bold text-ink-primary leading-none">{data.runs.length}</p>
                  <p className="text-[10px] text-ink-muted mt-1">eval runs</p>
                </div>
              </div>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-1.5">Recently used in</p>
              {data.runs.length === 0
                ? <p className="text-[11px] text-ink-muted">—</p>
                : data.runs.slice(0, 3).map(r => (
                  <div key={r.id} className="flex items-center gap-2 py-1.5">
                    <FlaskConical className="w-3 h-3 text-ink-muted shrink-0" />
                    <span className="text-[11px] text-ink-primary truncate">{r.name}</span>
                    <span className="text-[10px] text-ink-muted ml-auto shrink-0">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</span>
                  </div>
                ))
              }
            </div>
          </div>
        ) : (
          <div className="p-3 space-y-2">
            {data.runs.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-[12px] text-ink-muted">No runs yet</p>
                <button onClick={onRunEval} className="mt-3 flex items-center gap-1.5 mx-auto px-3 py-1.5 bg-brand-500 text-white rounded-lg text-[12px] font-medium hover:bg-brand-400 transition-colors">
                  <Play className="w-3.5 h-3.5" />Run eval
                </button>
              </div>
            ) : data.runs.map(r => (
              <div key={r.id} className="p-3 rounded-xl bg-dark-raised/50 border border-dark-border">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[12px] font-semibold text-ink-primary flex-1 truncate">{r.name}</span>
                  {r.status === "running" && <Loader2 className="w-3 h-3 text-brand-400 animate-spin shrink-0" />}
                  {r.status === "completed" && <CheckCircle2 className="w-3 h-3 text-green-400 shrink-0" />}
                  {r.status === "failed" && <XCircle className="w-3 h-3 text-red-400 shrink-0" />}
                  {r.avg_score != null && (
                    <span className={cn("text-[11px] font-bold shrink-0",
                      r.avg_score >= 0.7 ? "text-green-400" : r.avg_score >= 0.4 ? "text-yellow-400" : "text-red-400")}>
                      {(r.avg_score * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-ink-muted">
                  <span>{r.model || "default"}</span>
                  <span>·</span>
                  <span>{r.results.filter((x: { status: string }) => x.status === "completed").length}/{r.results.length} scored</span>
                  <span>·</span>
                  <span>{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer action */}
      <div className="shrink-0 border-t border-dark-border p-3">
        <button onClick={onRunEval}
          className="w-full flex items-center justify-center gap-2 py-2 bg-brand-500 hover:bg-brand-400 text-white rounded-lg text-[12px] font-semibold transition-colors">
          <Play className="w-3.5 h-3.5" />Run evaluation
        </button>
      </div>
    </div>
  );
}

// ── "Evaluate in" dropdown ─────────────────────────────────────────────────────

function EvaluateInMenu({ datasetId }: { datasetId: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-500 hover:bg-brand-400 text-white rounded-lg text-[12px] font-semibold transition-colors">
        <Telescope className="w-3.5 h-3.5" />
        Evaluate in
        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-44 bg-[#111113] border border-dark-border rounded-xl shadow-xl overflow-hidden">
          <a href={`/playground?dataset_id=${datasetId}`}
            className="flex items-center gap-2.5 px-3 py-2.5 text-[12px] text-ink-secondary hover:bg-dark-raised hover:text-ink-primary transition-colors">
            <FlaskConical className="w-3.5 h-3.5 text-brand-400" />Playground
          </a>
          <div className="flex items-center gap-2.5 px-3 py-2.5 text-[12px] text-ink-muted cursor-not-allowed opacity-50">
            <Telescope className="w-3.5 h-3.5" />Experiments <span className="ml-auto text-[9px] bg-dark-raised px-1.5 py-0.5 rounded font-medium">soon</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Dataset detail ─────────────────────────────────────────────────────────────

function makeItemCols(visibleCols: Set<ItemColKey>): ColDef[] {
  const allCols: ColDef[] = [
    {
      key: "created", label: "Created", width: 130,
      icon: <Calendar className="w-3 h-3" />,
      render: (item) => <span className="text-ink-muted text-[11px]">{formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}</span>,
    },
    {
      key: "input", label: "Input", width: 240, minWidth: 100,
      icon: <Hash className="w-3 h-3" />,
      render: (item) => {
        const val = item.input && Object.keys(item.input).length > 0
          ? JSON.stringify(item.input).slice(0, 100)
          : null;
        return val
          ? <span className="font-mono text-ink-primary text-[11px]">{val}</span>
          : <span className="text-ink-muted">—</span>;
      },
    },
    {
      key: "expected", label: "Expected", width: 240, minWidth: 100,
      render: (item) => item.expected_output
        ? <span className="text-ink-primary text-[11px]">{item.expected_output.slice(0, 100)}</span>
        : <span className="text-ink-muted">—</span>,
    },
    {
      key: "tags", label: "Tags", width: 100,
      icon: <Tag className="w-3 h-3" />,
      render: () => <span className="text-ink-muted">—</span>,
    },
    {
      key: "metadata", label: "Metadata", width: 110,
      icon: <Braces className="w-3 h-3" />,
      render: (item) => item.metadata && Object.keys(item.metadata).length > 0
        ? <span className="font-mono text-ink-muted text-[10px]">{JSON.stringify(item.metadata).slice(0, 30)}</span>
        : <span className="text-ink-muted">—</span>,
    },
    {
      key: "origin", label: "Origin", width: 120,
      render: (item) => item.session_id
        ? <span className="text-[10px] font-mono text-ink-muted">session:{item.session_id.slice(0, 8)}</span>
        : <span className="text-ink-muted">—</span>,
    },
  ];
  return allCols.filter(c => visibleCols.has(c.key as ItemColKey));
}

function DatasetDetailView({ datasetId, orgId, onBack }: {
  datasetId: string; projectId: string; orgId: string | null; onBack: () => void;
}) {
  const qc = useQueryClient();
  const [showRun, setShowRun] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [visibleCols, setVisibleCols] = useState<Set<ItemColKey>>(
    new Set(ALL_ITEM_COL_KEYS as unknown as ItemColKey[])
  );

  const { data, isLoading } = useQuery({
    queryKey: ["dataset", datasetId],
    queryFn: () => datasetsApi.get(datasetId),
    refetchInterval: (d) => (d.state.data?.runs.some((r: DatasetRun) => r.status === "running") ? 3000 : false),
  });

  const removeItem = useMutation({
    mutationFn: (itemId: string) => datasetsApi.deleteItem(datasetId, itemId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dataset", datasetId] }),
  });

  const toggleCol = useCallback((key: string) => {
    setVisibleCols(prev => {
      const n = new Set(prev);
      if (n.has(key as ItemColKey)) n.delete(key as ItemColKey);
      else n.add(key as ItemColKey);
      return n;
    });
  }, []);

  if (isLoading) return <div className="flex items-center justify-center h-full text-ink-muted text-sm">Loading…</div>;
  if (!data) return null;

  const filtered = data.items.filter((item: DatasetItem) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (item.expected_output?.toLowerCase().includes(s)) ||
      JSON.stringify(item.input).toLowerCase().includes(s)
    );
  });

  const toggleAll = () => {
    if (filtered.every((i: DatasetItem) => selectedIds.has(i.id))) {
      setSelectedIds(prev => { const n = new Set(prev); filtered.forEach((i: DatasetItem) => n.delete(i.id)); return n; });
    } else {
      setSelectedIds(prev => { const n = new Set(prev); filtered.forEach((i: DatasetItem) => n.add(i.id)); return n; });
    }
  };

  const activeCols = makeItemCols(visibleCols);

  const colsWithDelete: ColDef[] = [
    ...activeCols,
    {
      key: "_del", label: "", width: 40, minWidth: 40,
      render: (item) => (
        <button onClick={e => { e.stopPropagation(); removeItem.mutate(item.id); }}
          className="opacity-0 group-hover/row:opacity-100 p-1 rounded hover:bg-dark-raised text-ink-muted hover:text-red-400 transition-all">
          <Trash2 className="w-3 h-3" />
        </button>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-4 h-11 border-b border-dark-border bg-[#111113] shrink-0">
        <button onClick={onBack}
          className="flex items-center gap-1 text-[12px] text-ink-muted hover:text-ink-secondary transition-colors shrink-0">
          <ChevronRight className="w-3.5 h-3.5 rotate-180" />
          Datasets
        </button>
        <span className="text-ink-muted">/</span>
        <span className="text-[13px] font-semibold text-ink-primary truncate flex-1">{data.name}</span>

        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 border border-dark-border rounded-lg text-[12px] text-ink-secondary hover:bg-dark-raised transition-colors">
            <Upload className="w-3.5 h-3.5" />Import
          </button>
          <button
            className="flex items-center gap-1.5 px-2.5 py-1.5 border border-dark-border rounded-lg text-[12px] text-ink-secondary hover:bg-dark-raised transition-colors">
            <Plus className="w-3.5 h-3.5" />Row
          </button>
          <EvaluateInMenu datasetId={datasetId} />
          <button className="p-1.5 rounded-lg text-ink-muted hover:bg-dark-raised hover:text-ink-secondary transition-colors">
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-1 px-4 h-9 border-b border-dark-border bg-[#111113] shrink-0">
        <button className="flex items-center gap-1.5 text-[12px] text-ink-secondary hover:text-ink-primary transition-colors px-2 py-1 rounded-md hover:bg-dark-raised/60">
          All dataset rows view <ChevronDown className="w-3 h-3" />
        </button>
        <div className="w-px h-4 bg-dark-border mx-1" />
        <FilterMenu activeFilters={0} onClear={() => {}} />
        <DisplayMenu
          visibleCols={visibleCols}
          onToggle={toggleCol}
          colKeys={ALL_ITEM_COL_KEYS}
          colLabels={ITEM_COL_LABELS}
        />
        <div className="w-px h-4 bg-dark-border mx-1" />
        <div className="flex items-center gap-1.5 flex-1 max-w-56 bg-dark-raised/50 border border-dark-border/60 rounded-lg px-2.5 py-1">
          <Search className="w-3 h-3 text-ink-muted shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search items…"
            className="flex-1 bg-transparent text-[11px] text-ink-primary placeholder-ink-muted outline-none" />
        </div>
        <span className="ml-auto text-[11px] text-ink-muted pl-2">{filtered.length} rows</span>
      </div>

      {/* Main content — takes remaining height as direct flex child */}
      {data.items.length === 0 ? (
        /* Empty state */
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8" style={{ minHeight: 0 }}>
          <div className="text-center mb-2">
            <p className="text-[18px] font-semibold text-ink-primary">This dataset is empty</p>
            <p className="text-[13px] text-ink-muted mt-1.5">
              Manually{" "}
              <button className="text-brand-400 hover:underline">create a row</button>,{" "}
              <button onClick={() => setShowImport(true)} className="text-brand-400 hover:underline">upload a CSV/JSON file</button>,{" "}
              or{" "}
              <button className="text-brand-400 hover:underline">insert data programmatically</button>
            </p>
          </div>
          <div
            onClick={() => setShowImport(true)}
            className="w-full max-w-xl rounded-2xl border-2 border-dashed border-dark-border hover:border-dark-border/80 hover:bg-dark-raised/10 cursor-pointer transition-all flex flex-col items-center justify-center gap-3 py-14 px-8"
          >
            <Upload className="w-8 h-8 text-ink-muted" />
            <p className="text-[14px] text-ink-muted text-center">Drag and drop CSV or JSON file here,<br />or click to select</p>
          </div>
        </div>
      ) : (
        /* Wrapper: flex-1 + min-h-0 lets Group resolve height: 100% correctly */
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex" }}>
          <Group
            orientation="horizontal"
            style={{ width: "100%", height: "100%" }}
          >
            {/* Table panel */}
            <Panel defaultSize={62} minSize={30}>
              <div style={{ height: "100%", overflow: "hidden" }}>
                <ResizableTable
                  cols={colsWithDelete}
                  items={filtered}
                  selectedIds={selectedIds}
                  onToggle={id => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; })}
                  onToggleAll={toggleAll}
                />
              </div>
            </Panel>

            {/* Drag handle */}
            <Separator
              style={{ width: "5px", cursor: "col-resize", background: "var(--c-border)", flexShrink: 0, transition: "background 0.15s" }}
            />

            {/* Right details panel */}
            <Panel defaultSize={38} minSize={26} maxSize={60}>
              <div style={{ height: "100%", overflow: "hidden" }}>
                <RightPanel data={data} orgId={orgId} onRunEval={() => setShowRun(true)} onImport={() => setShowImport(true)} />
              </div>
            </Panel>
          </Group>
        </div>
      )}

      {showRun && <RunModal datasetId={datasetId} orgId={orgId} onClose={() => setShowRun(false)} />}
      {showImport && <ImportModal datasetId={datasetId} onClose={() => setShowImport(false)} />}
    </div>
  );
}

// ── Dataset list ───────────────────────────────────────────────────────────────

const LIST_COLS = [
  { key: "name",        label: "Name",        width: 260 },
  { key: "description", label: "Description", width: 220 },
  { key: "updated_at",  label: "Updated",     width: 160, icon: <Calendar className="w-3 h-3" /> },
  { key: "item_count",  label: "Examples",    width: 110, icon: <Hash className="w-3 h-3" /> },
  { key: "_meta",       label: "Metadata",    width: 110, icon: <Braces className="w-3 h-3" /> },
  { key: "run_count",   label: "Runs",        width: 80,  icon: <Play className="w-3 h-3" /> },
] as const;

function DatasetListTable({ datasets, onSelect }: { datasets: DatasetSummary[]; onSelect: (id: string) => void }) {
  const [widths, setWidths] = useState<Record<string, number>>(() =>
    Object.fromEntries(LIST_COLS.map(c => [c.key, c.width]))
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const dragging = useRef<{ key: string; startX: number; startW: number } | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const { key, startX, startW } = dragging.current;
      setWidths(prev => ({ ...prev, [key]: Math.max(80, startW + (e.clientX - startX)) }));
    };
    const onUp = () => { dragging.current = null; document.body.style.cursor = ""; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  return (
    <div className="overflow-auto">
      <table className="w-full border-collapse text-[13px]" style={{ tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: 40 }} />
          {LIST_COLS.map(c => <col key={c.key} style={{ width: widths[c.key] }} />)}
        </colgroup>
        <thead>
          <tr className="border-b border-dark-border">
            <th className="px-3 py-3 w-10">
              <input type="checkbox"
                checked={datasets.length > 0 && datasets.every(d => selected.has(d.id))}
                onChange={() => {
                  if (datasets.every(d => selected.has(d.id))) setSelected(new Set());
                  else setSelected(new Set(datasets.map(d => d.id)));
                }}
                className="rounded border-dark-border accent-brand-400 cursor-pointer" />
            </th>
            {LIST_COLS.map(c => (
              <th key={c.key} className="relative px-3 py-3 text-left font-semibold text-ink-secondary group select-none text-[11px] uppercase tracking-wide">
                <span className="flex items-center gap-1.5">
                  {"icon" in c && c.icon && <span className="text-ink-muted">{c.icon}</span>}
                  {c.label}
                </span>
                <span onMouseDown={e => { e.preventDefault(); dragging.current = { key: c.key as string, startX: e.clientX, startW: widths[c.key] }; document.body.style.cursor = "col-resize"; }}
                  className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-brand-400/50 opacity-0 group-hover:opacity-100 transition-opacity" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {datasets.map(d => (
            <tr key={d.id} onClick={() => onSelect(d.id)}
              className={cn("border-b border-dark-border/40 hover:bg-dark-raised/40 cursor-pointer transition-colors group",
                selected.has(d.id) && "bg-brand-500/5")}>
              <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                <input type="checkbox" checked={selected.has(d.id)}
                  onChange={() => setSelected(prev => { const n = new Set(prev); n.has(d.id) ? n.delete(d.id) : n.add(d.id); return n; })}
                  className="rounded border-dark-border accent-brand-400 cursor-pointer" />
              </td>
              <td className="px-3 py-3">
                <span className="font-semibold text-ink-primary">{d.name}</span>
              </td>
              <td className="px-3 py-3 text-ink-secondary truncate max-w-0">
                {d.description || <span className="text-ink-muted">—</span>}
              </td>
              <td className="px-3 py-3 text-ink-secondary">
                {formatDistanceToNow(new Date(d.updated_at), { addSuffix: true })}
              </td>
              <td className="px-3 py-3 text-ink-primary font-medium">{d.item_count}</td>
              <td className="px-3 py-3 text-ink-muted">—</td>
              <td className="px-3 py-3 text-ink-primary font-medium">{d.run_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function DatasetsPage() {
  const { selectedProject } = useProject();
  const { selectedOrg } = useOrg();
  const [showNew, setShowNew] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const { data: datasets = [], isLoading } = useQuery({
    queryKey: ["datasets", selectedProject?.id],
    queryFn: () => datasetsApi.list(selectedProject!.id),
    enabled: !!selectedProject,
  });

  if (!selectedProject) return <div className="p-8 text-ink-muted text-sm">Select a project first.</div>;

  if (selectedId) {
    return (
      <div className="h-full overflow-hidden -m-6">
        <DatasetDetailView
          datasetId={selectedId}
          projectId={selectedProject.id}
          orgId={selectedOrg?.id ?? null}
          onBack={() => setSelectedId(null)}
        />
      </div>
    );
  }

  const filtered = (datasets as DatasetSummary[]).filter(d =>
    !search || d.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col -m-6 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 h-11 border-b border-dark-border bg-dark-surface shrink-0">
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-500 hover:bg-brand-400 text-white rounded-lg text-[12px] font-semibold transition-colors shrink-0">
          <Plus className="w-3.5 h-3.5" />New dataset
        </button>
        <div className="w-px h-5 bg-dark-border mx-2" />
        <button className="flex items-center gap-1.5 text-[12px] text-ink-secondary hover:text-ink-primary transition-colors px-2 py-1 rounded-md hover:bg-dark-raised/60">
          All datasets <ChevronDown className="w-3 h-3" />
        </button>
        <div className="w-px h-4 bg-dark-border mx-1" />
        <FilterMenu activeFilters={0} onClear={() => {}} />
        <div className="flex items-center gap-1.5 ml-1 bg-dark-raised/50 border border-dark-border/60 rounded-lg px-2.5 py-1">
          <Search className="w-3 h-3 text-ink-muted shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search datasets"
            className="bg-transparent text-[12px] text-ink-primary placeholder-ink-muted outline-none w-40" />
        </div>
        <span className="ml-auto text-[11px] text-ink-muted">{filtered.length} dataset{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-ink-muted text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <p className="text-[15px] font-semibold text-ink-primary">No datasets yet</p>
            <p className="text-[13px] text-ink-muted">Create a dataset, add sessions as test cases, then run evaluations.</p>
            <button onClick={() => setShowNew(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-brand-500 text-white rounded-lg text-[13px] font-semibold mt-1 hover:bg-brand-400 transition-colors">
              <Plus className="w-3.5 h-3.5" />New dataset
            </button>
          </div>
        ) : (
          <DatasetListTable datasets={filtered} onSelect={setSelectedId} />
        )}
      </div>

      {showNew && (
        <NewDatasetModal
          projectId={selectedProject.id}
          datasetCount={(datasets as DatasetSummary[]).length}
          onClose={() => setShowNew(false)}
          onCreated={(id) => { setShowNew(false); setSelectedId(id); }}
        />
      )}
    </div>
  );
}
