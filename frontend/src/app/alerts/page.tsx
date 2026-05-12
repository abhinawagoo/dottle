"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { alertsApi, projectsApi } from "@/lib/api";
import { AlertRule } from "@/lib/types";
import { Card, EmptyState } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatDistanceToNow } from "date-fns";
import {
  Plus, Trash2, ToggleLeft, ToggleRight, CheckCircle2, XCircle,
  Bell, X, AlertCircle, ChevronRight, Clock, History,
} from "lucide-react";
import { useProject } from "@/lib/project-context";

// ── Constants ─────────────────────────────────────────────────────────────────

const METRICS = [
  { value: "error_rate",          label: "Error Rate",          unit: "%",    hint: "% of sessions that failed" },
  { value: "loop_detected",       label: "Agent Loops",         unit: "loops",hint: "Sessions with loop detected" },
  { value: "tool_failure_rate",   label: "Tool Failure Rate",   unit: "%",    hint: "% of tool calls that errored" },
  { value: "cost_per_session",    label: "Cost per Session",    unit: "$",    hint: "Avg spend per session (USD)" },
  { value: "session_duration_ms", label: "Session Duration",    unit: "ms",   hint: "95th pct session time (ms)" },
  { value: "iteration_count",     label: "Max Iterations",      unit: "",     hint: "Max agent steps in a session" },
];

const OPERATORS = [
  { value: "gt",  label: "is greater than",   short: ">" },
  { value: "gte", label: "is at least",        short: "≥" },
  { value: "lt",  label: "is less than",       short: "<" },
  { value: "lte", label: "is at most",         short: "≤" },
  { value: "eq",  label: "equals",             short: "=" },
];

const WINDOWS = [
  { value: 5,    label: "5 minutes" },
  { value: 15,   label: "15 minutes" },
  { value: 30,   label: "30 minutes" },
  { value: 60,   label: "1 hour" },
  { value: 360,  label: "6 hours" },
  { value: 1440, label: "24 hours" },
];

const PRESETS = [
  {
    emoji: "🚨", label: "High Error Rate",
    metric: "error_rate", operator: "gt", threshold: 10, window_minutes: 60,
    name: "High error rate alert",
  },
  {
    emoji: "🔁", label: "Agent Loop",
    metric: "loop_detected", operator: "gt", threshold: 2, window_minutes: 30,
    name: "Agent loop detected",
  },
  {
    emoji: "💰", label: "Cost Spike",
    metric: "cost_per_session", operator: "gt", threshold: 0.5, window_minutes: 60,
    name: "Cost spike alert",
  },
  {
    emoji: "🔧", label: "Tool Failures",
    metric: "tool_failure_rate", operator: "gt", threshold: 20, window_minutes: 30,
    name: "High tool failure rate",
  },
  {
    emoji: "🐌", label: "Slow Sessions",
    metric: "session_duration_ms", operator: "gt", threshold: 30000, window_minutes: 60,
    name: "Slow session alert",
  },
];

const blank = {
  name: "", metric: "error_rate", operator: "gt",
  threshold: 5, window_minutes: 60, channel: "slack", destination: "",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function metricLabel(m: string) {
  return METRICS.find(x => x.value === m)?.label ?? m;
}
function operatorShort(o: string) {
  return OPERATORS.find(x => x.value === o)?.short ?? o;
}
function metricUnit(m: string) {
  return METRICS.find(x => x.value === m)?.unit ?? "";
}
function windowLabel(w: number) {
  return WINDOWS.find(x => x.value === w)?.label ?? `${w} min`;
}
function formatMetricValue(metric: string, value: number) {
  if (metric === "cost_per_session") return `$${value.toFixed(4)}`;
  if (metric === "tool_failure_rate" || metric === "error_rate") return `${value.toFixed(1)}%`;
  if (metric === "session_duration_ms") return `${(value / 1000).toFixed(1)}s`;
  return `${value}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ConditionPreview({ metric, operator, threshold, window_minutes }: {
  metric: string; operator: string; threshold: number; window_minutes: number;
}) {
  const opObj = OPERATORS.find(o => o.value === operator);
  const metObj = METRICS.find(m => m.value === metric);
  const unit = metObj?.unit ?? "";
  const val = metric === "cost_per_session" ? `$${threshold}` : `${threshold}${unit}`;
  return (
    <div className="mt-3 px-3 py-2 bg-brand-500/8 border border-brand-500/20 rounded-lg">
      <p className="text-[11px] text-brand-300 font-mono">
        Alert when <span className="text-brand-200 font-semibold">{metObj?.label}</span>
        {" "}{opObj?.label}{" "}
        <span className="text-brand-200 font-semibold">{val}</span>
        {" "}in the last <span className="text-brand-200 font-semibold">{windowLabel(window_minutes)}</span>
      </p>
    </div>
  );
}

function RuleHistoryModal({ rule, projectId, onClose }: {
  rule: AlertRule; projectId: string; onClose: () => void;
}) {
  const { data: events, isLoading } = useQuery({
    queryKey: ["alert-events-rule", rule.id],
    queryFn: () => alertsApi.listEventsByRule(projectId, rule.id),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-lg bg-dark-surface border border-dark-border rounded-2xl shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-dark-divider">
          <div>
            <p className="text-xs text-ink-muted mb-0.5">Alert History</p>
            <h3 className="text-sm font-semibold text-ink-primary">{rule.name}</h3>
            <p className="text-[11px] text-ink-dim font-mono mt-1">
              {metricLabel(rule.metric)} {operatorShort(rule.operator)} {rule.threshold}{metricUnit(rule.metric)} · {windowLabel(rule.window_minutes)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-dark-raised text-ink-dim hover:text-ink-secondary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Events list */}
        <div className="p-4 max-h-96 overflow-y-auto">
          {isLoading ? (
            <p className="text-xs text-ink-muted text-center py-8">Loading…</p>
          ) : !events?.length ? (
            <div className="flex flex-col items-center py-10 text-center">
              <History className="w-8 h-8 text-ink-dim mb-2" />
              <p className="text-sm text-ink-muted">No alerts fired yet</p>
              <p className="text-xs text-ink-dim mt-1">Events appear here when this rule triggers</p>
            </div>
          ) : (
            <div className="space-y-2">
              {events.map(ev => (
                <div
                  key={ev.id}
                  className="flex items-start gap-3 p-3 bg-dark-raised rounded-xl border border-dark-border"
                >
                  {ev.delivered ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-status-green mt-0.5 shrink-0" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-status-red mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium text-ink-secondary">
                        {metricLabel(rule.metric)} was{" "}
                        <span className="font-mono text-ink-primary">
                          {formatMetricValue(rule.metric, ev.metric_value)}
                        </span>
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                        ev.delivered
                          ? "bg-green-500/10 text-green-400 border border-green-500/20"
                          : "bg-red-500/10 text-red-400 border border-red-500/20"
                      }`}>
                        {ev.delivered ? "delivered" : "failed"}
                      </span>
                    </div>
                    {ev.delivery_error && (
                      <p className="text-[10px] text-status-red mt-0.5 font-mono">{ev.delivery_error}</p>
                    )}
                  </div>
                  <span className="text-[10px] text-ink-muted shrink-0 font-mono whitespace-nowrap">
                    {formatDistanceToNow(new Date(ev.fired_at), { addSuffix: true })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CreateAlertModal({ onClose, projectId, slackConfig }: {
  onClose: () => void;
  projectId: string;
  slackConfig: { workspace_name?: string | null; channel_name?: string | null } | null | undefined;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    ...blank,
    destination: slackConfig ? "__project_slack__" : "",
  });

  const createRule = useMutation({
    mutationFn: () =>
      alertsApi.createRule({ ...form, project_id: projectId, enabled: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alert-rules"] });
      onClose();
    },
  });

  const applyPreset = (preset: typeof PRESETS[0]) => {
    setForm(f => ({
      ...f,
      name: preset.name,
      metric: preset.metric,
      operator: preset.operator,
      threshold: preset.threshold,
      window_minutes: preset.window_minutes,
    }));
  };

  const canSubmit = form.name.trim() && (
    form.channel === "slack"
      ? (!!slackConfig || !!form.destination)
      : !!form.destination
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-lg bg-dark-surface border border-dark-border rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-dark-divider">
          <div>
            <h3 className="text-sm font-semibold text-ink-primary">New Alert Rule</h3>
            <p className="text-xs text-ink-muted mt-0.5">Get notified when your agents misbehave</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-dark-raised text-ink-dim hover:text-ink-secondary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Presets */}
          <div>
            <p className="text-[11px] text-ink-muted mb-2 uppercase tracking-wider font-medium">Quick presets</p>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map(p => (
                <button
                  key={p.label}
                  onClick={() => applyPreset(p)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${
                    form.metric === p.metric && form.name === p.name
                      ? "bg-brand-500/15 border-brand-500/40 text-brand-300"
                      : "bg-dark-raised border-dark-border text-ink-secondary hover:border-brand-500/30 hover:text-ink-primary"
                  }`}
                >
                  <span>{p.emoji}</span>
                  <span>{p.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Rule name */}
          <div>
            <label className="form-label">Rule Name</label>
            <input
              className="input-dark"
              placeholder="e.g. High error rate alert"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            />
          </div>

          {/* Condition builder */}
          <div>
            <p className="text-[11px] text-ink-muted mb-2 uppercase tracking-wider font-medium">Condition</p>
            <div className="space-y-2">
              {/* Metric */}
              <div>
                <label className="form-label">Metric</label>
                <select
                  className="input-dark"
                  value={form.metric}
                  onChange={e => setForm(f => ({ ...f, metric: e.target.value }))}
                >
                  {METRICS.map(m => (
                    <option key={m.value} value={m.value}>{m.label} — {m.hint}</option>
                  ))}
                </select>
              </div>

              {/* Operator + Threshold in one row */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="form-label">Condition</label>
                  <select
                    className="input-dark"
                    value={form.operator}
                    onChange={e => setForm(f => ({ ...f, operator: e.target.value }))}
                  >
                    {OPERATORS.map(o => (
                      <option key={o.value} value={o.value}>{o.short} {o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label">
                    Threshold {metricUnit(form.metric) && <span className="text-ink-dim">({metricUnit(form.metric)})</span>}
                  </label>
                  <input
                    type="number"
                    className="input-dark"
                    value={form.threshold}
                    step={form.metric === "cost_per_session" ? 0.01 : 1}
                    onChange={e => setForm(f => ({ ...f, threshold: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
              </div>

              {/* Window */}
              <div>
                <label className="form-label">Time Window</label>
                <select
                  className="input-dark"
                  value={form.window_minutes}
                  onChange={e => setForm(f => ({ ...f, window_minutes: parseInt(e.target.value) }))}
                >
                  {WINDOWS.map(w => (
                    <option key={w.value} value={w.value}>{w.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Live condition preview */}
            <ConditionPreview
              metric={form.metric}
              operator={form.operator}
              threshold={form.threshold}
              window_minutes={form.window_minutes}
            />
          </div>

          {/* Notification channel */}
          <div>
            <p className="text-[11px] text-ink-muted mb-2 uppercase tracking-wider font-medium">Notify via</p>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {["slack", "email"].map(ch => (
                <button
                  key={ch}
                  onClick={() => {
                    const dest = ch === "slack" && slackConfig ? "__project_slack__" : "";
                    setForm(f => ({ ...f, channel: ch, destination: dest }));
                  }}
                  className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-xs font-medium transition-colors ${
                    form.channel === ch
                      ? "bg-brand-500/15 border-brand-500/40 text-brand-300"
                      : "bg-dark-raised border-dark-border text-ink-secondary hover:border-dark-border/80"
                  }`}
                >
                  {ch === "slack" ? (
                    <><span className="text-[#4A154B] bg-white rounded px-0.5 text-[10px] font-bold">#</span> Slack</>
                  ) : (
                    <><span>✉️</span> Email</>
                  )}
                </button>
              ))}
            </div>

            {form.channel === "slack" ? (
              slackConfig ? (
                <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-green-500/5 border border-green-500/20">
                  <div className="w-6 h-6 rounded-md bg-[#4A154B] flex items-center justify-center shrink-0">
                    <span className="text-white text-[10px] font-bold">#</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-green-300">
                      {slackConfig.workspace_name ?? "Slack"} connected
                      {slackConfig.channel_name ? ` · #${slackConfig.channel_name}` : ""}
                    </p>
                    <p className="text-[10px] text-ink-dim mt-0.5">Alerts will be sent to this workspace</p>
                  </div>
                  <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                </div>
              ) : (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-500/5 border border-amber-500/20">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-amber-300">No Slack workspace connected</p>
                    <p className="text-[11px] text-ink-dim mt-0.5">
                      <a href="/settings?section=slack" className="text-brand-400 hover:underline">Connect Slack in Settings</a> to enable Slack alerts.
                    </p>
                  </div>
                </div>
              )
            ) : (
              <div>
                <label className="form-label">Email Address</label>
                <input
                  className="input-dark"
                  placeholder="you@company.com"
                  value={form.destination}
                  onChange={e => setForm(f => ({ ...f, destination: e.target.value }))}
                />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 pb-5">
          <Button
            onClick={() => createRule.mutate()}
            disabled={!canSubmit}
            loading={createRule.isPending}
          >
            Create Rule
          </Button>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function AlertsPage() {
  const { selectedProject } = useProject();
  const PROJECT_ID = selectedProject?.id ?? "";
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [historyRule, setHistoryRule] = useState<AlertRule | null>(null);

  const { data: rules } = useQuery({
    queryKey: ["alert-rules", PROJECT_ID],
    queryFn: () => alertsApi.listRules(PROJECT_ID),
    enabled: !!PROJECT_ID,
  });

  const { data: slackConfig } = useQuery({
    queryKey: ["slack-config", PROJECT_ID],
    queryFn: () => projectsApi.getSlack(PROJECT_ID),
    enabled: !!PROJECT_ID,
    retry: false,
  });

  const { data: events } = useQuery({
    queryKey: ["alert-events", PROJECT_ID],
    queryFn: () => alertsApi.listEvents(PROJECT_ID),
    enabled: !!PROJECT_ID,
  });

  const deleteRule = useMutation({
    mutationFn: (id: string) => alertsApi.deleteRule(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alert-rules"] }),
  });

  const toggleRule = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      alertsApi.updateRule(id, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alert-rules"] }),
  });

  return (
    <>
      {/* Create modal */}
      {showCreate && (
        <CreateAlertModal
          onClose={() => setShowCreate(false)}
          projectId={PROJECT_ID}
          slackConfig={slackConfig}
        />
      )}

      {/* History modal */}
      {historyRule && (
        <RuleHistoryModal
          rule={historyRule}
          projectId={PROJECT_ID}
          onClose={() => setHistoryRule(null)}
        />
      )}

      <div className="space-y-5 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-ink-primary">Alerts</h1>
            <p className="text-xs text-ink-muted mt-0.5">
              {rules?.length ?? 0} rules configured · {events?.length ?? 0} events total
            </p>
          </div>
          <Button icon={<Plus />} onClick={() => setShowCreate(true)}>
            New Rule
          </Button>
        </div>

        {/* Rules list */}
        <Card title="Alert Rules">
          {!rules?.length ? (
            <EmptyState
              icon={<Bell />}
              title="No alert rules yet"
              description="Get notified when your agents misbehave — loops, errors, cost spikes, and more."
              action={
                <Button icon={<Plus />} onClick={() => setShowCreate(true)}>
                  Create first rule
                </Button>
              }
            />
          ) : (
            <div className="space-y-2">
              {rules.map(rule => {
                const ruleEvents = events?.filter(e => e.alert_rule_id === rule.id) ?? [];
                return (
                  <div
                    key={rule.id}
                    className="group flex items-center justify-between px-4 py-3.5 bg-dark-raised rounded-xl border border-dark-border hover:border-dark-border/80 transition-colors cursor-pointer"
                    onClick={() => setHistoryRule(rule)}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-ink-primary">{rule.name}</span>
                        {!rule.enabled && (
                          <span className="text-[10px] bg-dark-surface border border-dark-border text-ink-muted px-1.5 py-0.5 rounded-full">
                            disabled
                          </span>
                        )}
                        {ruleEvents.length > 0 && (
                          <span className="text-[10px] bg-amber-500/10 border border-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full">
                            {ruleEvents.length} fired
                          </span>
                        )}
                      </div>
                      {/* Human-readable condition */}
                      <p className="text-[11px] text-ink-muted mt-0.5">
                        {metricLabel(rule.metric)}{" "}
                        <span className="font-mono text-ink-dim">{operatorShort(rule.operator)} {rule.threshold}{metricUnit(rule.metric)}</span>
                        {" "}· last {windowLabel(rule.window_minutes)}
                        {" "}· via {rule.channel}
                      </p>
                      {rule.last_fired_at && (
                        <p className="text-[10px] text-amber-400/70 mt-0.5 flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          Last fired {formatDistanceToNow(new Date(rule.last_fired_at), { addSuffix: true })}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0 ml-3">
                      {/* History hint */}
                      <span className="text-[10px] text-ink-dim mr-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        View history
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-ink-dim opacity-0 group-hover:opacity-100 transition-opacity" />

                      {/* Toggle */}
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          toggleRule.mutate({ id: rule.id, enabled: !rule.enabled });
                        }}
                        className="text-ink-dim hover:text-ink-secondary transition-colors p-1"
                        title={rule.enabled ? "Disable" : "Enable"}
                      >
                        {rule.enabled
                          ? <ToggleRight className="w-5 h-5 text-brand-500" />
                          : <ToggleLeft className="w-5 h-5" />}
                      </button>

                      {/* Delete */}
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          if (confirm(`Delete "${rule.name}"?`)) deleteRule.mutate(rule.id);
                        }}
                        className="text-ink-dim hover:text-status-red transition-colors p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Recent alert history */}
        <Card title="Recent Alerts" subtitle="Last 50 fired events across all rules">
          {!events?.length ? (
            <EmptyState
              title="No alerts have fired yet"
              description="Events appear here when rules trigger. Click any rule above to see its history."
            />
          ) : (
            <div className="space-y-2">
              {events.map(ev => {
                const rule = rules?.find(r => r.id === ev.alert_rule_id);
                return (
                  <div
                    key={ev.id}
                    className="flex items-start gap-3 p-3 bg-dark-raised rounded-xl border border-dark-border text-xs cursor-pointer hover:border-dark-border/60 transition-colors"
                    onClick={() => rule && setHistoryRule(rule)}
                  >
                    {ev.delivered
                      ? <CheckCircle2 className="w-3.5 h-3.5 text-status-green mt-0.5 shrink-0" />
                      : <XCircle className="w-3.5 h-3.5 text-status-red mt-0.5 shrink-0" />
                    }
                    <div className="flex-1 min-w-0">
                      {rule && (
                        <p className="text-[10px] text-ink-dim font-medium mb-0.5">{rule.name}</p>
                      )}
                      <p className="text-ink-secondary leading-relaxed">
                        {rule
                          ? <>{metricLabel(rule.metric)} was <span className="font-mono text-ink-primary">{formatMetricValue(rule.metric, ev.metric_value)}</span> (threshold: {operatorShort(rule.operator)} {rule.threshold}{metricUnit(rule.metric)})</>
                          : ev.message
                        }
                      </p>
                      {ev.delivery_error && (
                        <p className="text-[10px] text-status-red mt-0.5 font-mono">{ev.delivery_error}</p>
                      )}
                    </div>
                    <span className="text-[11px] text-ink-muted shrink-0 font-mono whitespace-nowrap">
                      {formatDistanceToNow(new Date(ev.fired_at), { addSuffix: true })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
