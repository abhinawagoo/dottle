import { clsx } from "clsx";
import type { ReactNode } from "react";

interface CardProps {
  title?: string | ReactNode;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Card({ title, subtitle, action, children, className }: CardProps) {
  return (
    <div
      className={clsx(
        "bg-dark-surface rounded-xl border border-dark-border shadow-card overflow-hidden",
        className
      )}
    >
      {(title || subtitle || action) && (
        <div className="px-5 py-3.5 border-b border-dark-divider flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-3 min-w-0">
            {title && (
              <h3 className="text-sm font-semibold text-ink-primary shrink-0">{title}</h3>
            )}
            {subtitle && (
              <p className="text-xs text-ink-muted truncate">{subtitle}</p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

/* ─── StatCard ─────────────────────────────────────────────────────────────── */

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  color?: "default" | "red" | "green" | "orange" | "purple";
  icon?: ReactNode;
  trend?: { value: number; label?: string };
}

const COLOR_MAP: Record<NonNullable<StatCardProps["color"]>, string> = {
  default: "text-ink-primary",
  red:     "text-status-red",
  green:   "text-status-green",
  orange:  "text-status-amber",
  purple:  "text-brand-400",
};

export function StatCard({ label, value, sub, color = "default", icon, trend }: StatCardProps) {
  return (
    <div className="bg-dark-surface rounded-xl border border-dark-border shadow-card p-5 flex flex-col gap-1.5 min-w-0">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold text-ink-muted uppercase tracking-widest leading-none">
          {label}
        </p>
        {icon && <span className="text-ink-dim [&_svg]:w-3.5 [&_svg]:h-3.5">{icon}</span>}
      </div>
      <p className={clsx("text-2xl font-bold tabular-nums leading-none mt-0.5", COLOR_MAP[color])}>
        {value}
      </p>
      {(sub || trend) && (
        <div className="flex items-center gap-2 mt-0.5">
          {sub && <p className="text-[11px] text-ink-muted">{sub}</p>}
          {trend && (
            <span
              className={clsx(
                "text-[10px] font-semibold tabular-nums",
                trend.value >= 0 ? "text-status-green" : "text-status-red"
              )}
            >
              {trend.value >= 0 ? "↑" : "↓"} {Math.abs(trend.value)}%
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── EmptyState ────────────────────────────────────────────────────────────── */

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
      {icon && (
        <div className="w-10 h-10 rounded-xl bg-dark-raised border border-dark-border flex items-center justify-center mb-4 [&_svg]:w-5 [&_svg]:h-5 [&_svg]:text-ink-dim">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-ink-secondary">{title}</p>
      {description && (
        <p className="text-xs text-ink-muted mt-1.5 max-w-xs leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
