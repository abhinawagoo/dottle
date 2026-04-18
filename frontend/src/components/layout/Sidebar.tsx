"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BarChart2, Bell, Layers, Settings, Zap, ShieldAlert } from "lucide-react";
import { clsx } from "clsx";

const NAV = [
  { href: "/",         label: "Dashboard",  icon: Activity },
  { href: "/sessions", label: "Sessions",   icon: Layers },
  { href: "/issues",   label: "Issues",     icon: ShieldAlert },
  { href: "/metrics",  label: "Metrics",    icon: BarChart2 },
  { href: "/alerts",   label: "Alerts",     icon: Bell },
];

function NavItem({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={clsx(
        "relative flex items-center gap-2.5 px-3 py-[7px] rounded-lg text-[13px] font-medium transition-all duration-100",
        active
          ? "bg-dark-raised text-ink-primary"
          : "text-ink-muted hover:text-ink-secondary hover:bg-dark-raised/40"
      )}
    >
      {/* Left accent bar */}
      {active && (
        <span className="absolute left-0 top-[7px] bottom-[7px] w-[3px] bg-brand-500 rounded-full" />
      )}
      <Icon
        className={clsx(
          "w-4 h-4 shrink-0 transition-colors",
          active ? "text-brand-400" : "text-ink-dim"
        )}
      />
      {label}
    </Link>
  );
}

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-[220px] h-full bg-[#0d0d0f] border-r border-dark-border flex flex-col shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 h-14 border-b border-dark-border shrink-0">
        <div className="w-6 h-6 rounded-md bg-brand-600 flex items-center justify-center shrink-0 shadow-sm">
          <Zap className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
        </div>
        <span className="text-[13px] font-semibold tracking-tight text-ink-primary">
          dottle
        </span>
      </div>

      {/* Section label */}
      <div className="px-5 pt-5 pb-1.5">
        <p className="text-[10px] font-semibold text-ink-dim uppercase tracking-widest">
          Monitor
        </p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto">
        {NAV.map(({ href, label, icon }) => {
          const active =
            pathname === href || (href !== "/" && pathname.startsWith(href));
          return (
            <NavItem key={href} href={href} label={label} icon={icon} active={active} />
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-2 py-3 border-t border-dark-border space-y-0.5 shrink-0">
        <NavItem
          href="/settings"
          label="Settings"
          icon={Settings}
          active={pathname === "/settings"}
        />
        <div className="flex items-center justify-between px-3 pt-2">
          <p className="text-[10px] text-ink-dim font-mono">v0.1.0</p>
          <span className="text-[9px] font-semibold text-brand-500/70 bg-brand-500/10 border border-brand-500/20 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
            Beta
          </span>
        </div>
      </div>
    </aside>
  );
}
