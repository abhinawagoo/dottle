"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { projectsApi, orgsApi, codeFixApi } from "@/lib/api";
import { useOrg } from "@/lib/org-context";
import { useAuth } from "@/lib/auth-context";
import { useProject } from "@/lib/project-context";
import { Card, EmptyState } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Copy, Check, Plus, Trash2, Key, FolderOpen, RefreshCw, Building2, Users, UserPlus, GitBranch, Github, Save } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

function GitHubIntegrationCard() {
  const qc = useQueryClient();
  const { selectedProject } = useProject();
  const PROJECT_ID = selectedProject?.id ?? "";

  const [repoUrl, setRepoUrl] = useState("");
  const [token, setToken] = useState("");
  const [branch, setBranch] = useState("main");
  const [showToken, setShowToken] = useState(false);

  const { data: ghConfig, isError: notConfigured } = useQuery({
    queryKey: ["github-config", PROJECT_ID],
    queryFn: () => codeFixApi.getGitHubConfig(PROJECT_ID),
    enabled: !!PROJECT_ID,
    retry: false,
  });

  const save = useMutation({
    mutationFn: () => codeFixApi.saveGitHubConfig(PROJECT_ID, {
      repo_url: repoUrl,
      access_token: token,
      default_branch: branch,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["github-config", PROJECT_ID] });
      setToken("");
    },
  });

  const remove = useMutation({
    mutationFn: () => codeFixApi.deleteGitHubConfig(PROJECT_ID),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["github-config", PROJECT_ID] });
    },
  });

  if (!PROJECT_ID) {
    return (
      <Card title={<span className="flex items-center gap-2"><GitBranch className="w-3.5 h-3.5 text-ink-dim" />GitHub Integration</span>}
        subtitle="Connect a repo to enable AI code fixes">
        <p className="text-xs text-ink-muted">Select a project first.</p>
      </Card>
    );
  }

  return (
    <Card title={<span className="flex items-center gap-2"><GitBranch className="w-3.5 h-3.5 text-ink-dim" />GitHub Integration</span>}
      subtitle="Connect your repository for AI-powered code fixes and PR generation">
      {ghConfig && (
        <div className="flex items-center justify-between p-3 mb-4 rounded-xl bg-green-500/5 border border-green-500/20">
          <div className="flex items-center gap-2.5">
            <Check className="w-4 h-4 text-green-400" />
            <div>
              <p className="text-sm font-medium text-green-300">
                {ghConfig.repo_owner}/{ghConfig.repo_name}
              </p>
              <p className="text-[10px] text-ink-dim mt-0.5">
                Branch: {ghConfig.default_branch} · Token: {ghConfig.token_masked}
              </p>
            </div>
          </div>
          <button
            onClick={() => remove.mutate()}
            className="text-ink-dim hover:text-status-red transition-colors p-1.5 rounded-lg hover:bg-status-red/10"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="space-y-3">
        <div>
          <label className="form-label">Repository URL</label>
          <input
            className="input-dark"
            placeholder="https://github.com/your-org/your-repo"
            value={repoUrl || ghConfig?.repo_url || ""}
            onChange={e => setRepoUrl(e.target.value)}
          />
        </div>
        <div>
          <label className="form-label">Personal Access Token</label>
          <div className="relative">
            <input
              className="input-dark pr-20"
              type={showToken ? "text" : "password"}
              placeholder={ghConfig ? "Enter new token to update" : "ghp_..."}
              value={token}
              onChange={e => setToken(e.target.value)}
            />
            <button
              onClick={() => setShowToken(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-ink-dim hover:text-ink-muted"
            >
              {showToken ? "Hide" : "Show"}
            </button>
          </div>
          <p className="text-[10px] text-ink-dim mt-1.5">
            Needs <code className="text-ink-muted">repo</code> scope. Create at github.com → Settings → Developer Settings → Fine-grained tokens.
          </p>
        </div>
        <div>
          <label className="form-label">Default Branch</label>
          <input className="input-dark" placeholder="main" value={branch || ghConfig?.default_branch || "main"}
            onChange={e => setBranch(e.target.value)} />
        </div>
        <Button
          onClick={() => save.mutate()}
          disabled={!repoUrl && !ghConfig || !token}
          loading={save.isPending}
          icon={<Save />}
        >
          {ghConfig ? "Update Integration" : "Connect Repository"}
        </Button>
      </div>
    </Card>
  );
}

export default function SettingsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { selectedOrg, orgs } = useOrg();
  const [copied, setCopied] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newOrgName, setNewOrgName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");

  const { data: projects } = useQuery({
    queryKey: ["projects", selectedOrg?.id],
    queryFn: () => projectsApi.list(selectedOrg!.id),
    enabled: !!selectedOrg,
  });

  const { data: members } = useQuery({
    queryKey: ["members", selectedOrg?.id],
    queryFn: () => orgsApi.listMembers(selectedOrg!.id),
    enabled: !!selectedOrg,
  });

  const createProject = useMutation({
    mutationFn: () => projectsApi.create(selectedOrg!.id, newName, newDesc),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      setNewName(""); setNewDesc("");
    },
  });

  const deleteProject = useMutation({
    mutationFn: (id: string) => projectsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });

  const regenerateKey = useMutation({
    mutationFn: (id: string) => projectsApi.regenerateKey(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });

  const createOrg = useMutation({
    mutationFn: () => orgsApi.create(newOrgName),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orgs"] });
      setNewOrgName("");
    },
  });

  const inviteMember = useMutation({
    mutationFn: () => orgsApi.inviteMember(selectedOrg!.id, inviteEmail, inviteRole),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["members"] });
      setInviteEmail("");
    },
  });

  const removeMember = useMutation({
    mutationFn: (memberId: string) => orgsApi.removeMember(selectedOrg!.id, memberId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members"] }),
  });

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const isOwnerOrAdmin = selectedOrg?.role === "owner" || selectedOrg?.role === "admin";

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <div>
        <h1 className="text-lg font-semibold text-ink-primary">Settings</h1>
        <p className="text-xs text-ink-muted mt-0.5">{user?.email}</p>
      </div>

      {/* ── Organizations ───────────────────────────────────────────────────── */}
      <Card title={<span className="flex items-center gap-2"><Building2 className="w-3.5 h-3.5 text-ink-dim" />Organizations</span>}
        subtitle="You belong to these organizations">
        <div className="space-y-2 mb-4">
          {orgs.map((o) => (
            <div key={o.id} className="flex items-center justify-between px-3 py-2.5 bg-dark-raised rounded-xl border border-dark-border">
              <div>
                <p className="text-sm font-medium text-ink-primary">{o.name}</p>
                <p className="text-[10px] text-ink-dim font-mono mt-0.5">{o.slug}</p>
              </div>
              <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${
                o.role === "owner" ? "text-brand-400 border-brand-500/30 bg-brand-500/10" :
                o.role === "admin" ? "text-amber-400 border-amber-500/30 bg-amber-500/10" :
                "text-ink-muted border-dark-border"}`}>
                {o.role}
              </span>
            </div>
          ))}
        </div>
        <div className="pt-4 border-t border-dark-divider">
          <p className="text-xs font-semibold text-ink-secondary mb-3">Create new organization</p>
          <div className="flex gap-2">
            <input className="input-dark flex-1" placeholder="Acme Inc." value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && newOrgName && createOrg.mutate()} />
            <Button onClick={() => createOrg.mutate()} disabled={!newOrgName} loading={createOrg.isPending} icon={<Plus />}>
              Create
            </Button>
          </div>
        </div>
      </Card>

      {/* ── Team members ────────────────────────────────────────────────────── */}
      {selectedOrg && (
        <Card title={<span className="flex items-center gap-2"><Users className="w-3.5 h-3.5 text-ink-dim" />Team — {selectedOrg.name}</span>}
          subtitle="Members of this organization">
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
                    <button onClick={() => removeMember.mutate(m.id)}
                      className="text-ink-dim hover:text-status-red transition-colors p-1">
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
                  onChange={(e) => setInviteEmail(e.target.value)} />
                <select className="input-dark w-28" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                  <option value="owner">Owner</option>
                </select>
                <Button onClick={() => inviteMember.mutate()} disabled={!inviteEmail} loading={inviteMember.isPending} icon={<UserPlus />}>
                  Invite
                </Button>
              </div>
              <p className="text-[10px] text-ink-dim mt-2">The user must already have an Dottle account.</p>
            </div>
          )}
        </Card>
      )}

      {/* ── Create project ───────────────────────────────────────────────────── */}
      {selectedOrg && isOwnerOrAdmin && (
        <Card title="Create Project" subtitle={`New project in ${selectedOrg.name}`}>
          <div className="space-y-4">
            <div>
              <label className="form-label">Project Name</label>
              <input className="input-dark" placeholder="my-ai-agent" value={newName}
                onChange={(e) => setNewName(e.target.value)} />
            </div>
            <div>
              <label className="form-label">Description (optional)</label>
              <input className="input-dark" placeholder="Production research agent" value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)} />
            </div>
            <Button onClick={() => createProject.mutate()} disabled={!newName || !selectedOrg}
              loading={createProject.isPending} icon={<Plus />}>
              Create Project
            </Button>
          </div>
        </Card>
      )}

      {/* ── GitHub Integration ─────────────────────────────────────────────── */}
      <GitHubIntegrationCard />

      {/* ── Projects list ────────────────────────────────────────────────────── */}
      <Card title={<span className="flex items-center gap-2"><FolderOpen className="w-3.5 h-3.5 text-ink-dim" />Projects</span>}
        subtitle="API keys and SDK configuration">
        {!selectedOrg ? (
          <EmptyState icon={<Building2 />} title="Select an organization" description="Choose an org from the top bar to see its projects." />
        ) : !projects?.length ? (
          <EmptyState icon={<FolderOpen />} title="No projects yet"
            description="Create a project above to get your API key and start instrumenting agents." />
        ) : (
          <div className="space-y-4">
            {projects.map((p) => (
              <div key={p.id} className="border border-dark-border rounded-xl p-4 bg-dark-raised">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-ink-primary text-sm">{p.name}</p>
                    {p.description && <p className="text-xs text-ink-muted mt-0.5">{p.description}</p>}
                    <p className="text-[10px] text-ink-dim mt-1.5 font-mono">{p.id}</p>
                    <p className="text-[10px] text-ink-dim mt-0.5">
                      Created {formatDistanceToNow(new Date(p.created_at), { addSuffix: true })}
                    </p>
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
      </Card>
    </div>
  );
}
