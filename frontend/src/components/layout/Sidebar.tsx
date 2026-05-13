"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity, BarChart2, Bell, Layers, Settings, ShieldAlert,
  Sun, Moon, LogOut, HelpCircle, Users, Wrench, FlaskConical,
  GitCompare, Wand2, Tag, Bot, Database, Monitor, Brain,
  PanelLeftClose, GripVertical,
} from "lucide-react";
import InstrumentWizard from "@/components/onboarding/InstrumentWizard";
import DottleLogo from "@/components/dottle-logo";
import { useProject } from "@/lib/project-context";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/use-theme";
import { useAuth } from "@/lib/auth-context";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";

const NAV = [
  { href: "/",         label: "Dashboard",   icon: Activity    },
  { href: "/sessions", label: "Sessions",    icon: Layers      },
  { href: "/users",    label: "Users",       icon: Users       },
  { href: "/issues",   label: "Issues",      icon: ShieldAlert },
  { href: "/monitor",  label: "Monitor",     icon: Monitor     },
  { href: "/metrics",  label: "Metrics",     icon: BarChart2   },
  { href: "/alerts",   label: "Alerts",      icon: Bell        },
  { href: "/monitors", label: "Monitors",    icon: Brain       },
  { href: "/fix",      label: "Code Fixes",  icon: Wrench      },
];

const NAV_BOTTOM = [
  { href: "/prompts",          label: "Prompts",     icon: Tag        },
  { href: "/evals",            label: "Evaluators",  icon: Bot        },
  { href: "/datasets",         label: "Datasets",    icon: Database   },
  { href: "/sessions/compare", label: "Compare",     icon: GitCompare },
  { href: "/experiments",      label: "Experiments", icon: FlaskConical },
];

const MIN_WIDTH = 52;
const MAX_WIDTH = 320;
const COLLAPSED_WIDTH = 52;
const DEFAULT_WIDTH = 200;

function NavItem({ href, label, icon: Icon, active, badge, collapsed }: {
  href: string; label: string; icon: React.ElementType;
  active: boolean; badge?: string; collapsed: boolean;
}) {
  const item = (
    <Link
      href={href}
      className={cn(
        "flex items-center rounded-lg text-[13px] font-medium transition-all duration-100",
        collapsed ? "justify-center py-2 w-9 mx-auto" : "gap-2.5 px-3 py-2",
        active
          ? "bg-dark-raised text-ink-primary"
          : "text-ink-muted hover:text-ink-secondary hover:bg-dark-raised/60"
      )}
    >
      <Icon className={cn("w-4 h-4 shrink-0", active ? "text-brand-400" : "text-ink-dim")} />
      {!collapsed && <span className="flex-1 truncate">{label}</span>}
      {!collapsed && badge && (
        <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-brand-500/15 text-brand-400 border border-brand-500/20">
          {badge}
        </span>
      )}
    </Link>
  );

  if (!collapsed) return item;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{item}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const { user, logout } = useAuth();
  const { selectedProject } = useProject();
  const router = useRouter();
  const [showWizard, setShowWizard] = useState(false);

  // Width state — persisted to localStorage
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_WIDTH;
    const stored = localStorage.getItem("dottle_sidebar_width");
    if (stored) return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, parseInt(stored, 10)));
    const collapsed = localStorage.getItem("dottle_sidebar_collapsed");
    return collapsed === "true" ? COLLAPSED_WIDTH : DEFAULT_WIDTH;
  });

  const collapsed = width <= COLLAPSED_WIDTH;

  // Drag-to-resize
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const sidebarRef = useRef<HTMLElement>(null);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = width;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [width]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = e.clientX - startX.current;
      const next = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth.current + delta));
      setWidth(next);
    };
    const onMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      // Snap to collapsed if dragged very narrow
      setWidth(prev => {
        const snapped = prev < 100 ? COLLAPSED_WIDTH : prev;
        localStorage.setItem("dottle_sidebar_width", String(snapped));
        localStorage.setItem("dottle_sidebar_collapsed", String(snapped <= COLLAPSED_WIDTH));
        return snapped;
      });
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  function toggleCollapsed() {
    const next = collapsed ? DEFAULT_WIDTH : COLLAPSED_WIDTH;
    setWidth(next);
    localStorage.setItem("dottle_sidebar_width", String(next));
    localStorage.setItem("dottle_sidebar_collapsed", String(next <= COLLAPSED_WIDTH));
  }

  function handleLogout() {
    logout();
    router.push("/login");
  }

  const initials = user?.name
    ? user.name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() ?? "?";

  return (
    <TooltipProvider delayDuration={300}>
      <>
        <aside
          ref={sidebarRef}
          style={{ width }}
          className="h-full bg-dark-surface border-r border-dark-border flex flex-col shrink-0 overflow-hidden relative select-none"
        >
          {/* Logo + collapse toggle */}
          <div className={cn(
            "flex items-center h-14 border-b border-dark-border shrink-0",
            collapsed ? "justify-center px-0" : "px-3 gap-2"
          )}>
            {collapsed ? (
              /* Collapsed: same centering as nav icons — w-9 mx-auto */
              <button
                onClick={toggleCollapsed}
                title="Expand sidebar"
                className="w-9 flex items-center justify-center rounded-lg hover:bg-dark-raised/60 transition-all"
              >
                <DottleLogo size={22} showText={false} />
              </button>
            ) : (
              /* Expanded: logo + collapse button */
              <>
                <div className="flex items-center flex-1 min-w-0">
                  <DottleLogo size={30} showText={true} />
                </div>
                <button
                  onClick={toggleCollapsed}
                  title="Collapse sidebar"
                  className="p-1.5 rounded-lg text-ink-dim hover:text-ink-muted hover:bg-dark-raised/60 transition-all shrink-0"
                >
                  <PanelLeftClose className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>

          {/* Main navigation */}
          <nav className={cn("flex-1 pt-3 space-y-0.5 overflow-y-auto", collapsed ? "px-1" : "px-2")}>
            {NAV.map(({ href, label, icon }) => {
              const active = pathname === href || (href !== "/" && pathname.startsWith(href));
              return <NavItem key={href} href={href} label={label} icon={icon} active={active} collapsed={collapsed} />;
            })}

            <Separator className="my-2 mx-1" />

            {NAV_BOTTOM.map(({ href, label, icon }) => {
              const active = pathname === href || (href !== "/" && pathname.startsWith(href));
              return <NavItem key={href} href={href} label={label} icon={icon} active={active} collapsed={collapsed} />;
            })}
          </nav>

          {/* Footer */}
          <div className={cn("py-3 border-t border-dark-border space-y-0.5 shrink-0", collapsed ? "px-1" : "px-2")}>

            {/* Auto-Instrument */}
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setShowWizard(true)}
                    className="w-9 mx-auto flex items-center justify-center py-2 rounded-lg text-brand-400 hover:text-brand-300 hover:bg-brand-500/10 transition-all"
                  >
                    <Wand2 className="w-4 h-4 shrink-0" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Auto-Instrument</TooltipContent>
              </Tooltip>
            ) : (
              <button
                onClick={() => setShowWizard(true)}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-brand-400 hover:text-brand-300 hover:bg-brand-500/10 transition-all"
              >
                <Wand2 className="w-4 h-4 shrink-0" />
                Auto-Instrument
              </button>
            )}

            {/* Support */}
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    href="mailto:support@dottle.dev"
                    className="w-9 mx-auto flex items-center justify-center py-2 rounded-lg text-ink-dim hover:text-ink-muted hover:bg-dark-raised/60 transition-all"
                  >
                    <HelpCircle className="w-4 h-4" />
                  </a>
                </TooltipTrigger>
                <TooltipContent side="right">Support</TooltipContent>
              </Tooltip>
            ) : (
              <a
                href="mailto:support@dottle.dev"
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-ink-muted hover:text-ink-secondary hover:bg-dark-raised/60 transition-all"
              >
                <HelpCircle className="w-4 h-4 text-ink-dim shrink-0" />
                Support
              </a>
            )}

            {/* Settings */}
            <NavItem
              href="/settings"
              label="Settings"
              icon={Settings}
              active={pathname.startsWith("/settings")}
              collapsed={collapsed}
            />

            {/* Theme toggle */}
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={toggle}
                    className="w-9 mx-auto flex items-center justify-center py-2 rounded-lg text-ink-dim hover:text-ink-muted hover:bg-dark-raised/60 transition-all"
                  >
                    {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">{theme === "dark" ? "Light mode" : "Dark mode"}</TooltipContent>
              </Tooltip>
            ) : (
              <button
                onClick={toggle}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-ink-muted hover:text-ink-secondary hover:bg-dark-raised/60 transition-all"
              >
                {theme === "dark"
                  ? <Sun className="w-4 h-4 text-ink-dim shrink-0" />
                  : <Moon className="w-4 h-4 text-ink-dim shrink-0" />
                }
                {theme === "dark" ? "Light mode" : "Dark mode"}
              </button>
            )}

            <Separator className="my-1 mx-1" />

            {/* User + logout */}
            <div className={cn(
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
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleLogout}
                    title="Sign out"
                    className="text-ink-dim hover:text-status-red transition-colors shrink-0"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Sign out</TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Drag handle — right edge */}
          <div
            onMouseDown={onMouseDown}
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize group flex items-center justify-center z-10 hover:bg-brand-400/20 transition-colors"
            title="Drag to resize"
          >
            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
              <GripVertical className="w-3 h-3 text-brand-400" />
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
    </TooltipProvider>
  );
}
