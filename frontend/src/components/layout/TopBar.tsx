"use client";
import { RefreshCw, ChevronDown, FolderOpen, Plus, Building2, LogOut, User, Check, Bell } from "lucide-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { useProject } from "@/lib/project-context";
import { useOrg } from "@/lib/org-context";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { alertsApi } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";

export default function TopBar() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { orgs, selectedOrg, setSelectedOrg } = useOrg();
  const { projects, selectedProject, setSelectedProject } = useProject();

  const [refreshing, setRefreshing] = useState(false);
  const [orgOpen, setOrgOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const orgRef = useRef<HTMLDivElement>(null);
  const projectRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  // Recent alert events (poll every 60s)
  const projectId = selectedProject?.id ?? "";
  const { data: alertEvents = [] } = useQuery({
    queryKey: ["alert-events", projectId],
    queryFn: () => alertsApi.listEvents(projectId),
    enabled: !!projectId,
    refetchInterval: 60_000,
  });

  // "Unread" = events fired after the last time the bell was opened
  const STORAGE_KEY = `notif-last-seen-${projectId}`;
  const getLastSeen = () => {
    if (typeof window === "undefined") return null;
    const v = localStorage.getItem(STORAGE_KEY);
    return v ? new Date(v) : null;
  };
  const markRead = () => {
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, new Date().toISOString());
  };

  const lastSeen = getLastSeen();
  const unreadCount = alertEvents.filter(
    (e) => !lastSeen || new Date(e.fired_at) > lastSeen
  ).length;

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (orgRef.current && !orgRef.current.contains(e.target as Node)) setOrgOpen(false);
      if (projectRef.current && !projectRef.current.contains(e.target as Node)) setProjectOpen(false);
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries();
    setTimeout(() => setRefreshing(false), 600);
  };

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() ?? "?";

  return (
    <header className="h-11 bg-dark-surface border-b border-dark-border flex items-center justify-between px-5 shrink-0 gap-3">

      {/* Left: Org switcher > Project switcher */}
      <div className="flex items-center gap-1 min-w-0">

        {/* ── Org switcher ── */}
        <div className="relative" ref={orgRef}>
          <button
            onClick={() => { setOrgOpen((o) => !o); setProjectOpen(false); }}
            className="flex items-center gap-1.5 text-xs text-ink-secondary hover:text-ink-primary transition-colors py-1 px-2 rounded-lg hover:bg-dark-raised"
          >
            <Building2 className="w-3.5 h-3.5 text-ink-dim shrink-0" />
            <span className="font-medium truncate max-w-[100px]">
              {selectedOrg?.name ?? "No org"}
            </span>
            <ChevronDown className="w-3 h-3 text-ink-dim shrink-0" />
          </button>

          {orgOpen && (
            <div className="absolute top-full left-0 mt-1.5 w-56 bg-dark-surface border border-dark-border rounded-xl shadow-card overflow-hidden z-50">
              <div className="px-3 py-2 border-b border-dark-divider">
                <p className="text-[10px] font-semibold text-ink-dim uppercase tracking-widest">Organizations</p>
              </div>
              {orgs.length === 0 ? (
                <div className="px-3 py-3 text-xs text-ink-muted text-center">No orgs yet</div>
              ) : (
                <div className="py-1">
                  {orgs.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => {
                        setSelectedOrg(o);
                        setOrgOpen(false);
                        queryClient.invalidateQueries();
                      }}
                      className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 hover:bg-dark-raised transition-colors ${selectedOrg?.id === o.id ? "text-brand-400" : "text-ink-secondary"}`}
                    >
                      <span className="font-medium truncate">{o.name}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] text-ink-dim">{o.role}</span>
                        {selectedOrg?.id === o.id && <Check className="w-3 h-3 text-brand-500" />}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <div className="border-t border-dark-divider">
                <Link
                  href="/settings?tab=orgs"
                  onClick={() => setOrgOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-xs text-ink-muted hover:text-ink-secondary hover:bg-dark-raised transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  New organization
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Separator */}
        <span className="text-ink-dim text-xs">/</span>

        {/* ── Project switcher ── */}
        <div className="relative" ref={projectRef}>
          <button
            onClick={() => { setProjectOpen((o) => !o); setOrgOpen(false); }}
            className="flex items-center gap-1.5 text-xs text-ink-secondary hover:text-ink-primary transition-colors py-1 px-2 rounded-lg hover:bg-dark-raised"
          >
            <FolderOpen className="w-3.5 h-3.5 text-ink-dim shrink-0" />
            <span className="font-medium truncate max-w-[120px]">
              {selectedProject?.name ?? "No project"}
            </span>
            <ChevronDown className="w-3 h-3 text-ink-dim shrink-0" />
          </button>

          {projectOpen && (
            <div className="absolute top-full left-0 mt-1.5 w-56 bg-dark-surface border border-dark-border rounded-xl shadow-card overflow-hidden z-50">
              <div className="px-3 py-2 border-b border-dark-divider">
                <p className="text-[10px] font-semibold text-ink-dim uppercase tracking-widest">Projects</p>
              </div>
              {projects.length === 0 ? (
                <div className="px-3 py-3 text-xs text-ink-muted text-center">No projects yet</div>
              ) : (
                <div className="py-1">
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSelectedProject(p);
                        setProjectOpen(false);
                        queryClient.invalidateQueries();
                      }}
                      className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 hover:bg-dark-raised transition-colors ${selectedProject?.id === p.id ? "text-brand-400" : "text-ink-secondary"}`}
                    >
                      <span className="font-medium truncate">{p.name}</span>
                      {selectedProject?.id === p.id && <Check className="w-3 h-3 text-brand-500 shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
              <div className="border-t border-dark-divider">
                <Link
                  href="/settings"
                  onClick={() => setProjectOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-xs text-ink-muted hover:text-ink-secondary hover:bg-dark-raised transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  New project
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right: live indicator + refresh + user */}
      <div className="flex items-center gap-4 shrink-0">
        <button
          onClick={handleRefresh}
          className="flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink-secondary transition-colors"
        >
          <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>

        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-status-green animate-pulse" />
          <span className="text-[11px] text-ink-muted">live</span>
        </div>

        {/* ── Notification bell ── */}
        {projectId && (
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => {
                setNotifOpen((o) => !o);
                if (!notifOpen) markRead();
              }}
              className="relative flex items-center justify-center w-7 h-7 rounded-lg text-ink-muted hover:text-ink-secondary hover:bg-dark-raised transition-colors"
              title="Notifications"
            >
              <Bell className="w-3.5 h-3.5" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 flex items-center justify-center bg-status-red rounded-full text-[8px] font-bold text-white leading-none">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute top-full right-0 mt-1.5 w-80 bg-dark-surface border border-dark-border rounded-xl shadow-card overflow-hidden z-50">
                <div className="flex items-center justify-between px-3 py-2 border-b border-dark-divider">
                  <p className="text-[10px] font-semibold text-ink-dim uppercase tracking-widest">Alert Events</p>
                  <Link
                    href="/alerts"
                    onClick={() => setNotifOpen(false)}
                    className="text-[10px] text-brand-400 hover:text-brand-300 transition-colors"
                  >
                    View all →
                  </Link>
                </div>
                {alertEvents.length === 0 ? (
                  <div className="px-4 py-5 text-center">
                    <Bell className="w-5 h-5 text-ink-dim mx-auto mb-2" />
                    <p className="text-xs text-ink-muted">No alert events yet</p>
                  </div>
                ) : (
                  <div className="divide-y divide-dark-divider/50 max-h-72 overflow-y-auto">
                    {alertEvents.slice(0, 8).map((ev) => (
                      <div key={ev.id} className="px-3 py-2.5 hover:bg-dark-raised/50 transition-colors">
                        <p className="text-xs text-ink-secondary leading-snug">{ev.message}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-ink-dim">
                            {formatDistanceToNow(new Date(ev.fired_at), { addSuffix: true })}
                          </span>
                          {!ev.delivered && (
                            <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                              delivery failed
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* User menu */}
        <div className="relative" ref={userRef}>
          <button
            onClick={() => setUserOpen((o) => !o)}
            className="flex items-center gap-2 text-xs text-ink-secondary hover:text-ink-primary transition-colors py-1 px-2 rounded-lg hover:bg-dark-raised"
          >
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover" />
            ) : (
              <div className="w-5 h-5 rounded-full bg-brand-600 flex items-center justify-center text-[9px] font-bold text-white">
                {initials}
              </div>
            )}
            <span className="font-medium hidden sm:block truncate max-w-[80px]">
              {user?.name ?? user?.email}
            </span>
            <ChevronDown className="w-3 h-3 text-ink-dim" />
          </button>

          {userOpen && (
            <div className="absolute top-full right-0 mt-1.5 w-52 bg-dark-surface border border-dark-border rounded-xl shadow-card overflow-hidden z-50">
              <div className="px-3 py-3 border-b border-dark-divider">
                <p className="text-xs font-semibold text-ink-primary truncate">{user?.name}</p>
                <p className="text-[11px] text-ink-muted truncate">{user?.email}</p>
              </div>
              <div className="py-1">
                <Link
                  href="/settings"
                  onClick={() => setUserOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-xs text-ink-secondary hover:bg-dark-raised transition-colors"
                >
                  <User className="w-3.5 h-3.5 text-ink-dim" />
                  Settings
                </Link>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-status-red hover:bg-dark-raised transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
