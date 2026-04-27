"use client";
import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { metricsApi } from "@/lib/api";
import { useProject } from "@/lib/project-context";
import ReactECharts from "echarts-for-react";
import Link from "next/link";
import { clsx } from "clsx";
import {
  Plus, Search, Bell, ChevronDown, X, LayoutGrid,
  SlidersHorizontal, BarChart2, Activity, Hash,
  Wrench, AlertTriangle, Timer, TrendingUp,
  GripVertical, Maximize2, Pencil, MoreVertical,
  Download, Copy, Trash2,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type DatePreset = "1h" | "6h" | "24h" | "7d" | "30d";
type ChartType = "line" | "bar" | "area";
type MetricKey = "sessions" | "cost" | "tokens" | "latency" | "tool_calls" | "error_rate" | "tool_duration";

interface CustomChart {
  id: string;
  name: string;
  metric: MetricKey;
  chartType: ChartType;
  isBuiltIn?: boolean;
}

// ── Date helpers ───────────────────────────────────────────────────────────────

function presetToRange(preset: DatePreset): { from: string; to: string; label: string } {
  const now = new Date();
  const to = now.toISOString();
  const ms: Record<DatePreset, number> = {
    "1h":  1 * 60 * 60 * 1000,
    "6h":  6 * 60 * 60 * 1000,
    "24h": 24 * 60 * 60 * 1000,
    "7d":  7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
  };
  const labels: Record<DatePreset, string> = {
    "1h": "Last 1 hour", "6h": "Last 6 hours", "24h": "Last 24 hours",
    "7d": "Last 7 days", "30d": "Last 30 days",
  };
  const from = new Date(now.getTime() - ms[preset]).toISOString();
  return { from, to, label: labels[preset] };
}

// ── Chart theme ────────────────────────────────────────────────────────────────

function miniLineOption(
  xData: string[],
  yData: number[],
  color: string,
  formatter?: (v: number) => string,
  type: ChartType = "line",
  tall = false,
) {
  const seriesType = type === "bar" ? "bar" : "line";
  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      backgroundColor: "#18181b",
      borderColor: "#27272a",
      textStyle: { color: "#fafafa", fontSize: 11 },
      formatter: (params: { name: string; value: number }[]) =>
        `${params[0].name}<br/><b>${formatter ? formatter(params[0].value) : params[0].value}</b>`,
    },
    xAxis: {
      type: "category",
      data: xData,
      axisLine: { lineStyle: { color: "#27272a" } },
      axisTick: { show: false },
      axisLabel: { color: "#52525b", fontSize: 10, showMaxLabel: true, showMinLabel: true },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: "#52525b", fontSize: 10, formatter: formatter ?? ((v: number) => String(v)) },
      splitLine: { lineStyle: { color: "#1f1f23" } },
      min: 0,
    },
    series: [
      {
        type: seriesType,
        data: yData,
        smooth: true,
        lineStyle: { color, width: 1.5 },
        itemStyle: { color },
        areaStyle: type !== "bar" ? { color: `${color}22` } : undefined,
        barMaxWidth: 16,
        symbol: "none",
      },
    ],
    grid: { left: 42, right: 8, top: tall ? 20 : 12, bottom: tall ? 32 : 24 },
  };
}

// ── No data state ──────────────────────────────────────────────────────────────

function NoData() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[110px] gap-1.5">
      <BarChart2 className="w-5 h-5 text-ink-dim opacity-30" />
      <span className="text-[11px] text-ink-dim">No data</span>
    </div>
  );
}

// ── Chart actions menu ─────────────────────────────────────────────────────────

function ChartMenu({
  onExportChart,
  onExportData,
  onDuplicate,
  onDelete,
  canDelete,
}: {
  onExportChart: () => void;
  onExportData: () => void;
  onDuplicate: () => void;
  onDelete?: () => void;
  canDelete: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="p-1.5 rounded-lg text-ink-dim hover:text-ink-muted hover:bg-dark-raised transition-colors"
        title="More options"
      >
        <MoreVertical className="w-3.5 h-3.5" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-40 w-48 bg-dark-bg border border-dark-border rounded-xl shadow-2xl overflow-hidden py-1">
            <button
              onClick={() => { onExportChart(); setOpen(false); }}
              className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-ink-secondary hover:bg-dark-raised transition-colors"
            >
              <span className="flex items-center gap-2.5">
                <Download className="w-3.5 h-3.5 text-ink-dim" />
                Export chart
              </span>
              <ChevronDown className="w-3 h-3 -rotate-90 text-ink-dim" />
            </button>
            <button
              onClick={() => { onExportData(); setOpen(false); }}
              className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-ink-secondary hover:bg-dark-raised transition-colors"
            >
              <span className="flex items-center gap-2.5">
                <Download className="w-3.5 h-3.5 text-ink-dim" />
                Export data
              </span>
              <ChevronDown className="w-3 h-3 -rotate-90 text-ink-dim" />
            </button>
            <div className="h-px bg-dark-divider my-1" />
            <button
              onClick={() => { onDuplicate(); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-ink-secondary hover:bg-dark-raised transition-colors"
            >
              <Copy className="w-3.5 h-3.5 text-ink-dim" />
              Duplicate
            </button>
            {canDelete && (
              <button
                onClick={() => { onDelete?.(); setOpen(false); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Expand modal ───────────────────────────────────────────────────────────────

function ExpandModal({
  title,
  icon: Icon,
  iconColor,
  value,
  subtitle,
  hasData,
  chartOption,
  onClose,
}: {
  title: string;
  icon: React.ElementType;
  iconColor: string;
  value?: string;
  subtitle?: string;
  hasData: boolean;
  chartOption?: object;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6">
      <div className="bg-dark-surface border border-dark-border rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-4 border-b border-dark-divider">
          <GripVertical className="w-4 h-4 text-ink-dim opacity-50 cursor-grab" />
          <Icon className={clsx("w-4 h-4 shrink-0", iconColor)} />
          <h2 className="text-sm font-semibold text-ink-primary flex-1">{title}</h2>
          {value && (
            <span className="text-xl font-bold font-mono text-ink-primary mr-2">{value}
              {subtitle && <span className="text-xs font-normal text-ink-dim ml-1.5">{subtitle}</span>}
            </span>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-ink-dim hover:text-ink-muted hover:bg-dark-raised transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Chart */}
        <div className="p-5">
          {hasData && chartOption ? (
            <ReactECharts
              option={{ ...chartOption, grid: { left: 52, right: 16, top: 24, bottom: 40 } }}
              style={{ height: 320 }}
              opts={{ renderer: "canvas" }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-64 gap-2">
              <BarChart2 className="w-8 h-8 text-ink-dim opacity-30" />
              <p className="text-sm text-ink-dim">No data available for this time range</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Metric tile ────────────────────────────────────────────────────────────────

function MetricTile({
  id,
  icon: Icon,
  iconColor,
  title,
  value,
  subtitle,
  hasData,
  chartOption,
  canDelete,
  isDragOver,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onExpand,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  id: string;
  icon: React.ElementType;
  iconColor: string;
  title: string;
  value?: string;
  subtitle?: string;
  hasData: boolean;
  chartOption?: object;
  canDelete: boolean;
  isDragOver: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onDragEnd: () => void;
  onExpand: () => void;
  onEdit?: () => void;
  onDuplicate: () => void;
  onDelete?: () => void;
}) {
  function exportData() {
    if (!chartOption) return;
    const opt = chartOption as { xAxis?: { data?: string[] }; series?: { data?: number[] }[] };
    const xData = opt.xAxis?.data ?? [];
    const yData = opt.series?.[0]?.data ?? [];
    const csv = ["x,y", ...xData.map((x, i) => `${x},${yData[i] ?? 0}`)].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/\s+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportChart() {
    // trigger the echarts SVG download via the container
    const container = document.getElementById(`chart-${id}`);
    const svg = container?.querySelector("svg");
    if (!svg) return;
    const blob = new Blob([svg.outerHTML], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/\s+/g, "_")}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={clsx(
        "bg-dark-surface rounded-xl border flex flex-col overflow-hidden transition-all select-none",
        isDragOver ? "border-brand-500/60 bg-brand-500/5 scale-[1.01]" : "border-dark-border"
      )}
    >
      {/* Tile header */}
      <div className="flex items-center gap-1.5 px-3 pt-3 pb-1">
        {/* Drag handle */}
        <GripVertical className="w-3.5 h-3.5 text-ink-dim opacity-40 cursor-grab shrink-0" />

        {/* Icon + title */}
        <Icon className={clsx("w-3.5 h-3.5 shrink-0", iconColor)} />
        <span className="text-xs font-semibold text-ink-secondary flex-1 truncate">{title}</span>

        {/* Actions */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={onExpand}
            className="p-1.5 rounded-lg text-ink-dim hover:text-ink-muted hover:bg-dark-raised transition-colors"
            title="Expand"
          >
            <Maximize2 className="w-3 h-3" />
          </button>
          {onEdit && (
            <button
              onClick={onEdit}
              className="p-1.5 rounded-lg text-ink-dim hover:text-ink-muted hover:bg-dark-raised transition-colors"
              title="Edit"
            >
              <Pencil className="w-3 h-3" />
            </button>
          )}
          <ChartMenu
            onExportChart={exportChart}
            onExportData={exportData}
            onDuplicate={onDuplicate}
            onDelete={canDelete ? onDelete : undefined}
            canDelete={canDelete}
          />
        </div>
      </div>

      {/* Value */}
      {value && (
        <div className="px-4 pb-0.5">
          <span className="text-xl font-bold font-mono text-ink-primary">{value}</span>
          {subtitle && <span className="text-[10px] text-ink-dim ml-2">{subtitle}</span>}
        </div>
      )}

      {/* Chart */}
      <div id={`chart-${id}`} className="flex-1 min-h-[130px]">
        {hasData && chartOption ? (
          <ReactECharts
            option={chartOption}
            style={{ height: 140 }}
            opts={{ renderer: "svg" }}
          />
        ) : (
          <NoData />
        )}
      </div>
    </div>
  );
}

// ── Custom chart modal ─────────────────────────────────────────────────────────

type MetricOption = { key: MetricKey; label: string; icon: React.ElementType };

const METRIC_OPTIONS: MetricOption[] = [
  { key: "sessions",      label: "Sessions",           icon: Activity       },
  { key: "cost",          label: "Total LLM cost",     icon: TrendingUp     },
  { key: "tokens",        label: "Token count",         icon: Hash           },
  { key: "latency",       label: "Avg latency",         icon: Timer          },
  { key: "tool_calls",    label: "Tool executions",     icon: Wrench         },
  { key: "error_rate",    label: "Error rate",          icon: AlertTriangle  },
  { key: "tool_duration", label: "Tool duration (p50)", icon: Timer          },
];

const CHART_TYPES: { key: ChartType; label: string }[] = [
  { key: "line", label: "Line" },
  { key: "area", label: "Area" },
  { key: "bar",  label: "Bar"  },
];

function CustomChartModal({
  initial,
  onSave,
  onClose,
}: {
  initial?: Partial<CustomChart>;
  onSave: (chart: Omit<CustomChart, "id">) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [metric, setMetric] = useState<MetricKey>(initial?.metric ?? "sessions");
  const [chartType, setChartType] = useState<ChartType>(initial?.chartType ?? "line");

  function handleSave() {
    if (!name.trim()) return;
    onSave({ name: name.trim(), metric, chartType });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-dark-surface border border-dark-border rounded-2xl w-full max-w-md mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-divider">
          <h2 className="text-sm font-semibold text-ink-primary">
            {initial?.name ? "Edit chart" : "Add custom chart"}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-ink-dim hover:text-ink-muted hover:bg-dark-raised transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-5">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-muted mb-1.5">Chart name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. My custom metric"
              className="input-dark w-full text-sm"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-muted mb-1.5">Metric</label>
            <div className="grid grid-cols-2 gap-2">
              {METRIC_OPTIONS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setMetric(key)}
                  className={clsx(
                    "flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-medium transition-all",
                    metric === key
                      ? "bg-brand-500/10 border-brand-500/40 text-brand-400"
                      : "border-dark-border text-ink-muted hover:border-dark-divider hover:text-ink-secondary"
                  )}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-muted mb-1.5">Chart type</label>
            <div className="flex gap-2">
              {CHART_TYPES.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setChartType(key)}
                  className={clsx(
                    "flex-1 py-2 rounded-lg border text-xs font-medium transition-all",
                    chartType === key
                      ? "bg-brand-500/10 border-brand-500/40 text-brand-400"
                      : "border-dark-border text-ink-muted hover:border-dark-divider hover:text-ink-secondary"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-dark-divider">
          <button
            onClick={onClose}
            className="flex-1 text-xs py-2 rounded-lg border border-dark-border text-ink-secondary hover:text-ink-primary bg-dark-surface transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="flex-1 text-xs py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {initial?.name ? "Save changes" : "Add chart"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Date preset picker ─────────────────────────────────────────────────────────

function DatePresetPicker({ value, onChange }: { value: DatePreset; onChange: (p: DatePreset) => void }) {
  const [open, setOpen] = useState(false);
  const { label } = presetToRange(value);
  const presets: DatePreset[] = ["1h", "6h", "24h", "7d", "30d"];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dark-border text-xs text-ink-secondary hover:text-ink-primary hover:border-dark-divider transition-colors bg-dark-surface"
      >
        {label} <ChevronDown className="w-3 h-3 text-ink-dim" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 bg-dark-surface border border-dark-border rounded-xl shadow-xl py-1 min-w-[160px]">
            {presets.map((p) => (
              <button
                key={p}
                onClick={() => { onChange(p); setOpen(false); }}
                className={clsx(
                  "w-full text-left px-3 py-2 text-xs transition-colors",
                  value === p ? "text-brand-400 bg-brand-500/10" : "text-ink-secondary hover:bg-dark-raised"
                )}
              >
                {presetToRange(p).label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Local storage helpers ──────────────────────────────────────────────────────

const CUSTOM_CHARTS_KEY = "dottle_custom_charts";

function loadCustomCharts(): CustomChart[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(CUSTOM_CHARTS_KEY) ?? "[]"); }
  catch { return []; }
}

function saveCustomCharts(charts: CustomChart[]) {
  localStorage.setItem(CUSTOM_CHARTS_KEY, JSON.stringify(charts));
}

// ── Built-in chart definitions ─────────────────────────────────────────────────

const METRIC_META: Record<MetricKey, { icon: React.ElementType; iconColor: string; color: string; label: string }> = {
  sessions:      { icon: Activity,      iconColor: "text-emerald-400", color: "#10b981", label: "Sessions"           },
  cost:          { icon: TrendingUp,    iconColor: "text-amber-400",   color: "#f59e0b", label: "Total LLM cost"     },
  tokens:        { icon: Hash,          iconColor: "text-indigo-400",  color: "#6366f1", label: "Token count"        },
  latency:       { icon: Timer,         iconColor: "text-sky-400",     color: "#38bdf8", label: "Latency"            },
  tool_calls:    { icon: Wrench,        iconColor: "text-violet-400",  color: "#a78bfa", label: "Tool executions"    },
  error_rate:    { icon: AlertTriangle, iconColor: "text-red-400",     color: "#f87171", label: "Tool error rate"    },
  tool_duration: { icon: Timer,         iconColor: "text-pink-400",    color: "#ec4899", label: "Tool duration (p50)"},
};

const DEFAULT_BUILTIN: CustomChart[] = [
  { id: "builtin-spans",         name: "Spans",              metric: "sessions",      chartType: "line", isBuiltIn: true },
  { id: "builtin-latency",       name: "Latency",            metric: "latency",       chartType: "line", isBuiltIn: true },
  { id: "builtin-cost",          name: "Total LLM cost",     metric: "cost",          chartType: "line", isBuiltIn: true },
  { id: "builtin-tokens",        name: "Token count",        metric: "tokens",        chartType: "line", isBuiltIn: true },
  { id: "builtin-tool-exec",     name: "Tool executions",    metric: "tool_calls",    chartType: "line", isBuiltIn: true },
  { id: "builtin-error-rate",    name: "Tool error rate",    metric: "error_rate",    chartType: "line", isBuiltIn: true },
  { id: "builtin-scores",        name: "Scores",             metric: "sessions",      chartType: "line", isBuiltIn: true },
  { id: "builtin-tool-duration", name: "Tool duration (p50)", metric: "tool_duration", chartType: "line", isBuiltIn: true },
];

// ── Main page ──────────────────────────────────────────────────────────────────

export default function MonitorPage() {
  const { selectedProject } = useProject();
  const PROJECT_ID = selectedProject?.id ?? "";

  const [preset, setPreset] = useState<DatePreset>("7d");
  const [search, setSearch] = useState("");
  const [showAddChart, setShowAddChart] = useState(false);
  const [editingChart, setEditingChart] = useState<CustomChart | null>(null);
  const [expandedChart, setExpandedChart] = useState<CustomChart | null>(null);
  const [customCharts, setCustomCharts] = useState<CustomChart[]>(loadCustomCharts);
  const [builtInCharts] = useState<CustomChart[]>(DEFAULT_BUILTIN);

  // Drag state
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);


  const { from, to } = useMemo(() => presetToRange(preset), [preset]);

  // ── Queries ───────────────────────────────────────────────────────────────────

  const { data: costData } = useQuery({
    queryKey: ["cost-over-time", PROJECT_ID, from, to],
    queryFn: () => metricsApi.costOverTime(PROJECT_ID, preset === "1h" || preset === "6h" ? "hour" : "day", from, to),
    enabled: !!PROJECT_ID,
  });

  const { data: toolData } = useQuery({
    queryKey: ["tool-failure-rates", PROJECT_ID, from, to],
    queryFn: () => metricsApi.toolFailureRates(PROJECT_ID, from, to),
    enabled: !!PROJECT_ID,
  });

  const { data: summaryData } = useQuery({
    queryKey: ["metrics-summary", PROJECT_ID, from, to],
    queryFn: () => metricsApi.summary(PROJECT_ID, from, to),
    enabled: !!PROJECT_ID,
  });

  // ── Derived series ────────────────────────────────────────────────────────────

  const xLabels = useMemo(
    () => costData?.series.map((b) => b.bucket.slice(0, preset === "7d" || preset === "30d" ? 10 : 13)) ?? [],
    [costData, preset]
  );
  const sessionSeries   = useMemo(() => costData?.series.map((b) => b.session_count) ?? [], [costData]);
  const costSeries      = useMemo(() => costData?.series.map((b) => parseFloat(b.cost_usd.toFixed(6))) ?? [], [costData]);
  const tokenSeries     = useMemo(() => costData?.series.map((b) => b.token_count) ?? [], [costData]);

  const avgToolDuration = useMemo(() => {
    const withDur = toolData?.tools.filter((t) => t.avg_duration_ms) ?? [];
    if (!withDur.length) return null;
    return withDur.reduce((s, t) => s + (t.avg_duration_ms ?? 0), 0) / withDur.length;
  }, [toolData]);

  const totalToolCalls = useMemo(() => toolData?.tools.reduce((s, t) => s + t.total, 0) ?? 0, [toolData]);

  // ── Data resolver ──────────────────────────────────────────────────────────────

  const getChartData = useCallback(
    (metric: MetricKey): { x: string[]; y: number[]; formatter?: (v: number) => string; hasData: boolean; value?: string; subtitle?: string } => {
      const hasTimeSeries = xLabels.length > 0;

      switch (metric) {
        case "sessions":
          return {
            x: xLabels, y: sessionSeries,
            hasData: hasTimeSeries && sessionSeries.some((v) => v > 0),
            value: summaryData ? String(summaryData.total_sessions) : undefined,
            subtitle: "sessions",
          };
        case "cost":
          return {
            x: xLabels, y: costSeries,
            formatter: (v) => `$${v.toFixed(6)}`,
            hasData: hasTimeSeries && costSeries.some((v) => v > 0),
            value: summaryData ? `$${summaryData.total_cost_usd.toFixed(4)}` : undefined,
            subtitle: "total",
          };
        case "tokens":
          return {
            x: xLabels, y: tokenSeries,
            hasData: hasTimeSeries && tokenSeries.some((v) => v > 0),
          };
        case "latency":
          return {
            x: [], y: [], hasData: false,
            value: summaryData ? `${Math.round(summaryData.avg_latency_ms)}ms` : undefined,
            subtitle: "avg",
          };
        case "tool_calls":
          return {
            x: [], y: [], hasData: false,
            value: totalToolCalls > 0 ? String(totalToolCalls) : undefined,
            subtitle: "total calls",
          };
        case "error_rate":
          return {
            x: [], y: [], hasData: false,
            formatter: (v) => `${v.toFixed(1)}%`,
            value: summaryData ? `${summaryData.tool_failure_rate_pct.toFixed(1)}%` : undefined,
            subtitle: "avg",
          };
        case "tool_duration":
          return {
            x: [], y: [], hasData: false,
            formatter: (v) => v < 1000 ? `${Math.round(v)}ms` : `${(v / 1000).toFixed(2)}s`,
            value: avgToolDuration ? (avgToolDuration < 1000 ? `${Math.round(avgToolDuration)}ms` : `${(avgToolDuration / 1000).toFixed(2)}s`) : undefined,
            subtitle: "avg",
          };
      }
    },
    [xLabels, sessionSeries, costSeries, tokenSeries, summaryData, totalToolCalls, avgToolDuration]
  );

  // ── Chart option builder ──────────────────────────────────────────────────────

  function getChartOption(metric: MetricKey, chartType: ChartType, tall = false): object | undefined {
    const { x, y, formatter, hasData } = getChartData(metric);
    if (!hasData || !x.length) return undefined;
    const meta = METRIC_META[metric];
    return miniLineOption(x, y, meta.color, formatter, chartType, tall);
  }

  // ── Drag & drop ───────────────────────────────────────────────────────────────

  function handleDrop(targetId: string, list: CustomChart[], setList: (c: CustomChart[]) => void) {
    if (!dragId || dragId === targetId) { setDropId(null); return; }
    const arr = [...list];
    const fromIdx = arr.findIndex((c) => c.id === dragId);
    const toIdx   = arr.findIndex((c) => c.id === targetId);
    if (fromIdx === -1 || toIdx === -1) { setDropId(null); return; }
    arr.splice(toIdx, 0, arr.splice(fromIdx, 1)[0]);
    setList(arr);
    setDropId(null);
  }

  // ── Custom chart actions ──────────────────────────────────────────────────────

  function addChart(chart: Omit<CustomChart, "id">) {
    const next = [...customCharts, { ...chart, id: crypto.randomUUID() }];
    setCustomCharts(next);
    saveCustomCharts(next);
  }

  function updateChart(id: string, chart: Omit<CustomChart, "id">) {
    const next = customCharts.map((c) => c.id === id ? { ...c, ...chart } : c);
    setCustomCharts(next);
    saveCustomCharts(next);
  }

  function duplicateChart(chart: CustomChart) {
    const copy: CustomChart = { ...chart, id: crypto.randomUUID(), name: `${chart.name} (copy)`, isBuiltIn: false };
    const next = [...customCharts, copy];
    setCustomCharts(next);
    saveCustomCharts(next);
  }

  function deleteChart(id: string) {
    const next = customCharts.filter((c) => c.id !== id);
    setCustomCharts(next);
    saveCustomCharts(next);
  }

  // ── Render a tile ─────────────────────────────────────────────────────────────

  function renderTile(card: CustomChart, list: CustomChart[], setList: (c: CustomChart[]) => void) {
    const meta = METRIC_META[card.metric] ?? METRIC_META.sessions;
    const { hasData, value, subtitle } = getChartData(card.metric);
    const option = getChartOption(card.metric, card.chartType);

    return (
      <MetricTile
        key={card.id}
        id={card.id}
        icon={meta.icon}
        iconColor={meta.iconColor}
        title={card.name}
        value={value}
        subtitle={subtitle}
        hasData={hasData}
        chartOption={option}
        canDelete={!card.isBuiltIn}
        isDragOver={dropId === card.id}
        onDragStart={() => setDragId(card.id)}
        onDragOver={(e) => { e.preventDefault(); setDropId(card.id); }}
        onDrop={() => handleDrop(card.id, list, setList)}
        onDragEnd={() => { setDragId(null); setDropId(null); }}
        onExpand={() => setExpandedChart(card)}
        onEdit={!card.isBuiltIn ? () => setEditingChart(card) : undefined}
        onDuplicate={() => duplicateChart(card)}
        onDelete={!card.isBuiltIn ? () => deleteChart(card.id) : undefined}
      />
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 flex-wrap px-1 pb-4 border-b border-dark-divider shrink-0">
        <div className="flex rounded-lg border border-dark-border overflow-hidden text-[11px] bg-dark-surface">
          <button className="px-3 py-1.5 bg-brand-600/20 text-brand-400 font-medium flex items-center gap-1.5">
            <LayoutGrid className="w-3 h-3" /> Chart
          </button>
          <Link
            href="/sessions"
            className="px-3 py-1.5 text-ink-muted hover:text-ink-secondary border-l border-dark-border transition-colors flex items-center gap-1.5"
          >
            <Activity className="w-3 h-3" /> Logs
          </Link>
        </div>

        <div className="h-5 w-px bg-dark-divider" />
        <DatePresetPicker value={preset} onChange={setPreset} />
        <button
          onClick={() => setPreset("7d")}
          className="px-3 py-1.5 rounded-lg border border-dark-border text-xs text-ink-muted hover:text-ink-secondary hover:border-dark-divider transition-colors bg-dark-surface"
        >
          Reset
        </button>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dark-border text-xs text-ink-muted hover:text-ink-secondary hover:border-dark-divider transition-colors bg-dark-surface">
          <SlidersHorizontal className="w-3 h-3" /> Filter
        </button>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dark-border text-xs text-ink-muted hover:text-ink-secondary hover:border-dark-divider transition-colors bg-dark-surface">
          Group <ChevronDown className="w-3 h-3" />
        </button>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dark-border bg-dark-surface flex-1 min-w-[160px] max-w-xs">
          <Search className="w-3.5 h-3.5 text-ink-dim shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search logs…"
            className="bg-transparent text-xs text-ink-secondary placeholder-ink-dim outline-none w-full"
          />
        </div>
        <Link
          href="/alerts"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dark-border text-xs text-ink-muted hover:text-ink-secondary hover:border-dark-divider transition-colors bg-dark-surface ml-auto"
        >
          <Bell className="w-3 h-3" /> Alerts
        </Link>
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto pt-5 space-y-8">

        {/* ── Built-in grid ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {builtInCharts.map((card) => renderTile(card, builtInCharts, () => {}))}
        </div>

        {/* ── Custom charts ── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-ink-primary">Custom charts</h2>
              <p className="text-xs text-ink-muted mt-0.5">
                Create custom views and charts to visualize metrics and discover trends over time
              </p>
            </div>
            <button
              onClick={() => setShowAddChart(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white font-medium transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add chart
            </button>
          </div>

          {customCharts.length === 0 ? (
            <div
              onClick={() => setShowAddChart(true)}
              className="flex flex-col items-center justify-center border border-dashed border-dark-border rounded-xl py-12 cursor-pointer hover:border-brand-500/40 hover:bg-brand-500/5 transition-colors group"
            >
              <div className="w-10 h-10 rounded-xl bg-dark-raised flex items-center justify-center mb-3 group-hover:bg-brand-500/10 transition-colors">
                <Plus className="w-5 h-5 text-ink-dim group-hover:text-brand-400 transition-colors" />
              </div>
              <p className="text-sm font-medium text-ink-muted group-hover:text-ink-secondary transition-colors">Add your first custom chart</p>
              <p className="text-xs text-ink-dim mt-1">Track the metrics that matter most to you</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {customCharts.map((card) => renderTile(card, customCharts, (updated) => {
                setCustomCharts(updated);
                saveCustomCharts(updated);
              }))}
              {/* Add more tile */}
              <button
                onClick={() => setShowAddChart(true)}
                className="flex flex-col items-center justify-center border border-dashed border-dark-border rounded-xl py-8 cursor-pointer hover:border-brand-500/40 hover:bg-brand-500/5 transition-colors group min-h-[180px]"
              >
                <Plus className="w-5 h-5 text-ink-dim group-hover:text-brand-400 transition-colors mb-1" />
                <span className="text-xs text-ink-dim group-hover:text-ink-muted transition-colors">Add chart</span>
              </button>
            </div>
          )}
        </div>

        <div className="h-4" />
      </div>

      {/* ── Add chart modal ── */}
      {showAddChart && (
        <CustomChartModal
          onSave={addChart}
          onClose={() => setShowAddChart(false)}
        />
      )}

      {/* ── Edit chart modal ── */}
      {editingChart && (
        <CustomChartModal
          initial={editingChart}
          onSave={(chart) => updateChart(editingChart.id, chart)}
          onClose={() => setEditingChart(null)}
        />
      )}

      {/* ── Expand modal ── */}
      {expandedChart && (() => {
        const meta = METRIC_META[expandedChart.metric] ?? METRIC_META.sessions;
        const { hasData, value, subtitle } = getChartData(expandedChart.metric);
        const option = getChartOption(expandedChart.metric, expandedChart.chartType, true);
        return (
          <ExpandModal
            title={expandedChart.name}
            icon={meta.icon}
            iconColor={meta.iconColor}
            value={value}
            subtitle={subtitle}
            hasData={hasData}
            chartOption={option}
            onClose={() => setExpandedChart(null)}
          />
        );
      })()}
    </div>
  );
}
