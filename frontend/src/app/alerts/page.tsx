"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { alertsApi } from "@/lib/api";
import { Card, EmptyState } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatDistanceToNow } from "date-fns";
import {
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  CheckCircle2,
  XCircle,
  Bell,
  X,
} from "lucide-react";
import { useProject } from "@/lib/project-context";

const METRICS = [
  { value: "loop_detected",       label: "Loop Detected (count)" },
  { value: "tool_failure_rate",   label: "Tool Failure Rate (%)" },
  { value: "cost_per_session",    label: "Cost per Session ($)" },
  { value: "session_duration_ms", label: "Session Duration (ms)" },
  { value: "iteration_count",     label: "Max Iterations" },
  { value: "error_rate",          label: "Error Rate (%)" },
];

const OPERATORS = [
  { value: "gt",  label: ">" },
  { value: "gte", label: ">=" },
  { value: "lt",  label: "<" },
  { value: "lte", label: "<=" },
  { value: "eq",  label: "=" },
];

const blank = {
  name: "",
  metric: "loop_detected",
  operator: "gt",
  threshold: 0,
  window_minutes: 60,
  channel: "slack",
  destination: "",
};

export default function AlertsPage() {
  const { selectedProject } = useProject();
  const PROJECT_ID = selectedProject?.id ?? "";
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...blank });

  const { data: rules } = useQuery({
    queryKey: ["alert-rules", PROJECT_ID],
    queryFn: () => alertsApi.listRules(PROJECT_ID),
    enabled: !!PROJECT_ID,
  });

  const { data: events } = useQuery({
    queryKey: ["alert-events", PROJECT_ID],
    queryFn: () => alertsApi.listEvents(PROJECT_ID),
    enabled: !!PROJECT_ID,
  });

  const createRule = useMutation({
    mutationFn: () =>
      alertsApi.createRule({ ...form, project_id: PROJECT_ID, enabled: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alert-rules"] });
      setShowForm(false);
      setForm({ ...blank });
    },
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
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ink-primary">Alerts</h1>
          <p className="text-xs text-ink-muted mt-0.5">
            {rules?.length ?? 0} rules configured
          </p>
        </div>
        {!showForm && (
          <Button icon={<Plus />} onClick={() => setShowForm(true)}>
            New Rule
          </Button>
        )}
      </div>

      {/* Create form */}
      {showForm && (
        <Card
          title="New Alert Rule"
          action={
            <button
              onClick={() => { setShowForm(false); setForm({ ...blank }); }}
              className="text-ink-dim hover:text-ink-secondary transition-colors p-1 rounded-md hover:bg-dark-raised"
            >
              <X className="w-4 h-4" />
            </button>
          }
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="form-label">Rule Name</label>
              <input
                className="input-dark"
                placeholder="e.g. High loop rate alert"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="form-label">Metric</label>
              <select
                className="input-dark"
                value={form.metric}
                onChange={(e) => setForm((f) => ({ ...f, metric: e.target.value }))}
              >
                {METRICS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="form-label">Operator</label>
                <select
                  className="input-dark"
                  value={form.operator}
                  onChange={(e) => setForm((f) => ({ ...f, operator: e.target.value }))}
                >
                  {OPERATORS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Threshold</label>
                <input
                  type="number"
                  className="input-dark"
                  value={form.threshold}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, threshold: parseFloat(e.target.value) }))
                  }
                />
              </div>
            </div>
            <div>
              <label className="form-label">Window (minutes)</label>
              <input
                type="number"
                className="input-dark"
                value={form.window_minutes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, window_minutes: parseInt(e.target.value) }))
                }
              />
            </div>
            <div>
              <label className="form-label">Channel</label>
              <select
                className="input-dark"
                value={form.channel}
                onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))}
              >
                <option value="slack">Slack</option>
                <option value="email">Email</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="form-label">
                {form.channel === "slack" ? "Slack Webhook URL" : "Email Address"}
              </label>
              <input
                className="input-dark"
                placeholder={
                  form.channel === "slack"
                    ? "https://hooks.slack.com/services/..."
                    : "you@company.com"
                }
                value={form.destination}
                onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex gap-2 mt-5 pt-4 border-t border-dark-divider">
            <Button
              onClick={() => createRule.mutate()}
              disabled={!form.name || !form.destination}
              loading={createRule.isPending}
            >
              Create Rule
            </Button>
            <Button
              variant="secondary"
              onClick={() => { setShowForm(false); setForm({ ...blank }); }}
            >
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {/* Rules list */}
      <Card title="Alert Rules">
        {!rules?.length ? (
          <EmptyState
            icon={<Bell />}
            title="No alert rules yet"
            description="Get notified when your agents misbehave — loops, errors, cost spikes, and more."
            action={
              <Button icon={<Plus />} onClick={() => setShowForm(true)}>
                Create first rule
              </Button>
            }
          />
        ) : (
          <div className="space-y-2">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="flex items-center justify-between px-4 py-3.5 bg-dark-raised rounded-xl border border-dark-border hover:border-dark-border/80 transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink-primary">{rule.name}</span>
                    {!rule.enabled && (
                      <span className="text-[10px] bg-dark-surface border border-dark-border text-ink-muted px-1.5 py-0.5 rounded-full">
                        disabled
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-ink-muted mt-0.5 font-mono">
                    {rule.metric} {rule.operator} {rule.threshold} · {rule.window_minutes}
                    min · {rule.channel}
                  </p>
                  {rule.last_fired_at && (
                    <p className="text-[10px] text-amber-400/70 mt-0.5">
                      Last fired{" "}
                      {formatDistanceToNow(new Date(rule.last_fired_at), { addSuffix: true })}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-4">
                  <button
                    onClick={() =>
                      toggleRule.mutate({ id: rule.id, enabled: !rule.enabled })
                    }
                    className="text-ink-dim hover:text-ink-secondary transition-colors p-1"
                    title={rule.enabled ? "Disable" : "Enable"}
                  >
                    {rule.enabled ? (
                      <ToggleRight className="w-5 h-5 text-brand-500" />
                    ) : (
                      <ToggleLeft className="w-5 h-5" />
                    )}
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete "${rule.name}"?`)) deleteRule.mutate(rule.id);
                    }}
                    className="text-ink-dim hover:text-status-red transition-colors p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Alert history */}
      <Card title="Alert History" subtitle="Recent fired alerts">
        {!events?.length ? (
          <EmptyState
            title="No alerts have fired yet"
            description="Alerts will appear here when rules are triggered."
          />
        ) : (
          <div className="space-y-2">
            {events.map((e) => (
              <div
                key={e.id}
                className="flex items-start gap-3 p-3 bg-dark-raised rounded-xl border border-dark-border text-xs"
              >
                {e.delivered ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-status-green mt-0.5 shrink-0" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 text-status-red mt-0.5 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-ink-secondary leading-relaxed">{e.message}</p>
                  {e.delivery_error && (
                    <p className="text-[10px] text-status-red mt-0.5 font-mono">
                      {e.delivery_error}
                    </p>
                  )}
                </div>
                <span className="text-[11px] text-ink-muted shrink-0 font-mono">
                  {formatDistanceToNow(new Date(e.fired_at), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
