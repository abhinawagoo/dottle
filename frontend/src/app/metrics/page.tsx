"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { metricsApi } from "@/lib/api";
import { Card, EmptyState } from "@/components/ui/Card";
import ReactECharts from "echarts-for-react";
import { BarChart2, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { useProject } from "@/lib/project-context";
import { RegressionReport } from "@/lib/types";

const CHART_THEME = {
  backgroundColor: "transparent",
  textStyle: { color: "#a1a1aa", fontFamily: "Inter, sans-serif" },
  axisPointer: { lineStyle: { color: "#3f3f46" } },
};

function DeltaCell({ value, unit = "", lowerIsBetter = true }: { value: number; unit?: string; lowerIsBetter?: boolean }) {
  const improved = lowerIsBetter ? value < -0.5 : value > 0.5;
  const regressed = lowerIsBetter ? value > 0.5 : value < -0.5;
  const prefix = value > 0 ? "+" : "";
  const color = improved ? "text-status-green" : regressed ? "text-status-red" : "text-ink-muted";
  const Icon = improved ? TrendingDown : regressed ? TrendingUp : Minus;
  return (
    <span className={`flex items-center gap-1 justify-end font-mono text-[11px] tabular-nums ${color}`}>
      <Icon className="w-3 h-3" />
      {prefix}{value.toFixed(unit === "$" ? 6 : 1)}{unit === "ms" ? "ms" : unit === "%" ? "%" : unit === "$" ? "" : ""}
    </span>
  );
}

export default function MetricsPage() {
  const { selectedProject } = useProject();
  const PROJECT_ID = selectedProject?.id ?? "";
  const [regressionAgentName, setRegressionAgentName] = useState("");
  const [versionA, setVersionA] = useState("");
  const [versionB, setVersionB] = useState("");
  const [regressionMode, setRegressionMode] = useState<"version" | "time">("time");

  const { data: costData } = useQuery({
    queryKey: ["cost-over-time", PROJECT_ID],
    queryFn: () => metricsApi.costOverTime(PROJECT_ID, "day"),
    enabled: !!PROJECT_ID,
  });

  const { data: toolData } = useQuery({
    queryKey: ["tool-failure-rates", PROJECT_ID],
    queryFn: () => metricsApi.toolFailureRates(PROJECT_ID),
    enabled: !!PROJECT_ID,
  });

  const { data: latencyData } = useQuery({
    queryKey: ["latency", PROJECT_ID],
    queryFn: () => metricsApi.latency(PROJECT_ID),
    enabled: !!PROJECT_ID,
  });

  const regressionParams = regressionMode === "version"
    ? { project_id: PROJECT_ID, agent_name: regressionAgentName || undefined, version_a: versionA, version_b: versionB }
    : { project_id: PROJECT_ID, agent_name: regressionAgentName || undefined };

  const { data: regressionData, isLoading: regressionLoading } = useQuery<RegressionReport>({
    queryKey: ["regression", PROJECT_ID, regressionMode, versionA, versionB, regressionAgentName],
    queryFn: () => metricsApi.regression(regressionParams),
    enabled: !!PROJECT_ID && (regressionMode === "time" || (!!versionA && !!versionB)),
  });

  const costChartOptions = {
    ...CHART_THEME,
    tooltip: {
      trigger: "axis",
      backgroundColor: "#18181b",
      borderColor: "#27272a",
      textStyle: { color: "#fafafa", fontSize: 12 },
    },
    legend: {
      data: ["Cost ($)", "Sessions"],
      textStyle: { color: "#71717a", fontSize: 11 },
      right: 0,
    },
    xAxis: {
      type: "category",
      data: costData?.series.map((b) => b.bucket.slice(0, 10)) ?? [],
      axisLabel: { color: "#52525b", fontSize: 11 },
      axisLine: { lineStyle: { color: "#27272a" } },
      splitLine: { lineStyle: { color: "#1f1f23" } },
    },
    yAxis: [
      {
        type: "value",
        name: "Cost ($)",
        nameTextStyle: { color: "#52525b", fontSize: 10 },
        axisLabel: {
          color: "#52525b",
          fontSize: 10,
          formatter: (v: number) => `$${v.toFixed(3)}`,
        },
        splitLine: { lineStyle: { color: "#1f1f23" } },
      },
      {
        type: "value",
        name: "Sessions",
        nameTextStyle: { color: "#52525b", fontSize: 10 },
        axisLabel: { color: "#52525b", fontSize: 10 },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: "Cost ($)",
        type: "bar",
        data: costData?.series.map((b) => parseFloat(b.cost_usd.toFixed(5))) ?? [],
        itemStyle: { color: "#3a5c30", borderRadius: [3, 3, 0, 0] },
        barMaxWidth: 32,
      },
      {
        name: "Sessions",
        type: "line",
        yAxisIndex: 1,
        data: costData?.series.map((b) => b.session_count) ?? [],
        lineStyle: { color: "#10b981", width: 2 },
        itemStyle: { color: "#10b981" },
        symbol: "circle",
        symbolSize: 5,
        smooth: true,
      },
    ],
    grid: { left: 55, right: 55, bottom: 35, top: 45 },
  };

  const toolChartOptions = {
    ...CHART_THEME,
    tooltip: {
      trigger: "axis",
      backgroundColor: "#18181b",
      borderColor: "#27272a",
      textStyle: { color: "#fafafa", fontSize: 12 },
      formatter: (params: { name: string; value: number }[]) =>
        `${params[0].name}<br/>Failure rate: <b>${params[0].value.toFixed(1)}%</b>`,
    },
    xAxis: {
      type: "value",
      axisLabel: { color: "#52525b", fontSize: 10, formatter: (v: number) => `${v}%` },
      splitLine: { lineStyle: { color: "#1f1f23" } },
    },
    yAxis: {
      type: "category",
      data: toolData?.tools.map((t) => t.tool_name) ?? [],
      axisLabel: { color: "#a1a1aa", fontSize: 11 },
      axisLine: { lineStyle: { color: "#27272a" } },
    },
    series: [
      {
        name: "Failure Rate",
        type: "bar",
        data: toolData?.tools.map((t) => t.failure_rate_pct) ?? [],
        itemStyle: {
          borderRadius: [0, 3, 3, 0],
          color: (params: { data: number }) =>
            params.data > 20 ? "#ef4444" : params.data > 10 ? "#f59e0b" : "#3a5c30",
        },
        barMaxWidth: 20,
      },
    ],
    grid: { left: 110, right: 30, bottom: 30, top: 15 },
  };

  const latencyChartOptions = {
    ...CHART_THEME,
    tooltip: {
      trigger: "axis",
      backgroundColor: "#18181b",
      borderColor: "#27272a",
      textStyle: { color: "#fafafa", fontSize: 12 },
    },
    xAxis: {
      type: "category",
      data: ["P50", "P75", "P95", "P99"],
      axisLabel: { color: "#a1a1aa", fontSize: 11 },
      axisLine: { lineStyle: { color: "#27272a" } },
    },
    yAxis: {
      type: "value",
      axisLabel: {
        color: "#52525b",
        fontSize: 10,
        formatter: (v: number) => (v < 1000 ? `${v}ms` : `${(v / 1000).toFixed(1)}s`),
      },
      splitLine: { lineStyle: { color: "#1f1f23" } },
    },
    series: [
      {
        type: "bar",
        data: latencyData
          ? [
              latencyData.percentiles.p50_ms,
              latencyData.percentiles.p75_ms,
              latencyData.percentiles.p95_ms,
              latencyData.percentiles.p99_ms,
            ]
          : [],
        itemStyle: {
          borderRadius: [3, 3, 0, 0],
          color: (params: { dataIndex: number }) =>
            ["#3a5c30", "#6b9e5e", "#f59e0b", "#ef4444"][params.dataIndex],
        },
        barMaxWidth: 40,
      },
    ],
    grid: { left: 60, right: 20, bottom: 30, top: 15 },
  };

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <div>
        <h1 className="text-lg font-semibold text-ink-primary">Metrics</h1>
        <p className="text-xs text-ink-muted mt-0.5">Last 7 days · All agents</p>
      </div>

      <Card title="Cost & Session Volume" subtitle="Daily breakdown">
        {!costData?.series.length ? (
          <EmptyState
            icon={<BarChart2 />}
            title="No cost data yet"
            description="Start recording sessions with the SDK to see cost and volume trends."
          />
        ) : (
          <ReactECharts option={costChartOptions} style={{ height: 260 }} />
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Tool Failure Rates" subtitle="% of calls that errored">
          {toolData?.tools.length ? (
            <ReactECharts option={toolChartOptions} style={{ height: 220 }} />
          ) : (
            <EmptyState title="No tool data yet" description="Tool spans will appear here." />
          )}
        </Card>
        <Card title="Latency Percentiles" subtitle="Session duration distribution">
          {latencyData ? (
            <ReactECharts option={latencyChartOptions} style={{ height: 220 }} />
          ) : (
            <EmptyState title="No latency data yet" description="Session latency will appear here." />
          )}
        </Card>
      </div>

      {/* Tool failure detail table */}
      {toolData?.tools.length ? (
        <Card title="Tool Breakdown" subtitle={`${toolData.tools.length} tools tracked`}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-ink-muted border-b border-dark-divider">
                <th className="text-left pb-2.5 font-semibold">Tool</th>
                <th className="text-right pb-2.5 font-semibold">Calls</th>
                <th className="text-right pb-2.5 font-semibold">Errors</th>
                <th className="text-right pb-2.5 font-semibold">Failure Rate</th>
                <th className="text-right pb-2.5 font-semibold">Avg Duration</th>
              </tr>
            </thead>
            <tbody>
              {toolData.tools.map((t) => (
                <tr key={t.tool_name} className="table-row-hover border-b border-dark-divider/40 last:border-0">
                  <td className="py-2.5 font-medium text-ink-secondary">{t.tool_name}</td>
                  <td className="py-2.5 text-right font-mono text-[11px] text-ink-muted tabular-nums">{t.total.toLocaleString()}</td>
                  <td className="py-2.5 text-right font-mono text-[11px] text-status-red tabular-nums">{t.errors.toLocaleString()}</td>
                  <td className="py-2.5 text-right font-mono text-[11px] tabular-nums">
                    <span className={t.failure_rate_pct > 10 ? "text-status-red font-bold" : "text-ink-muted"}>
                      {t.failure_rate_pct.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-2.5 text-right font-mono text-[11px] text-ink-muted tabular-nums">
                    {t.avg_duration_ms ? `${Math.round(t.avg_duration_ms)}ms` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}

      {/* ── Regression Detection ─────────────────────────────────────────────── */}
      <Card
        title="Regression Detection"
        subtitle="Compare two agent versions or time windows to measure improvements"
      >
        {/* Controls */}
        <div className="flex items-center gap-3 flex-wrap mb-5">
          <div className="flex rounded-lg border border-dark-border overflow-hidden text-[11px]">
            <button
              onClick={() => setRegressionMode("time")}
              className={`px-3 py-1.5 transition-colors ${regressionMode === "time" ? "bg-brand-600/20 text-brand-400" : "text-ink-muted hover:text-ink-secondary"}`}
            >
              Time windows
            </button>
            <button
              onClick={() => setRegressionMode("version")}
              className={`px-3 py-1.5 border-l border-dark-border transition-colors ${regressionMode === "version" ? "bg-brand-600/20 text-brand-400" : "text-ink-muted hover:text-ink-secondary"}`}
            >
              By version
            </button>
          </div>
          <input
            type="text"
            placeholder="Agent name (optional)"
            value={regressionAgentName}
            onChange={(e) => setRegressionAgentName(e.target.value)}
            className="input-dark text-xs w-44"
          />
          {regressionMode === "version" && (
            <>
              <input
                type="text"
                placeholder="Baseline version (e.g. 1.1.0)"
                value={versionA}
                onChange={(e) => setVersionA(e.target.value)}
                className="input-dark text-xs w-44"
              />
              <input
                type="text"
                placeholder="Comparison version (e.g. 1.2.0)"
                value={versionB}
                onChange={(e) => setVersionB(e.target.value)}
                className="input-dark text-xs w-44"
              />
            </>
          )}
        </div>

        {/* Results */}
        {regressionLoading ? (
          <div className="space-y-2"><div className="shimmer h-32 w-full" /></div>
        ) : regressionData ? (
          <>
            {/* Verdict banner */}
            <div className={`flex items-center gap-3 rounded-xl px-4 py-3 mb-4 border ${
              regressionData.verdict === "improved"
                ? "bg-status-green/5 border-status-green/20"
                : regressionData.verdict === "regressed"
                ? "bg-status-red/5 border-status-red/20"
                : "bg-dark-raised border-dark-border"
            }`}>
              {regressionData.verdict === "improved" && <TrendingDown className="w-4 h-4 text-status-green" />}
              {regressionData.verdict === "regressed" && <TrendingUp className="w-4 h-4 text-status-red" />}
              {regressionData.verdict === "neutral" && <Minus className="w-4 h-4 text-ink-muted" />}
              <div>
                <p className={`text-sm font-semibold ${
                  regressionData.verdict === "improved" ? "text-status-green"
                  : regressionData.verdict === "regressed" ? "text-status-red"
                  : "text-ink-secondary"
                }`}>
                  {regressionData.verdict === "improved" ? "Improved" : regressionData.verdict === "regressed" ? "Regressed" : "No significant change"}
                </p>
                <p className="text-[11px] text-ink-muted">
                  Comparing <span className="font-medium text-ink-secondary">{regressionData.baseline.label}</span> ({regressionData.baseline.session_count} sessions)
                  {" → "}
                  <span className="font-medium text-ink-secondary">{regressionData.comparison.label}</span> ({regressionData.comparison.session_count} sessions)
                </p>
              </div>
            </div>

            {/* Comparison table */}
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-ink-muted border-b border-dark-divider">
                  <th className="text-left pb-2.5 font-semibold">Metric</th>
                  <th className="text-right pb-2.5 font-semibold">{regressionData.baseline.label}</th>
                  <th className="text-right pb-2.5 font-semibold">{regressionData.comparison.label}</th>
                  <th className="text-right pb-2.5 font-semibold">Delta</th>
                </tr>
              </thead>
              <tbody>
                {[
                  {
                    label: "Failure rate", unit: "%",
                    base: regressionData.baseline.failure_rate_pct,
                    cmp: regressionData.comparison.failure_rate_pct,
                    delta: regressionData.delta.failure_rate_pct,
                    lowerIsBetter: true,
                    fmt: (v: number) => `${v.toFixed(1)}%`,
                  },
                  {
                    label: "Loop rate", unit: "%",
                    base: regressionData.baseline.loop_rate_pct,
                    cmp: regressionData.comparison.loop_rate_pct,
                    delta: regressionData.delta.loop_rate_pct,
                    lowerIsBetter: true,
                    fmt: (v: number) => `${v.toFixed(1)}%`,
                  },
                  {
                    label: "Avg cost / session", unit: "$",
                    base: regressionData.baseline.avg_cost_usd,
                    cmp: regressionData.comparison.avg_cost_usd,
                    delta: regressionData.delta.avg_cost_usd,
                    lowerIsBetter: true,
                    fmt: (v: number) => `$${v.toFixed(5)}`,
                  },
                  {
                    label: "Avg latency", unit: "ms",
                    base: regressionData.baseline.avg_latency_ms,
                    cmp: regressionData.comparison.avg_latency_ms,
                    delta: regressionData.delta.avg_latency_ms,
                    lowerIsBetter: true,
                    fmt: (v: number) => v < 1000 ? `${Math.round(v)}ms` : `${(v/1000).toFixed(2)}s`,
                  },
                  {
                    label: "P95 latency", unit: "ms",
                    base: regressionData.baseline.p95_latency_ms,
                    cmp: regressionData.comparison.p95_latency_ms,
                    delta: regressionData.comparison.p95_latency_ms - regressionData.baseline.p95_latency_ms,
                    lowerIsBetter: true,
                    fmt: (v: number) => v < 1000 ? `${Math.round(v)}ms` : `${(v/1000).toFixed(2)}s`,
                  },
                  {
                    label: "Avg iterations", unit: "",
                    base: regressionData.baseline.avg_iterations,
                    cmp: regressionData.comparison.avg_iterations,
                    delta: regressionData.delta.avg_iterations,
                    lowerIsBetter: true,
                    fmt: (v: number) => v.toFixed(1),
                  },
                ].map((row) => (
                  <tr key={row.label} className="border-b border-dark-divider/40 last:border-0">
                    <td className="py-2.5 text-xs text-ink-secondary">{row.label}</td>
                    <td className="py-2.5 text-right font-mono text-[11px] text-ink-muted tabular-nums">{row.fmt(row.base)}</td>
                    <td className="py-2.5 text-right font-mono text-[11px] text-ink-muted tabular-nums">{row.fmt(row.cmp)}</td>
                    <td className="py-2.5 text-right">
                      <DeltaCell value={row.delta} unit={row.unit} lowerIsBetter={row.lowerIsBetter} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <div className="text-[12px] text-ink-muted py-4 text-center">
            {regressionMode === "version"
              ? "Enter two version numbers above to compare them."
              : "Comparing last 7 days vs prior 7 days…"}
          </div>
        )}
      </Card>
    </div>
  );
}
