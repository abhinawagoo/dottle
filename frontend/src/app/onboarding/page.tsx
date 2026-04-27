"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { orgsApi, projectsApi } from "@/lib/api";
import {
  Zap, ArrowRight, ArrowLeft, Check, Plus, X,
  Slack, Bell, Users, Target, BookOpen,
  AlertTriangle, ThumbsUp, ShieldOff, Brain, Flame, Frown, Ban, Laugh,
  Copy, CheckCheck, Terminal, Code2
} from "lucide-react";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

// ── Types ─────────────────────────────────────────────────────────────────────

interface OnboardingData {
  product_description: string;
  tracked_issues: string[];
  invited_emails: string[];
}

// ── Framework catalogue ───────────────────────────────────────────────────────

type FrameworkCategory = "all" | "framework" | "sdk";

interface Framework {
  id: string;
  label: string;
  category: "framework" | "sdk";
  emoji: string;
  badge?: string;
  install: string;
  snippet: string;
}

const FRAMEWORKS: Framework[] = [
  {
    id: "python",
    label: "Python SDK",
    category: "sdk",
    emoji: "🐍",
    install: "pip install dottle-sdk",
    snippet:
`import dottle

dottle.configure(api_key="dtl_live_YOUR_KEY")

with dottle.session("my-agent") as session_id:
    # your agent code here
    response = your_agent.run("Hello!")`,
  },
  {
    id: "crewai",
    label: "CrewAI",
    category: "framework",
    emoji: "⚡",
    install: "pip install dottle-sdk crewai",
    snippet:
`import dottle
from dottle.integrations.crewai import instrument_crew

dottle.configure(api_key="dtl_live_YOUR_KEY")

crew = Crew(agents=[...], tasks=[...])
instrument_crew(crew)   # one line — done

with dottle.session("my-crew"):
    crew.kickoff(inputs={"topic": "AI trends"})`,
  },
  {
    id: "autogen",
    label: "AutoGen",
    category: "framework",
    emoji: "🤖",
    install: "pip install dottle-sdk pyautogen",
    snippet:
`import dottle
from dottle.integrations.autogen import instrument_agent

dottle.configure(api_key="dtl_live_YOUR_KEY")

agent = ConversableAgent("assistant", llm_config={...})
instrument_agent(agent)   # patches generate_reply automatically

with dottle.session("my-agent"):
    agent.initiate_chat(user_proxy, message="Hello!")`,
  },
  {
    id: "agno",
    label: "Agno",
    category: "framework",
    emoji: "🧠",
    install: "pip install dottle-sdk agno anthropic",
    snippet:
`import dottle
from dottle.integrations.agno import instrument_agno_agent
from agno.agent import Agent
from agno.models.anthropic import Claude

dottle.configure(api_key="dtl_live_YOUR_KEY")

agent = Agent(
    model=Claude(id="claude-sonnet-4-6"),
    instructions="You are a helpful assistant.",
)
instrument_agno_agent(agent)

with dottle.session("my-agent"):
    agent.run("What is the capital of France?")`,
  },
  {
    id: "rest",
    label: "REST API",
    category: "sdk",
    emoji: "🔗",
    install: "# No install needed — use any HTTP client",
    snippet:
`curl -X POST https://api.dottle.dev/api/v1/ingest/spans \\
  -H "Authorization: Bearer dtl_live_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "spans": [{
      "session_id": "ses_abc123",
      "span_type": "llm",
      "name": "gpt-4o call",
      "started_at": "2026-01-01T00:00:00Z",
      "ended_at": "2026-01-01T00:00:01Z",
      "input_text": "Hello!",
      "output_text": "Hi there! How can I help?"
    }]
  }'`,
  },
];

const CATEGORY_TABS: { id: FrameworkCategory; label: string }[] = [
  { id: "all",       label: "All"               },
  { id: "framework", label: "Agent frameworks"  },
  { id: "sdk",       label: "SDK / REST"        },
];

// ── Step: Connect your stack ──────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button onClick={copy} className="flex items-center gap-1.5 text-[11px] text-ink-dim hover:text-ink-muted transition-colors">
      {copied ? <CheckCheck className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function StepConnect() {
  const [tab, setTab] = useState<FrameworkCategory>("all");
  const [selected, setSelected] = useState<Framework>(FRAMEWORKS[0]);

  const visible = tab === "all" ? FRAMEWORKS : FRAMEWORKS.filter(f => f.category === tab);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-ink-primary mb-2">Connect your stack</h2>
        <p className="text-base text-ink-muted">Pick your framework to get a tailored snippet. Copy it into your project and you're tracing.</p>
      </div>

      {/* Category tabs */}
      <div className="flex gap-1 p-1 bg-dark-raised rounded-xl border border-dark-border w-fit">
        {CATEGORY_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3.5 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
              tab === t.id
                ? "bg-dark-surface text-ink-primary shadow-sm"
                : "text-ink-muted hover:text-ink-secondary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Framework grid */}
      <div className="grid grid-cols-5 gap-2">
        {visible.map(fw => (
          <button
            key={fw.id}
            onClick={() => setSelected(fw)}
            className={`flex flex-col items-center gap-2 py-3.5 px-2 rounded-xl border text-center transition-all ${
              selected.id === fw.id
                ? "border-brand-500/60 bg-brand-600/10"
                : "border-dark-border bg-dark-raised hover:border-dark-border/80"
            }`}
          >
            <span className="text-2xl leading-none">{fw.emoji}</span>
            <span className={`text-[11px] font-medium leading-tight ${selected.id === fw.id ? "text-ink-primary" : "text-ink-muted"}`}>
              {fw.label}
            </span>
            {fw.badge && (
              <span className="text-[9px] px-1.5 py-0.5 bg-brand-600/20 text-brand-400 rounded-full">{fw.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* Install */}
      <div className="rounded-xl border border-dark-border bg-dark-bg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-dark-border bg-dark-raised/40">
          <div className="flex items-center gap-2">
            <Terminal className="w-3.5 h-3.5 text-ink-dim" />
            <span className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide">Install</span>
          </div>
          <CopyButton text={selected.install} />
        </div>
        <pre className="px-4 py-3 text-[12px] font-mono text-green-400 leading-relaxed overflow-x-auto">
          {selected.install}
        </pre>
      </div>

      {/* Snippet */}
      <div className="rounded-xl border border-dark-border bg-dark-bg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-dark-border bg-dark-raised/40">
          <div className="flex items-center gap-2">
            <Code2 className="w-3.5 h-3.5 text-ink-dim" />
            <span className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide">
              {selected.id === "rest" ? "Example request" : "Code snippet"}
            </span>
          </div>
          <CopyButton text={selected.snippet} />
        </div>
        <pre className="px-4 py-4 text-[11.5px] font-mono text-ink-secondary leading-relaxed overflow-x-auto whitespace-pre">
          {selected.snippet}
        </pre>
      </div>

      <p className="text-[11px] text-ink-dim text-center">
        Replace <code className="text-brand-400 bg-brand-600/10 px-1 py-0.5 rounded">dtl_live_YOUR_KEY</code> with your API key from{" "}
        <span className="text-ink-muted">Settings → API Keys</span>
      </p>
    </div>
  );
}

// ── Issue options ─────────────────────────────────────────────────────────────

const ISSUE_OPTIONS = [
  { id: "task_failure",       label: "Task failure",       desc: "Agent fails to complete tasks",       icon: AlertTriangle, color: "text-red-400"    },
  { id: "user_frustration",   label: "User frustration",   desc: "Signs of user dissatisfaction",       icon: Frown,         color: "text-orange-400" },
  { id: "refusals",           label: "Refusals",           desc: "Agent refuses to help",               icon: Ban,           color: "text-yellow-400" },
  { id: "nsfw",               label: "NSFW content",       desc: "Inappropriate content attempts",      icon: ShieldOff,     color: "text-pink-400"   },
  { id: "jailbreaking",       label: "Jailbreaking",       desc: "Attempts to bypass guidelines",       icon: Flame,         color: "text-red-500"    },
  { id: "laziness",           label: "Laziness",           desc: "Low-effort or incomplete responses",  icon: Laugh,         color: "text-blue-400"   },
  { id: "forgetting",         label: "Context forgetting", desc: "Agent loses mid-conversation context",icon: Brain,         color: "text-purple-400" },
  { id: "user_praise",        label: "User praise",        desc: "Positive feedback signals",           icon: ThumbsUp,      color: "text-green-400"  },
];

// ── Step components ───────────────────────────────────────────────────────────

function StepProductDescription({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold text-ink-primary mb-3">What does your AI product do?</h2>
        <p className="text-base text-ink-muted">Help us personalize your monitoring and surface the right insights.</p>
      </div>
      <div>
        <textarea
          className="w-full h-40 bg-dark-raised border border-dark-border rounded-xl px-5 py-4 text-base text-ink-primary placeholder:text-ink-dim resize-none focus:outline-none focus:border-brand-500/50 transition-colors"
          placeholder='e.g. "AI voice agent for pest control and property management — handles inbound customer calls for scheduling and billing"'
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={500}
        />
        <p className="text-xs text-ink-dim mt-1.5 text-right">{value.length}/500</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {["Customer support agent", "Voice AI for scheduling", "Coding assistant", "Research agent", "RAG chatbot", "Sales automation"].map((ex) => (
          <button key={ex} onClick={() => onChange(ex)}
            className="text-left text-sm text-ink-muted bg-dark-raised border border-dark-border rounded-xl px-4 py-3 hover:border-brand-500/40 hover:text-ink-secondary transition-colors">
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}

function StepTeamSetup({ emails, onChange }: { emails: string[]; onChange: (v: string[]) => void }) {
  const [input, setInput] = useState("");

  function addEmail() {
    const trimmed = input.trim();
    if (trimmed && !emails.includes(trimmed)) {
      onChange([...emails, trimmed]);
      setInput("");
    }
  }

  function removeEmail(email: string) {
    onChange(emails.filter((e) => e !== email));
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold text-ink-primary mb-3">Invite your team</h2>
        <p className="text-base text-ink-muted">Get teammates set up so everyone can monitor and debug together.</p>
      </div>
      <div className="flex gap-3">
        <input
          type="email"
          className="flex-1 bg-dark-raised border border-dark-border rounded-xl px-5 py-3 text-base text-ink-primary placeholder:text-ink-dim focus:outline-none focus:border-brand-500/50 transition-colors"
          placeholder="teammate@company.com"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addEmail()}
        />
        <button onClick={addEmail}
          className="px-5 py-3 bg-dark-raised border border-dark-border rounded-xl text-base text-ink-secondary hover:text-ink-primary hover:border-brand-500/40 transition-colors">
          <Plus className="w-5 h-5" />
        </button>
      </div>
      {emails.length > 0 && (
        <div className="space-y-2.5">
          {emails.map((email) => (
            <div key={email} className="flex items-center justify-between bg-dark-raised border border-dark-border rounded-xl px-5 py-3">
              <span className="text-base text-ink-secondary">{email}</span>
              <button onClick={() => removeEmail(email)} className="text-ink-dim hover:text-ink-secondary transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      {emails.length === 0 && (
        <div className="flex items-center gap-4 p-5 bg-dark-raised/50 border border-dark-border rounded-xl">
          <Users className="w-5 h-5 text-ink-dim flex-shrink-0" />
          <p className="text-sm text-ink-dim">Invites are sent by email. They'll join your organization when they accept.</p>
        </div>
      )}
    </div>
  );
}

function StepIssues({ selected, onChange }: { selected: string[]; onChange: (v: string[]) => void }) {
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold text-ink-primary mb-3">What should we watch for?</h2>
        <p className="text-base text-ink-muted">Select the behavior patterns that matter most for your product.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {ISSUE_OPTIONS.map(({ id, label, desc, icon: Icon, color }) => {
          const active = selected.includes(id);
          return (
            <button key={id} onClick={() => toggle(id)}
              className={`text-left p-4 rounded-xl border transition-all ${
                active
                  ? "border-brand-500/60 bg-brand-600/10"
                  : "border-dark-border bg-dark-raised hover:border-dark-border/80"
              }`}>
              <div className="flex items-start gap-3">
                <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${active ? color : "text-ink-dim"}`} />
                <div>
                  <p className={`text-sm font-medium ${active ? "text-ink-primary" : "text-ink-secondary"}`}>{label}</p>
                  <p className="text-xs text-ink-dim mt-1 leading-relaxed">{desc}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <div className="flex gap-3">
        <button onClick={() => onChange(ISSUE_OPTIONS.map((o) => o.id))}
          className="text-sm text-brand-400 hover:text-brand-300 transition-colors">Select all</button>
        <span className="text-ink-dim text-sm">·</span>
        <button onClick={() => onChange([])}
          className="text-sm text-ink-muted hover:text-ink-secondary transition-colors">Clear</button>
        <span className="text-sm text-ink-dim ml-auto">{selected.length} selected</span>
      </div>
    </div>
  );
}

function StepSlack({ projectId }: { projectId: string | null }) {
  const slackOAuthUrl = projectId
    ? `${BASE_URL}/slack/oauth/start?project_id=${projectId}`
    : null;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold text-ink-primary mb-3">Get alerts in Slack</h2>
        <p className="text-base text-ink-muted">Connect your Slack workspace to receive real-time notifications when issues are detected in your agents.</p>
      </div>

      {/* Slack card */}
      <div className="flex items-center gap-4 p-5 bg-[#4A154B]/20 border border-[#4A154B]/40 rounded-xl">
        <Slack className="w-8 h-8 text-[#E01E5A] flex-shrink-0" />
        <div>
          <p className="text-base font-medium text-ink-primary">Connect to Slack</p>
          <p className="text-sm text-ink-muted mt-0.5">Authorize Dottle to post alerts to any channel in your workspace</p>
        </div>
      </div>

      {slackOAuthUrl ? (
        <a
          href={slackOAuthUrl}
          className="flex items-center justify-center gap-3 w-full py-3.5 bg-[#4A154B] hover:bg-[#611B61] text-white text-base font-semibold rounded-xl transition-colors"
        >
          <Slack className="w-5 h-5" />
          Add to Slack
        </a>
      ) : (
        <div className="flex flex-col items-center gap-2 p-6 bg-dark-raised border border-dark-border rounded-xl text-center">
          <Slack className="w-7 h-7 text-ink-dim" />
          <p className="text-sm text-ink-secondary font-medium">Almost there — finish setup first</p>
          <p className="text-xs text-ink-dim">Your Slack connection will be ready in Settings once your workspace is created.</p>
        </div>
      )}

      {/* Benefits */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-ink-muted">You'll be notified when:</p>
        {[
          "A loop is detected in your agent",
          "Failure rate spikes above your threshold",
          "A session costs more than $1",
          "A new critical issue is found",
        ].map((item) => (
          <div key={item} className="flex items-center gap-3 text-sm text-ink-muted">
            <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
            {item}
          </div>
        ))}
      </div>

      <p className="text-xs text-ink-dim text-center">
        You can also connect Slack later from <span className="text-ink-muted">Settings → Integrations</span>
      </p>
    </div>
  );
}

// ── Main wizard ───────────────────────────────────────────────────────────────

const STEPS = [
  { id: "product",  label: "Product",  icon: BookOpen  },
  { id: "connect",  label: "Connect",  icon: Code2     },
  { id: "issues",   label: "Issues",   icon: Target    },
  { id: "team",     label: "Team",     icon: Users     },
  { id: "slack",    label: "Slack",    icon: Bell      },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { token } = useAuth();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);

  const [data, setData] = useState<OnboardingData>({
    product_description: "",
    tracked_issues: [],
    invited_emails: [],
  });

  function patch<K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  // Create org + project after step 0 so Slack OAuth has a project ID
  async function createWorkspace(): Promise<string | null> {
    if (createdProjectId) return createdProjectId;
    setCreatingWorkspace(true);
    try {
      const org = await orgsApi.create("My Organization");
      const projectName = data.product_description
        ? data.product_description.split(/[.,!?]/)[0].trim().slice(0, 40) || "My Agent"
        : "My Agent";
      const project = await projectsApi.create(org.id, projectName, data.product_description || undefined);
      // Persist so ProjectContext picks it up on dashboard
      localStorage.setItem("dottle_org_id", org.id);
      localStorage.setItem("dottle_project_id", project.id);
      setCreatedProjectId(project.id);
      return project.id;
    } catch {
      return null;
    } finally {
      setCreatingWorkspace(false);
    }
  }

  async function handleContinue() {
    // After product description step, create workspace in the background
    if (step === 0) {
      createWorkspace(); // fire-and-forget; Slack step will have the ID by then
    }
    setStep((s) => s + 1);
  }

  async function finish() {
    setSubmitting(true);
    try {
      // Ensure workspace exists
      await createWorkspace();

      await fetch(`${BASE_URL}/auth/onboarding`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });

      setDone(true);
      setTimeout(() => router.push("/"), 1800);
    } catch {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-dark-bg flex items-center justify-center">
        <div className="text-center space-y-5">
          <div className="w-20 h-20 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center mx-auto">
            <Check className="w-10 h-10 text-green-400" />
          </div>
          <h2 className="text-2xl font-semibold text-ink-primary">You're all set!</h2>
          <p className="text-base text-ink-muted">Taking you to your dashboard…</p>
        </div>
      </div>
    );
  }

  const isLast = step === STEPS.length - 1;
  const isSkippable = step > 0;

  return (
    <div className="min-h-screen bg-dark-bg flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-10 py-5 border-b border-dark-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="text-base font-bold text-ink-primary">Dottle</span>
        </div>
        {/* Step progress */}
        <div className="flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <button
                onClick={() => i < step && setStep(i)}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
                  i < step
                    ? "bg-brand-600 text-white cursor-pointer"
                    : i === step
                    ? "bg-dark-surface border-2 border-brand-500 text-brand-400"
                    : "bg-dark-surface border border-dark-border text-ink-dim cursor-default"
                }`}>
                {i < step ? <Check className="w-3.5 h-3.5" /> : i + 1}
              </button>
              {i < STEPS.length - 1 && (
                <div className={`w-8 h-px ${i < step ? "bg-brand-600" : "bg-dark-border"}`} />
              )}
            </div>
          ))}
        </div>
        <button
          onClick={() => router.push("/")}
          className="text-sm text-ink-dim hover:text-ink-muted transition-colors">
          Skip setup
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-6 py-14">
        <div className="w-full max-w-2xl bg-dark-surface border border-dark-border rounded-2xl p-10 shadow-card">
          {step === 0 && (
            <StepProductDescription
              value={data.product_description}
              onChange={(v) => patch("product_description", v)}
            />
          )}
          {step === 1 && <StepConnect />}
          {step === 2 && (
            <StepIssues
              selected={data.tracked_issues}
              onChange={(v) => patch("tracked_issues", v)}
            />
          )}
          {step === 3 && (
            <StepTeamSetup
              emails={data.invited_emails}
              onChange={(v) => patch("invited_emails", v)}
            />
          )}
          {step === 4 && (
            <StepSlack projectId={createdProjectId} />
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-10 pt-7 border-t border-dark-divider">
            <button
              onClick={() => setStep((s) => s - 1)}
              disabled={step === 0}
              className="flex items-center gap-2 text-base text-ink-muted hover:text-ink-secondary transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <div className="flex items-center gap-3">
              {isSkippable && !isLast && (
                <button
                  onClick={handleContinue}
                  className="text-base text-ink-muted hover:text-ink-secondary transition-colors px-4 py-2.5">
                  Skip
                </button>
              )}
              {isLast ? (
                <button
                  onClick={finish}
                  disabled={submitting || creatingWorkspace}
                  className="flex items-center gap-2.5 px-6 py-2.5 bg-brand-600 hover:bg-brand-500 text-white text-base font-medium rounded-xl transition-colors disabled:opacity-60">
                  {submitting ? "Setting up…" : "Finish setup"}
                  {!submitting && <Check className="w-4 h-4" />}
                </button>
              ) : (
                <button
                  onClick={handleContinue}
                  disabled={creatingWorkspace}
                  className="flex items-center gap-2.5 px-6 py-2.5 bg-brand-600 hover:bg-brand-500 text-white text-base font-medium rounded-xl transition-colors disabled:opacity-60">
                  {creatingWorkspace ? "Creating…" : "Continue"}
                  {!creatingWorkspace && <ArrowRight className="w-4 h-4" />}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
