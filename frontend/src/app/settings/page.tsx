"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { projectsApi, orgsApi, codeFixApi } from "@/lib/api";
import { useOrg } from "@/lib/org-context";
import { useAuth } from "@/lib/auth-context";
import { useProject } from "@/lib/project-context";
import { Card, EmptyState } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  Copy, Check, Plus, Trash2, Key, FolderOpen, RefreshCw,
  Building2, Users, UserPlus, GitBranch, Save, Github,
  Bell, ShieldCheck, CreditCard, Settings, AlertCircle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

// ── Settings sidebar sections ─────────────────────────────────────────────────

type Section =
  | "projects"
  | "team"
  | "github"
  | "alerts"
  | "pii"
  | "billing";

const SECTIONS: { id: Section; label: string; icon: React.ElementType; desc: string }[] = [
  { id: "projects",  label: "API Keys",        icon: Key,         desc: "Projects and API keys"         },
  { id: "team",      label: "Team",             icon: Users,       desc: "Members and invites"           },
  { id: "github",    label: "GitHub",           icon: Github,      desc: "Repo connection for AI fixes"  },
  { id: "alerts",    label: "Alerts",           icon: Bell,        desc: "Slack and email notifications" },
  { id: "pii",       label: "PII Redaction",    icon: ShieldCheck, desc: "Scrub sensitive data"         },
  { id: "billing",   label: "Billing",          icon: CreditCard,  desc: "Plan and usage"                },
];

// ── GitHub Integration section ────────────────────────────────────────────────

function GitHubSection() {
  const qc = useQueryClient();
  const { selectedProject } = useProject();
  const PROJECT_ID = selectedProject?.id ?? "";

  const [repoUrl, setRepoUrl] = useState("");
  const [token, setToken] = useState("");
  const [branch, setBranch] = useState("main");
  const [showToken, setShowToken] = useState(false);

  const { data: ghConfig } = useQuery({
    queryKey: ["github-config", PROJECT_ID],
    queryFn: () => codeFixApi.getGitHubConfig(PROJECT_ID),
    enabled: !!PROJECT_ID,
    retry: false,
  });

  const save = useMutation({
    mutationFn: () => codeFixApi.saveGitHubConfig(PROJECT_ID, {
      repo_url: repoUrl || ghConfig?.repo_url || "",
      access_token: token,
      default_branch: branch || ghConfig?.default_branch || "main",
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["github-config", PROJECT_ID] });
      setToken("");
      setRepoUrl("");
    },
  });

  const remove = useMutation({
    mutationFn: () => codeFixApi.deleteGitHubConfig(PROJECT_ID),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["github-config", PROJECT_ID] }),
  });

  if (!PROJECT_ID) {
    return <p className="text-sm text-ink-muted">Select a project first.</p>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-ink-primary">GitHub Integration</h2>
        <p className="text-xs text-ink-muted mt-0.5">Connect your repository for AI-powered code fixes and PR generation.</p>
      </div>

      {ghConfig && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-green-500/5 border border-green-500/20">
          <div className="flex items-center gap-2.5">
            <Check className="w-4 h-4 text-green-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-green-300">{ghConfig.repo_owner}/{ghConfig.repo_name}</p>
              <p className="text-[10px] text-ink-dim mt-0.5">Branch: {ghConfig.default_branch} · Token: {ghConfig.token_masked}</p>
            </div>
          </div>
          <button onClick={() => remove.mutate()} className="text-ink-dim hover:text-status-red transition-colors p-1.5 rounded-lg hover:bg-status-red/10">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {save.isError && (
        <div className="flex items-start gap-2 p-3 bg-red-500/5 border border-red-500/20 rounded-xl">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-400">
            {(save.error as Error)?.message ?? "Failed to save. Check the token and repo URL."}
          </p>
        </div>
      )}

      <div className="space-y-3">
        <div>
          <label className="form-label">Repository URL</label>
          <input className="input-dark" placeholder="https://github.com/your-org/your-repo"
            value={repoUrl || (save.isSuccess ? "" : ghConfig?.repo_url ?? "")}
            onChange={e => setRepoUrl(e.target.value)} />
        </div>
        <div>
          <label className="form-label">Personal Access Token</label>
          <div className="relative">
            <input className="input-dark pr-16" type={showToken ? "text" : "password"}
              placeholder={ghConfig ? "Enter new token to update" : "ghp_..."}
              value={token} onChange={e => setToken(e.target.value)} />
            <button onClick={() => setShowToken(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-ink-dim hover:text-ink-muted">
              {showToken ? "Hide" : "Show"}
            </button>
          </div>
          <p className="text-[10px] text-ink-dim mt-1.5">
            Needs <code className="text-ink-muted">repo</code> scope. Create at github.com → Settings → Developer Settings → Fine-grained tokens.
          </p>
        </div>
        <div>
          <label className="form-label">Default Branch</label>
          <input className="input-dark" placeholder="main"
            value={branch || ghConfig?.default_branch || "main"}
            onChange={e => setBranch(e.target.value)} />
        </div>
        <Button
          onClick={() => save.mutate()}
          disabled={!token}
          loading={save.isPending}
          icon={<Save />}
        >
          {ghConfig ? "Update Integration" : "Connect Repository"}
        </Button>
      </div>
    </div>
  );
}

// ── Projects / API Keys section ───────────────────────────────────────────────

function ProjectsSection() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { selectedOrg } = useOrg();
  const [copied, setCopied] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const { data: projects } = useQuery({
    queryKey: ["projects", selectedOrg?.id],
    queryFn: () => projectsApi.list(selectedOrg!.id),
    enabled: !!selectedOrg,
  });

  const createProject = useMutation({
    mutationFn: () => projectsApi.create(selectedOrg!.id, newName, newDesc),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["projects"] }); setNewName(""); setNewDesc(""); },
  });

  const deleteProject = useMutation({
    mutationFn: (id: string) => projectsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });

  const regenerateKey = useMutation({
    mutationFn: (id: string) => projectsApi.regenerateKey(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const isOwnerOrAdmin = selectedOrg?.role === "owner" || selectedOrg?.role === "admin";

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-ink-primary">API Keys & Projects</h2>
        <p className="text-xs text-ink-muted mt-0.5">Manage your projects and copy API keys for SDK configuration.</p>
      </div>

      {/* Create project */}
      {selectedOrg && isOwnerOrAdmin && (
        <Card subtitle={`New project in ${selectedOrg.name}`}>
          <div className="space-y-3">
            <div>
              <label className="form-label">Project Name</label>
              <input className="input-dark" placeholder="my-ai-agent" value={newName}
                onChange={e => setNewName(e.target.value)} />
            </div>
            <div>
              <label className="form-label">Description (optional)</label>
              <input className="input-dark" placeholder="Production research agent" value={newDesc}
                onChange={e => setNewDesc(e.target.value)} />
            </div>
            <Button onClick={() => createProject.mutate()} disabled={!newName || !selectedOrg}
              loading={createProject.isPending} icon={<Plus />}>
              Create Project
            </Button>
          </div>
        </Card>
      )}

      {/* Projects list */}
      {!selectedOrg ? (
        <EmptyState icon={<Building2 />} title="Select an organization" description="Choose an org from the top bar." />
      ) : !projects?.length ? (
        <EmptyState icon={<FolderOpen />} title="No projects yet" description="Create a project above to get your API key." />
      ) : (
        <div className="space-y-4">
          {projects.map(p => (
            <div key={p.id} className="border border-dark-border rounded-xl p-4 bg-dark-raised">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-ink-primary text-sm">{p.name}</p>
                  {p.description && <p className="text-xs text-ink-muted mt-0.5">{p.description}</p>}
                  <p className="text-[10px] text-ink-dim mt-1.5 font-mono">{p.id}</p>
                  <p className="text-[10px] text-ink-dim mt-0.5">Created {formatDistanceToNow(new Date(p.created_at), { addSuffix: true })}</p>
                </div>
                {isOwnerOrAdmin && (
                  <button onClick={() => { if (confirm(`Delete "${p.name}"? All sessions will be deleted.`)) deleteProject.mutate(p.id); }}
                    className="text-ink-dim hover:text-status-red transition-colors p-1.5 rounded-lg hover:bg-status-red/10">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="mt-3 bg-dark-bg rounded-lg border border-dark-divider p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <Key className="w-3 h-3 text-ink-dim" />
                  <p className="text-[10px] text-ink-muted uppercase tracking-wider font-semibold">API Key</p>
                </div>
                <div className="flex items-center gap-2">
                  <code className="text-xs font-mono text-brand-400 flex-1 truncate">{p.api_key}</code>
                  <button onClick={() => copy(p.api_key, `key-${p.id}`)} className="text-ink-dim hover:text-ink-secondary transition-colors shrink-0 p-1">
                    {copied === `key-${p.id}` ? <Check className="w-3.5 h-3.5 text-status-green" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  {isOwnerOrAdmin && (
                    <button onClick={() => { if (confirm("Regenerate? Old key stops working immediately.")) regenerateKey.mutate(p.id); }}
                      className="text-ink-dim hover:text-amber-400 transition-colors shrink-0 p-1">
                      <RefreshCw className={`w-3.5 h-3.5 ${regenerateKey.isPending ? "animate-spin" : ""}`} />
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-3 bg-dark-bg rounded-lg border border-dark-divider p-3">
                <p className="text-[10px] text-ink-muted uppercase tracking-wider font-semibold mb-2.5">Quick Start</p>
                <pre className="text-[11px] font-mono text-ink-secondary leading-relaxed overflow-auto">{`pip install dottle-sdk

import dottle

dottle.configure(api_key="${p.api_key}")

with dottle.session("my_agent") as sid:
    with dottle.span("llm", "gpt-4o") as s:
        s.record_tokens(512, 128, "gpt-4o")`}</pre>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Team section ──────────────────────────────────────────────────────────────

function TeamSection() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { selectedOrg, orgs } = useOrg();
  const [newOrgName, setNewOrgName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");

  const { data: members } = useQuery({
    queryKey: ["members", selectedOrg?.id],
    queryFn: () => orgsApi.listMembers(selectedOrg!.id),
    enabled: !!selectedOrg,
  });

  const createOrg = useMutation({
    mutationFn: () => orgsApi.create(newOrgName),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["orgs"] }); setNewOrgName(""); },
  });

  const inviteMember = useMutation({
    mutationFn: () => orgsApi.inviteMember(selectedOrg!.id, inviteEmail, inviteRole),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["members"] }); setInviteEmail(""); },
  });

  const removeMember = useMutation({
    mutationFn: (memberId: string) => orgsApi.removeMember(selectedOrg!.id, memberId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members"] }),
  });

  const isOwnerOrAdmin = selectedOrg?.role === "owner" || selectedOrg?.role === "admin";

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-ink-primary">Team Management</h2>
        <p className="text-xs text-ink-muted mt-0.5">Manage team members, roles, and organizations.</p>
      </div>

      {/* Organizations */}
      <Card subtitle="Your organizations">
        <div className="space-y-2 mb-4">
          {orgs.map(o => (
            <div key={o.id} className="flex items-center justify-between px-3 py-2.5 bg-dark-raised rounded-xl border border-dark-border">
              <div>
                <p className="text-sm font-medium text-ink-primary">{o.name}</p>
                <p className="text-[10px] text-ink-dim font-mono mt-0.5">{o.slug}</p>
              </div>
              <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${
                o.role === "owner" ? "text-brand-400 border-brand-500/30 bg-brand-500/10" :
                o.role === "admin" ? "text-amber-400 border-amber-500/30 bg-amber-500/10" :
                "text-ink-muted border-dark-border"}`}>{o.role}</span>
            </div>
          ))}
        </div>
        <div className="pt-4 border-t border-dark-divider">
          <p className="text-xs font-semibold text-ink-secondary mb-3">Create organization</p>
          <div className="flex gap-2">
            <input className="input-dark flex-1" placeholder="Acme Inc." value={newOrgName}
              onChange={e => setNewOrgName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && newOrgName && createOrg.mutate()} />
            <Button onClick={() => createOrg.mutate()} disabled={!newOrgName} loading={createOrg.isPending} icon={<Plus />}>Create</Button>
          </div>
        </div>
      </Card>

      {/* Members */}
      {selectedOrg && (
        <Card subtitle={`Members of ${selectedOrg.name}`}>
          <div className="space-y-2 mb-4">
            {(members ?? []).map((m: any) => (
              <div key={m.id} className="flex items-center justify-between px-3 py-2.5 bg-dark-raised rounded-xl border border-dark-border">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-6 h-6 rounded-full bg-brand-600/30 flex items-center justify-center text-[10px] font-bold text-brand-400 shrink-0">
                    {(m.name || m.email)[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-ink-secondary truncate">{m.name || m.email}</p>
                    {m.name && <p className="text-[10px] text-ink-dim truncate">{m.email}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] text-ink-muted">{m.role}</span>
                  {isOwnerOrAdmin && m.user_id !== user?.id && (
                    <button onClick={() => removeMember.mutate(m.id)} className="text-ink-dim hover:text-status-red transition-colors p-1">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {isOwnerOrAdmin && (
            <div className="pt-4 border-t border-dark-divider">
              <p className="text-xs font-semibold text-ink-secondary mb-3">Invite member</p>
              <div className="flex gap-2">
                <input className="input-dark flex-1" placeholder="colleague@company.com" value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)} />
                <select className="input-dark w-28" value={inviteRole} onChange={e => setInviteRole(e.target.value)}>
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                  <option value="owner">Owner</option>
                </select>
                <Button onClick={() => inviteMember.mutate()} disabled={!inviteEmail} loading={inviteMember.isPending} icon={<UserPlus />}>Invite</Button>
              </div>
              <p className="text-[10px] text-ink-dim mt-2">The user must already have a Dottle account.</p>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

// ── Alerts section (placeholder) ──────────────────────────────────────────────

function AlertsSection() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-ink-primary">Alerts</h2>
        <p className="text-xs text-ink-muted mt-0.5">Configure Slack and email notifications for your alert rules.</p>
      </div>
      <Card>
        <p className="text-sm text-ink-muted mb-3">Alert rules and destinations are managed on the Alerts page.</p>
        <a href="/alerts" className="inline-flex items-center gap-1.5 text-[12px] text-brand-400 hover:underline">
          <Bell className="w-3.5 h-3.5" /> Go to Alerts →
        </a>
      </Card>
    </div>
  );
}

// ── PII Redaction section (placeholder) ───────────────────────────────────────

function PIISection() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-ink-primary">PII Redaction</h2>
        <p className="text-xs text-ink-muted mt-0.5">Automatically strip sensitive data before it reaches Dottle servers.</p>
      </div>
      <Card>
        <p className="text-xs text-ink-muted mb-3">Enable in the SDK to scrub emails, phone numbers, credit cards, SSNs, and API keys from all recorded prompts and responses.</p>
        <pre className="text-[11px] font-mono text-ink-secondary bg-dark-bg border border-dark-border rounded-lg p-3">{`# Python SDK
dottle.configure(
    api_key="dtl_live_...",
    redact_pii=True,   # ← enable here
)

// JS SDK
dottle.configure({
    apiKey: "dtl_live_...",
    redactPii: true,   // ← enable here
});`}</pre>
      </Card>
    </div>
  );
}

// ── Billing section (placeholder) ────────────────────────────────────────────

function BillingSection() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-ink-primary">Billing</h2>
        <p className="text-xs text-ink-muted mt-0.5">Plan, usage, and payment details.</p>
      </div>
      <Card>
        <div className="flex items-center gap-3 p-3 bg-brand-500/5 border border-brand-500/20 rounded-xl mb-4">
          <div>
            <p className="text-sm font-semibold text-ink-primary">Hobby Plan</p>
            <p className="text-[11px] text-ink-muted mt-0.5">Free · 10,000 sessions/month · 7-day retention</p>
          </div>
          <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-brand-400 border border-brand-500/30 bg-brand-500/10 px-2 py-0.5 rounded-full">
            Free
          </span>
        </div>
        <p className="text-xs text-ink-muted">Upgrade to Pro ($29/mo) for 100,000 sessions, 90-day retention, email alerts, and export.</p>
        <p className="text-[11px] text-ink-dim mt-3">Billing management coming soon. Contact <a href="mailto:support@dottle.dev" className="text-brand-400 hover:underline">support@dottle.dev</a> to upgrade.</p>
      </Card>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState<Section>("projects");

  const active = SECTIONS.find(s => s.id === activeSection)!;

  return (
    <div className="flex h-full max-w-5xl mx-auto gap-0">

      {/* Settings sidebar */}
      <aside className="w-[200px] shrink-0 border-r border-dark-border pr-0">
        <div className="py-1">
          <p className="text-[10px] font-semibold text-ink-dim uppercase tracking-widest px-3 py-2">Settings</p>
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveSection(id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all text-left ${
                activeSection === id
                  ? "bg-dark-raised text-ink-primary"
                  : "text-ink-muted hover:text-ink-secondary hover:bg-dark-raised/50"
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${activeSection === id ? "text-brand-400" : "text-ink-dim"}`} />
              {label}
            </button>
          ))}
        </div>

        {/* User info at bottom of settings sidebar */}
        <div className="mt-auto border-t border-dark-border pt-3 px-3 pb-2">
          <p className="text-[10px] text-ink-dim truncate">{user?.email}</p>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 px-8 py-5 overflow-y-auto">
        <div className="max-w-xl space-y-5">
          {activeSection === "projects" && <ProjectsSection />}
          {activeSection === "team"     && <TeamSection />}
          {activeSection === "github"   && <GitHubSection />}
          {activeSection === "alerts"   && <AlertsSection />}
          {activeSection === "pii"      && <PIISection />}
          {activeSection === "billing"  && <BillingSection />}
        </div>
      </main>
    </div>
  );
}
