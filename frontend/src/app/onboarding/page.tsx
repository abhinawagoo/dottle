"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  Zap, ArrowRight, ArrowLeft, Check, Plus, X,
  Slack, Bell, Users, Target, BookOpen, TrendingUp,
  AlertTriangle, ThumbsUp, ShieldOff, Brain, Flame, Frown, Ban, Laugh
} from "lucide-react";
import DottleMascot from "@/components/dottle-mascot";

// ── Types ─────────────────────────────────────────────────────────────────────

interface OnboardingData {
  product_description: string;
  tracked_issues: string[];
  slack_webhook: string;
  invited_emails: string[];
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
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-ink-primary mb-2">What does your AI product do?</h2>
        <p className="text-sm text-ink-muted">Help us personalize your monitoring and surface the right insights.</p>
      </div>
      <div>
        <textarea
          className="w-full h-36 bg-dark-raised border border-dark-border rounded-xl px-4 py-3 text-sm text-ink-primary placeholder:text-ink-dim resize-none focus:outline-none focus:border-brand-500/50 transition-colors"
          placeholder='e.g. "AI voice agent for pest control and property management — handles inbound customer calls for scheduling and billing"'
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={500}
        />
        <p className="text-[11px] text-ink-dim mt-1 text-right">{value.length}/500</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {["Customer support agent", "Voice AI for scheduling", "Coding assistant", "Research agent", "RAG chatbot", "Sales automation"].map((ex) => (
          <button key={ex} onClick={() => onChange(ex)}
            className="text-left text-xs text-ink-muted bg-dark-raised border border-dark-border rounded-lg px-3 py-2 hover:border-brand-500/40 hover:text-ink-secondary transition-colors">
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
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-ink-primary mb-2">Invite your team</h2>
        <p className="text-sm text-ink-muted">Get teammates set up so everyone can monitor and debug together.</p>
      </div>
      <div className="flex gap-2">
        <input
          type="email"
          className="flex-1 bg-dark-raised border border-dark-border rounded-xl px-4 py-2.5 text-sm text-ink-primary placeholder:text-ink-dim focus:outline-none focus:border-brand-500/50 transition-colors"
          placeholder="teammate@company.com"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addEmail()}
        />
        <button onClick={addEmail}
          className="px-4 py-2.5 bg-dark-raised border border-dark-border rounded-xl text-sm text-ink-secondary hover:text-ink-primary hover:border-brand-500/40 transition-colors">
          <Plus className="w-4 h-4" />
        </button>
      </div>
      {emails.length > 0 && (
        <div className="space-y-2">
          {emails.map((email) => (
            <div key={email} className="flex items-center justify-between bg-dark-raised border border-dark-border rounded-xl px-4 py-2.5">
              <span className="text-sm text-ink-secondary">{email}</span>
              <button onClick={() => removeEmail(email)} className="text-ink-dim hover:text-ink-secondary transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      {emails.length === 0 && (
        <div className="flex items-center gap-3 p-4 bg-dark-raised/50 border border-dark-border rounded-xl">
          <Users className="w-4 h-4 text-ink-dim flex-shrink-0" />
          <p className="text-xs text-ink-dim">Invites are sent by email. They'll join your organization when they accept.</p>
        </div>
      )}
    </div>
  );
}

function StepDailyDigest() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-ink-primary mb-2">Your daily digest</h2>
        <p className="text-sm text-ink-muted">Every morning you'll get a summary of what your AI agents did — wins, issues, and trends.</p>
      </div>
      {/* Mock digest preview */}
      <div className="bg-dark-raised border border-dark-border rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-ink-secondary">Yesterday's summary</span>
          <span className="text-[10px] text-ink-dim">Apr 18, 2026</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Sessions",  value: "1,284", delta: "+12%", up: true  },
            { label: "Failures",  value: "23",    delta: "-8%",  up: false },
            { label: "Avg cost",  value: "$0.04", delta: "+2%",  up: true  },
          ].map((m) => (
            <div key={m.label} className="bg-dark-bg rounded-lg p-3">
              <p className="text-[10px] text-ink-dim mb-1">{m.label}</p>
              <p className="text-base font-semibold text-ink-primary">{m.value}</p>
              <p className={`text-[10px] ${m.up ? "text-green-400" : "text-red-400"}`}>{m.delta} vs prev</p>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <p className="text-[11px] font-medium text-ink-secondary">Top issues</p>
          {[
            { type: "loop_detected",      count: 14, color: "bg-red-400"    },
            { type: "high_latency",       count: 8,  color: "bg-yellow-400" },
            { type: "repeated_tool_error",count: 5,  color: "bg-orange-400" },
          ].map((issue) => (
            <div key={issue.type} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full ${issue.color}`} />
                <span className="text-xs text-ink-muted">{issue.type.replace(/_/g, " ")}</span>
              </div>
              <span className="text-xs text-ink-secondary">{issue.count} sessions</span>
            </div>
          ))}
        </div>
        <div className="pt-2 border-t border-dark-divider">
          <p className="text-[10px] text-ink-dim">💡 <span className="text-ink-muted">Tip: Your pest_control agent improved response time by 340ms after the prompt update yesterday.</span></p>
        </div>
      </div>
    </div>
  );
}

function StepIssues({ selected, onChange }: { selected: string[]; onChange: (v: string[]) => void }) {
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-ink-primary mb-2">What should we watch for?</h2>
        <p className="text-sm text-ink-muted">Select the behavior patterns that matter most for your product.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {ISSUE_OPTIONS.map(({ id, label, desc, icon: Icon, color }) => {
          const active = selected.includes(id);
          return (
            <button key={id} onClick={() => toggle(id)}
              className={`text-left p-3 rounded-xl border transition-all ${
                active
                  ? "border-brand-500/60 bg-brand-600/10"
                  : "border-dark-border bg-dark-raised hover:border-dark-border/80"
              }`}>
              <div className="flex items-start gap-2.5">
                <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${active ? color : "text-ink-dim"}`} />
                <div>
                  <p className={`text-xs font-medium ${active ? "text-ink-primary" : "text-ink-secondary"}`}>{label}</p>
                  <p className="text-[10px] text-ink-dim mt-0.5 leading-relaxed">{desc}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        <button onClick={() => onChange(ISSUE_OPTIONS.map((o) => o.id))}
          className="text-xs text-brand-400 hover:text-brand-300 transition-colors">Select all</button>
        <span className="text-ink-dim text-xs">·</span>
        <button onClick={() => onChange([])}
          className="text-xs text-ink-muted hover:text-ink-secondary transition-colors">Clear</button>
        <span className="text-xs text-ink-dim ml-auto">{selected.length} selected</span>
      </div>
    </div>
  );
}

function StepSlack({ webhook, onChange }: { webhook: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-ink-primary mb-2">Get alerts in Slack</h2>
        <p className="text-sm text-ink-muted">Paste your Slack webhook URL to receive real-time notifications when issues are detected.</p>
      </div>
      <div className="flex items-center gap-3 p-4 bg-[#4A154B]/20 border border-[#4A154B]/40 rounded-xl">
        <Slack className="w-5 h-5 text-[#E01E5A] flex-shrink-0" />
        <div>
          <p className="text-sm font-medium text-ink-primary">Slack Incoming Webhook</p>
          <p className="text-[11px] text-ink-muted">Go to api.slack.com/apps → Incoming Webhooks → Add to Slack</p>
        </div>
      </div>
      <div>
        <label className="text-xs text-ink-muted block mb-1.5">Webhook URL</label>
        <input
          type="url"
          className="w-full bg-dark-raised border border-dark-border rounded-xl px-4 py-2.5 text-sm text-ink-primary placeholder:text-ink-dim focus:outline-none focus:border-brand-500/50 transition-colors"
          placeholder="https://hooks.slack.com/services/T.../B.../..."
          value={webhook}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <p className="text-xs text-ink-muted font-medium">You'll get notified for:</p>
        {["Loop detected in agent", "Failure rate spike", "High cost session (>$1)", "New critical issue"].map((item) => (
          <div key={item} className="flex items-center gap-2 text-xs text-ink-muted">
            <Check className="w-3 h-3 text-green-400 flex-shrink-0" />
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main wizard ───────────────────────────────────────────────────────────────

const STEPS = [
  { id: "product",  label: "Product",  icon: BookOpen  },
  { id: "team",     label: "Team",     icon: Users     },
  { id: "digest",   label: "Digest",   icon: TrendingUp},
  { id: "issues",   label: "Issues",   icon: Target    },
  { id: "slack",    label: "Slack",    icon: Bell      },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { token } = useAuth();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const [data, setData] = useState<OnboardingData>({
    product_description: "",
    tracked_issues: [],
    slack_webhook: "",
    invited_emails: [],
  });

  function patch<K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  async function finish() {
    setSubmitting(true);
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1"}/auth/onboarding`, {
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
        <div className="text-center space-y-2">
          <DottleMascot variant="happy" size={260} />
          <h2 className="text-xl font-semibold text-ink-primary">You're all set!</h2>
          <p className="text-sm text-ink-muted">Taking you to your dashboard…</p>
        </div>
      </div>
    );
  }

  const isLast = step === STEPS.length - 1;
  const isSkippable = step > 0; // step 0 (product description) is the most important

  return (
    <div className="min-h-screen bg-dark-bg flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-dark-border">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center">
            <Zap className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-sm font-bold text-ink-primary">Dottle</span>
        </div>
        <div className="flex items-center gap-1.5">
          {STEPS.map((s, i) => (
            <div key={s.id} className={`flex items-center gap-1.5`}>
              <button
                onClick={() => i < step && setStep(i)}
                className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-medium transition-all ${
                  i < step
                    ? "bg-brand-600 text-white cursor-pointer"
                    : i === step
                    ? "bg-dark-surface border-2 border-brand-500 text-brand-400"
                    : "bg-dark-surface border border-dark-border text-ink-dim cursor-default"
                }`}>
                {i < step ? <Check className="w-3 h-3" /> : i + 1}
              </button>
              {i < STEPS.length - 1 && (
                <div className={`w-6 h-px ${i < step ? "bg-brand-600" : "bg-dark-border"}`} />
              )}
            </div>
          ))}
        </div>
        <button
          onClick={() => router.push("/")}
          className="text-xs text-ink-dim hover:text-ink-muted transition-colors">
          Skip setup
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg bg-dark-surface border border-dark-border rounded-2xl p-8 shadow-card">
          {step === 0 && (
            <StepProductDescription
              value={data.product_description}
              onChange={(v) => patch("product_description", v)}
            />
          )}
          {step === 1 && (
            <StepTeamSetup
              emails={data.invited_emails}
              onChange={(v) => patch("invited_emails", v)}
            />
          )}
          {step === 2 && <StepDailyDigest />}
          {step === 3 && (
            <StepIssues
              selected={data.tracked_issues}
              onChange={(v) => patch("tracked_issues", v)}
            />
          )}
          {step === 4 && (
            <StepSlack
              webhook={data.slack_webhook}
              onChange={(v) => patch("slack_webhook", v)}
            />
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-dark-divider">
            <button
              onClick={() => setStep((s) => s - 1)}
              disabled={step === 0}
              className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink-secondary transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>
            <div className="flex items-center gap-2">
              {isSkippable && !isLast && (
                <button
                  onClick={() => setStep((s) => s + 1)}
                  className="text-sm text-ink-muted hover:text-ink-secondary transition-colors px-3 py-2">
                  Skip
                </button>
              )}
              {isLast ? (
                <button
                  onClick={finish}
                  disabled={submitting}
                  className="flex items-center gap-2 px-5 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-60">
                  {submitting ? "Saving…" : "Finish setup"}
                  {!submitting && <Check className="w-3.5 h-3.5" />}
                </button>
              ) : (
                <button
                  onClick={() => setStep((s) => s + 1)}
                  className="flex items-center gap-2 px-5 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-xl transition-colors">
                  Continue <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
