"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import {
  Activity, BarChart2, Bell, Layers, Settings, Zap, ShieldAlert,
  Sun, Moon, LogOut, HelpCircle, Users, Wrench, FlaskConical,
  GitCompare, Wand2, Tag, Bot, Database, Monitor,
  PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import InstrumentWizard from "@/components/onboarding/InstrumentWizard";
import { useProject } from "@/lib/project-context";
import { clsx } from "clsx";
import { useTheme } from "@/lib/use-theme";
import { useAuth } from "@/lib/auth-context";

const NAV = [
  { href: "/",         label: "Dashboard",   icon: Activity    },
  { href: "/sessions", label: "Sessions",    icon: Layers      },
  { href: "/users",    label: "Users",       icon: Users       },
  { href: "/issues",   label: "Issues",      icon: ShieldAlert },
  { href: "/monitor",  label: "Monitor",     icon: Monitor     },
  { href: "/metrics",  label: "Metrics",     icon: BarChart2   },
  { href: "/alerts",   label: "Alerts",      icon: Bell        },
  { href: "/fix",      label: "Code Fixes",  icon: Wrench      },
];

const NAV_BOTTOM = [
  { href: "/prompts",          label: "Prompts",     icon: Tag        },
  { href: "/evals",            label: "Evaluators",  icon: Bot        },
  { href: "/datasets",         label: "Datasets",    icon: Database   },
  { href: "/sessions/compare", label: "Compare",     icon: GitCompare },
  { href: "/experiments",      label: "Experiments", icon: FlaskConical, badge: "soon" as const },
];

function NavItem({ href, label, icon: Icon, active, badge, collapsed }: {
  href: string; label: string; icon: React.ElementType;
  active: boolean; badge?: string; collapsed: boolean;
}) {
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={clsx(
        "flex items-center rounded-lg text-[13px] font-medium transition-all duration-100",
        collapsed ? "justify-center py-2 w-9 mx-auto" : "gap-2.5 px-3 py-2",
        active
          ? "bg-dark-raised text-ink-primary"
          : "text-ink-muted hover:text-ink-secondary hover:bg-dark-raised/60"
      )}
    >
      <Icon className={clsx("w-4 h-4 shrink-0", active ? "text-brand-400" : "text-ink-dim")} />
      {!collapsed && <span className="flex-1">{label}</span>}
      {!collapsed && badge && (
        <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-brand-500/15 text-brand-400 border border-brand-500/20">
          {badge}
        </span>
      )}
    </Link>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const { user, logout } = useAuth();
  const { selectedProject } = useProject();
  const router = useRouter();
  const [showWizard, setShowWizard] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("dottle_sidebar_collapsed") === "true";
    }
    return false;
  });

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("dottle_sidebar_collapsed", String(next));
  }

  function handleLogout() {
    logout();
    router.push("/login");
  }

  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() ?? "?";

  return (
    <>
    <aside className={clsx(
      "h-full bg-dark-surface border-r border-dark-border flex flex-col shrink-0 transition-all duration-200 overflow-hidden",
      collapsed ? "w-[52px]" : "w-[200px]"
    )}>

      {/* Logo + collapse toggle */}
      <div className={clsx(
        "flex items-center h-12 border-b border-dark-border shrink-0 gap-2",
        collapsed ? "justify-center px-0" : "px-3"
      )}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-6 h-6 rounded-md bg-brand-600 flex items-center justify-center shrink-0">
            <Zap className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
          </div>
          {!collapsed && (
            <span className="text-[13px] font-semibold tracking-tight text-ink-primary truncate">dottle</span>
          )}
        </div>
        <button
          onClick={toggleCollapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={clsx(
            "p-1.5 rounded-lg text-ink-dim hover:text-ink-muted hover:bg-dark-raised/60 transition-all shrink-0",
            collapsed && "mx-auto"
          )}
        >
          {collapsed
            ? <PanelLeftOpen className="w-3.5 h-3.5" />
            : <PanelLeftClose className="w-3.5 h-3.5" />
          }
        </button>
      </div>

      {/* Main navigation */}
      <nav className={clsx("flex-1 pt-3 space-y-0.5 overflow-y-auto", collapsed ? "px-1" : "px-2")}>
        {NAV.map(({ href, label, icon }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(href));
          return <NavItem key={href} href={href} label={label} icon={icon} active={active} collapsed={collapsed} />;
        })}

        {/* Divider */}
        <div className="h-px bg-dark-divider my-2 mx-1" />

        {NAV_BOTTOM.map(({ href, label, icon, badge }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(href));
          return <NavItem key={href} href={href} label={label} icon={icon} active={active} badge={badge} collapsed={collapsed} />;
        })}
      </nav>

      {/* Footer */}
      <div className={clsx("py-3 border-t border-dark-border space-y-0.5 shrink-0", collapsed ? "px-1" : "px-2")}>

        {/* Auto-Instrument */}
        <button
          onClick={() => setShowWizard(true)}
          title={collapsed ? "Auto-Instrument" : undefined}
          className={clsx(
            "w-full flex items-center rounded-lg text-[13px] font-medium text-brand-400 hover:text-brand-300 hover:bg-brand-500/10 transition-all",
            collapsed ? "justify-center py-2 w-9 mx-auto" : "gap-2.5 px-3 py-2"
          )}
        >
          <Wand2 className="w-4 h-4 shrink-0" />
          {!collapsed && "Auto-Instrument"}
        </button>

        {/* Support */}
        <a
          href="mailto:support@dottle.dev"
          title={collapsed ? "Support" : undefined}
          className={clsx(
            "flex items-center rounded-lg text-[13px] font-medium text-ink-muted hover:text-ink-secondary hover:bg-dark-raised/60 transition-all",
            collapsed ? "justify-center py-2 w-9 mx-auto" : "gap-2.5 px-3 py-2"
          )}
        >
          <HelpCircle className="w-4 h-4 text-ink-dim shrink-0" />
          {!collapsed && "Support"}
        </a>

        {/* Settings */}
        <NavItem
          href="/settings"
          label="Settings"
          icon={Settings}
          active={pathname.startsWith("/settings")}
          collapsed={collapsed}
        />

        {/* Theme toggle */}
        <button
          onClick={toggle}
          title={collapsed ? (theme === "dark" ? "Light mode" : "Dark mode") : undefined}
          className={clsx(
            "w-full flex items-center rounded-lg text-[13px] font-medium text-ink-muted hover:text-ink-secondary hover:bg-dark-raised/60 transition-all",
            collapsed ? "justify-center py-2 w-9 mx-auto" : "gap-2.5 px-3 py-2"
          )}
        >
          {theme === "dark"
            ? <Sun className="w-4 h-4 text-ink-dim shrink-0" />
            : <Moon className="w-4 h-4 text-ink-dim shrink-0" />
          }
          {!collapsed && (theme === "dark" ? "Light mode" : "Dark mode")}
        </button>

        {/* Divider */}
        <div className="h-px bg-dark-divider my-1 mx-1" />

        {/* User + logout */}
        <div className={clsx(
          "flex items-center gap-2 py-2",
          collapsed ? "justify-center px-0" : "px-3"
        )}>
          {!collapsed && (
            <>
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-5 h-5 rounded-full bg-brand-600 flex items-center justify-center text-[9px] font-bold text-white shrink-0">
                  {initials}
                </div>
              )}
              <span className="text-[12px] text-ink-secondary truncate flex-1 min-w-0">
                {user?.name ?? user?.email}
              </span>
            </>
          )}
          <button
            onClick={handleLogout}
            title="Sign out"
            className="text-ink-dim hover:text-status-red transition-colors shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>

    {showWizard && (
      <InstrumentWizard
        apiKey={selectedProject?.api_key ?? ""}
        onClose={() => setShowWizard(false)}
      />
    )}
    </>
  );
}
