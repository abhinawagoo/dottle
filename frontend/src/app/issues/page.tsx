"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { issuesApi } from "@/lib/api";
import { IssueGroup, IssueSeverity } from "@/lib/types";
import { useProject } from "@/lib/project-context";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import {
  ShieldAlert, XCircle, AlertTriangle, AlertCircle,
  TrendingUp, Info, Users, Layers, Clock, ChevronRight,
  Zap, Filter,
} from "lucide-react";
import { EmptyState } from "@/components/ui/Card";

// ── Severity config ────────────────────────────────────────────────────────────

const SEVERITY: Record<IssueSeverity, {
  dot: string; badge: string; badgeBg: string; border: string;
  cardBg: string; cardHover: string; icon: React.ReactNode; label: string;
}> = {
  critical: {
    dot: "bg-red-500",
    badge: "text-red-400",
    badgeBg: "bg-red-500/10 border-red-500/25",
    border: "border-red-500/20",
    cardBg: "bg-[#1a0d0d]",
    cardHover: "hover:border-red-500/40",
    icon: <XCircle className="w-4 h-4" />,
    label: "CRITICAL",
  },
  high: {
    dot: "bg-orange-400",
    badge: "text-orange-400",
    badgeBg: "bg-orange-500/10 border-orange-500/25",
    border: "border-orange-500/20",
    cardBg: "bg-[#1a100a]",
    cardHover: "hover:border-orange-500/40",
    icon: <AlertTriangle className="w-4 h-4" />,
    label: "HIGH",
  },
  medium: {
    dot: "bg-amber-400",
    badge: "text-amber-400",
    badgeBg: "bg-amber-500/10 border-amber-500/25",
    border: "border-amber-500/20",
    cardBg: "bg-[#1a1500]",
    cardHover: "hover:border-amber-500/40",
    icon: <AlertCircle className="w-4 h-4" />,
    label: "MEDIUM",
  },
  low: {
    dot: "bg-sky-400",
    badge: "text-sky-400",
    badgeBg: "bg-sky-500/10 border-sky-500/25",
    border: "border-sky-500/20",
    cardBg: "bg-[#0a1520]",
    cardHover: "hover:border-sky-500/40",
    icon: <TrendingUp className="w-4 h-4" />,
    label: "LOW",
  },
  info: {
    dot: "bg-zinc-500",
    badge: "text-ink-muted",
    badgeBg: "bg-dark-raised border-dark-border",
    border: "border-dark-border",
    cardBg: "bg-dark-surface",
    cardHover: "hover:border-dark-divider",
    icon: <Info className="w-4 h-4" />,
    label: "INFO",
  },
};

const SEVERITY_ORDER: IssueSeverity[] = ["critical", "high", "medium", "low", "info"];

// ── Issue Card ─────────────────────────────────────────────────────────────────

function IssueCard({ group }: { group: IssueGroup }) {
  const cfg = SEVERITY[group.severity as IssueSeverity] ?? SEVERITY.info;

  return (
    <Link
      href={`/issues/${group.issue_type}`}
      className={`
        relative flex flex-col gap-4 p-5 rounded-2xl border transition-all duration-150 cursor-pointer
        ${cfg.cardBg} ${cfg.border} ${cfg.cardHover}
      `}
    >
      {/* Top row: severity dot + badge + source tag */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 mt-0.5 ${cfg.dot}`} />
          <span className={`text-[10px] font-bold uppercase tracking-widest ${cfg.badge}`}>
            {cfg.label}
          </span>
        </div>
        <span className="text-[9px] font-semibold uppercase tracking-wider text-ink-dim border border-dark-border bg-dark-raised px-1.5 py-0.5 rounded">
          {group.source}
        </span>
      </div>

      {/* Title */}
      <div>
        <h3 className="text-[13px] font-semibold text-ink-primary leading-snug">
          {group.title}
        </h3>
        <p className="text-[11px] text-ink-dim font-mono mt-0.5">{group.issue_type}</p>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 text-[11px] text-ink-muted">
          <Zap className="w-3 h-3 text-ink-dim" />
          <span className="font-semibold text-ink-secondary">{group.occurrence_count}</span>
          <span>occurrence{group.occurrence_count !== 1 ? "s" : ""}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-ink-muted">
          <Layers className="w-3 h-3 text-ink-dim" />
          <span className="font-semibold text-ink-secondary">{group.session_count}</span>
          <span>session{group.session_count !== 1 ? "s" : ""}</span>
        </div>
        {group.user_count > 0 && (
          <div className="flex items-center gap-1.5 text-[11px] text-ink-muted">
            <Users className="w-3 h-3 text-ink-dim" />
            <span className="font-semibold text-ink-secondary">{group.user_count}</span>
            <span>user{group.user_count !== 1 ? "s" : ""}</span>
          </div>
        )}
      </div>

      {/* Agent names */}
      {group.agent_names.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {group.agent_names.slice(0, 3).map((name) => (
            <span
              key={name}
              className="text-[10px] font-mono text-ink-dim bg-dark-raised border border-dark-border px-1.5 py-0.5 rounded"
            >
              {name}
            </span>
          ))}
          {group.agent_names.length > 3 && (
            <span className="text-[10px] text-ink-dim">+{group.agent_names.length - 3} more</span>
          )}
        </div>
      )}

      {/* Footer: last seen + arrow */}
      <div className="flex items-center justify-between mt-auto pt-1 border-t border-white/5">
        <div className="flex items-center gap-1 text-[10px] text-ink-dim">
          <Clock className="w-3 h-3" />
          {formatDistanceToNow(new Date(group.last_seen), { addSuffix: true })}
        </div>
        <ChevronRight className="w-3.5 h-3.5 text-ink-dim" />
      </div>
    </Link>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

const SEVERITY_FILTERS = [
  { label: "All", value: "" },
  { label: "Critical", value: "critical" },
  { label: "High", value: "high" },
  { label: "Medium", value: "medium" },
  { label: "Low", value: "low" },
  { label: "Info", value: "info" },
];

export default function IssuesPage() {
  const { selectedProject } = useProject();
  const PROJECT_ID = selectedProject?.id ?? "";
  const [severityFilter, setSeverityFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["issues", PROJECT_ID, severityFilter],
    queryFn: () =>
      issuesApi.list({
        project_id: PROJECT_ID,
        severity: severityFilter || undefined,
      }),
    enabled: !!PROJECT_ID,
    refetchInterval: 30_000,
  });

  // Sort by severity order, then by occurrence count
  const groups = [...(data?.groups ?? [])].sort((a, b) => {
    const ai = SEVERITY_ORDER.indexOf(a.severity as IssueSeverity);
    const bi = SEVERITY_ORDER.indexOf(b.severity as IssueSeverity);
    if (ai !== bi) return ai - bi;
    return b.occurrence_count - a.occurrence_count;
  });

  return (
    <div className="space-y-5 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold text-ink-primary">Issues</h1>
          <p className="text-xs text-ink-muted mt-0.5">
            {data
              ? `${data.total_signals} signal${data.total_signals !== 1 ? "s" : ""} auto-detected from sessions · last 30 days`
              : "Auto-detected behavioral signals across all agent sessions"}
          </p>
        </div>

        {/* Severity filter tabs */}
        <div className="flex items-center gap-1 bg-dark-raised border border-dark-border rounded-xl p-1">
          {SEVERITY_FILTERS.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setSeverityFilter(value)}
              className={`
                px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all
                ${severityFilter === value
                  ? "bg-dark-bg text-ink-primary shadow-sm"
                  : "text-ink-muted hover:text-ink-secondary"}
              `}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="shimmer h-52 rounded-2xl" />
          ))}
        </div>
      ) : !PROJECT_ID ? (
        <EmptyState
          icon={<ShieldAlert />}
          title="No project selected"
          description="Select a project to see detected issues."
        />
      ) : !groups.length ? (
        <EmptyState
          icon={<ShieldAlert />}
          title="No issues detected"
          description={
            severityFilter
              ? `No ${severityFilter} issues in the last 30 days. Try a different filter.`
              : "No behavioral issues detected yet. Run some agent sessions to start monitoring."
          }
        />
      ) : (
        <>
          {/* Summary stats bar */}
          <div className="flex items-center gap-6 flex-wrap">
            {SEVERITY_ORDER.filter(s => groups.some(g => g.severity === s)).map((sev) => {
              const count = groups.filter(g => g.severity === sev).length;
              const cfg = SEVERITY[sev];
              return (
                <button
                  key={sev}
                  onClick={() => setSeverityFilter(sev === severityFilter ? "" : sev)}
                  className="flex items-center gap-1.5 text-[11px] group"
                >
                  <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                  <span className={`font-semibold ${sev === severityFilter ? cfg.badge : "text-ink-muted"} group-hover:${cfg.badge} transition-colors`}>
                    {count} {sev}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Issue cards grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {groups.map((group) => (
              <IssueCard key={group.issue_type} group={group} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
