import { clsx } from "clsx";
import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  loading,
  icon,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all duration-100 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 select-none";

  const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
    primary: "bg-brand-600 hover:bg-brand-700 active:bg-brand-700 text-white shadow-sm",
    secondary:
      "bg-dark-raised hover:bg-dark-border text-ink-secondary hover:text-ink-primary border border-dark-border",
    ghost: "text-ink-muted hover:text-ink-primary hover:bg-dark-raised/60",
    danger:
      "bg-status-red/10 hover:bg-status-red/20 text-status-red border border-status-red/20",
  };

  const sizes: Record<NonNullable<ButtonProps["size"]>, string> = {
    sm: "text-[11px] px-2.5 py-1.5",
    md: "text-xs px-4 py-2",
    lg: "text-sm px-5 py-2.5",
  };

  return (
    <button
      className={clsx(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        icon && <span className="shrink-0 [&_svg]:w-3.5 [&_svg]:h-3.5">{icon}</span>
      )}
      {children}
    </button>
  );
}
