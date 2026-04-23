"use client";
import { useState } from "react";
import { clsx } from "clsx";
import { Check, Copy, X, ArrowRight, ChevronLeft, Zap, Terminal, ExternalLink } from "lucide-react";
import { generatePrompt, WizardAnswers } from "@/lib/prompt-generator";

// ── Step definitions ──────────────────────────────────────────────────────────

type StepId = "language" | "framework" | "llm" | "agent_type" | "tools" | "context" | "result";

interface Step {
  id: StepId;
  question: string;
  sub?: string;
}

const STEPS: Step[] = [
  { id: "language",   question: "What language is your agent written in?" },
  { id: "framework",  question: "Which AI framework are you using?",      sub: "Pick the closest match — we'll adapt the instrumentation." },
  { id: "llm",        question: "Which LLM provider(s)?",                sub: "Select all that apply." },
  { id: "agent_type", question: "What kind of agent is it?" },
  { id: "tools",      question: "What tools does your agent use?",        sub: "Select all that apply. Skip if unsure." },
  { id: "context",    question: "Paste any details about your agent",     sub: "Optional but makes the prompt smarter. README, agent description, file structure — anything helps." },
];

// ── Option configs ────────────────────────────────────────────────────────────

const LANGUAGE_OPTIONS = [
  { value: "python",     label: "Python",               emoji: "🐍" },
  { value: "typescript", label: "TypeScript",            emoji: "🔷" },
  { value: "javascript", label: "JavaScript",            emoji: "🟡" },
  { value: "other",      label: "Other",                 emoji: "🔧" },
];

const FRAMEWORK_OPTIONS = [
  { value: "langchain",  label: "LangChain",             emoji: "🦜" },
  { value: "llamaindex", label: "LlamaIndex",            emoji: "🦙" },
  { value: "crewai",     label: "CrewAI",                emoji: "🤝" },
  { value: "autogen",    label: "AutoGen",               emoji: "🤖" },
  { value: "openai",     label: "Raw OpenAI API",        emoji: "⚡" },
  { value: "anthropic",  label: "Raw Anthropic API",     emoji: "🔮" },
  { value: "other",      label: "Custom / Other",        emoji: "🔧" },
];

const LLM_OPTIONS = [
  { value: "openai",    label: "OpenAI (GPT-4, GPT-4o)" },
  { value: "anthropic", label: "Anthropic (Claude)"      },
  { value: "google",    label: "Google (Gemini)"         },
  { value: "azure",     label: "Azure OpenAI"            },
  { value: "mistral",   label: "Mistral"                 },
  { value: "local",     label: "Local / Ollama"          },
  { value: "other",     label: "Other"                   },
];

const AGENT_TYPE_OPTIONS = [
  { value: "single",   label: "Single agent",              desc: "One agent, one goal" },
  { value: "multi",    label: "Multi-agent system",        desc: "Agents coordinating with each other" },
  { value: "rag",      label: "RAG / document Q&A",        desc: "Retrieval-augmented generation" },
  { value: "workflow", label: "Workflow / pipeline",       desc: "Sequential or DAG-based steps" },
  { value: "chatbot",  label: "Chatbot",                   desc: "Conversational with message history" },
];

const TOOL_OPTIONS = [
  { value: "web_search",     label: "Web search",         desc: "Tavily, SerpAPI, Exa, Bing" },
  { value: "database",       label: "Database queries",   desc: "SQL, MongoDB, Supabase" },
  { value: "file_system",    label: "File system",        desc: "Read/write local files" },
  { value: "external_apis",  label: "External APIs",      desc: "HTTP calls to third-party services" },
  { value: "code_execution", label: "Code execution",     desc: "Python REPL, subprocess" },
  { value: "email_slack",    label: "Email / messaging",  desc: "Slack, email, webhooks" },
];

// ── Small reusable components ─────────────────────────────────────────────────

function OptionButton({ selected, onClick, children, className }: {
  selected?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "w-full text-left px-4 py-3 rounded-xl border transition-all duration-100 flex items-center gap-3",
        selected
          ? "border-brand-500 bg-brand-500/10 text-ink-primary"
          : "border-dark-border bg-dark-raised text-ink-secondary hover:border-dark-divider hover:bg-dark-raised/80",
        className,
      )}
    >
      {children}
      {selected && <Check className="w-4 h-4 text-brand-400 shrink-0 ml-auto" />}
    </button>
  );
}

function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={clsx(
            "h-1 rounded-full transition-all duration-300",
            i < current ? "w-6 bg-brand-500" : i === current ? "w-4 bg-brand-400" : "w-2 bg-dark-border",
          )}
        />
      ))}
    </div>
  );
}

// ── Main Wizard ───────────────────────────────────────────────────────────────

interface Props {
  apiKey: string;
  onClose: () => void;
}

export default function InstrumentWizard({ apiKey, onClose }: Props) {
  const [stepIdx, setStepIdx] = useState(0);
  const [answers, setAnswers] = useState<Partial<WizardAnswers>>({
    llm_providers: [],
    tool_types: [],
    codebase_context: "",
  });
  const [copied, setCopied] = useState(false);
  const [direction, setDirection] = useState<"forward" | "back">("forward");

  const step = STEPS[stepIdx];
  const isResult = stepIdx === STEPS.length;

  function next() {
    setDirection("forward");
    setStepIdx(i => i + 1);
  }
  function back() {
    setDirection("back");
    setStepIdx(i => i - 1);
  }

  function setSingle(key: keyof WizardAnswers, val: string) {
    setAnswers(a => ({ ...a, [key]: val }));
  }

  function toggleMulti(key: "llm_providers" | "tool_types", val: string) {
    setAnswers(a => {
      const arr = (a[key] ?? []) as string[];
      return {
        ...a,
        [key]: arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val],
      };
    });
  }

  function canAdvance(): boolean {
    if (step?.id === "language")   return !!answers.language;
    if (step?.id === "framework")  return !!answers.framework;
    if (step?.id === "llm")        return (answers.llm_providers?.length ?? 0) > 0;
    if (step?.id === "agent_type") return !!answers.agent_type;
    if (step?.id === "tools")      return true; // optional
    if (step?.id === "context")    return true; // optional
    return true;
  }

  const prompt = isResult ? generatePrompt(answers as WizardAnswers, apiKey) : "";

  function copyPrompt() {
    navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    /* Backdrop */
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-xl bg-dark-surface border border-dark-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-dark-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md bg-brand-600 flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-[13px] font-semibold text-ink-primary">
              {isResult ? "Your instrumentation prompt" : "Auto-Instrument Setup"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {!isResult && <ProgressDots current={stepIdx} total={STEPS.length} />}
            <button onClick={onClose} className="text-ink-dim hover:text-ink-muted transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {!isResult ? (
            <div className="px-6 py-6 space-y-5">
              {/* Question */}
              <div>
                <h2 className="text-[18px] font-semibold text-ink-primary leading-snug">{step.question}</h2>
                {step.sub && <p className="text-[12px] text-ink-muted mt-1">{step.sub}</p>}
              </div>

              {/* Step-specific UI */}
              {step.id === "language" && (
                <div className="grid grid-cols-2 gap-2">
                  {LANGUAGE_OPTIONS.map(opt => (
                    <OptionButton
                      key={opt.value}
                      selected={answers.language === opt.value}
                      onClick={() => { setSingle("language", opt.value); }}
                    >
                      <span className="text-lg">{opt.emoji}</span>
                      <span className="text-[13px] font-medium">{opt.label}</span>
                    </OptionButton>
                  ))}
                </div>
              )}

              {step.id === "framework" && (
                <div className="space-y-2">
                  {FRAMEWORK_OPTIONS.map(opt => (
                    <OptionButton
                      key={opt.value}
                      selected={answers.framework === opt.value}
                      onClick={() => setSingle("framework", opt.value)}
                    >
                      <span className="text-lg w-6 text-center">{opt.emoji}</span>
                      <span className="text-[13px] font-medium">{opt.label}</span>
                    </OptionButton>
                  ))}
                </div>
              )}

              {step.id === "llm" && (
                <div className="space-y-2">
                  {LLM_OPTIONS.map(opt => {
                    const selected = (answers.llm_providers ?? []).includes(opt.value);
                    return (
                      <OptionButton
                        key={opt.value}
                        selected={selected}
                        onClick={() => toggleMulti("llm_providers", opt.value)}
                      >
                        <span className="text-[13px] font-medium flex-1">{opt.label}</span>
                      </OptionButton>
                    );
                  })}
                </div>
              )}

              {step.id === "agent_type" && (
                <div className="space-y-2">
                  {AGENT_TYPE_OPTIONS.map(opt => (
                    <OptionButton
                      key={opt.value}
                      selected={answers.agent_type === opt.value}
                      onClick={() => setSingle("agent_type", opt.value)}
                    >
                      <div className="flex-1">
                        <p className="text-[13px] font-medium">{opt.label}</p>
                        <p className="text-[11px] text-ink-dim mt-0.5">{opt.desc}</p>
                      </div>
                    </OptionButton>
                  ))}
                </div>
              )}

              {step.id === "tools" && (
                <div className="space-y-2">
                  {TOOL_OPTIONS.map(opt => {
                    const selected = (answers.tool_types ?? []).includes(opt.value);
                    return (
                      <OptionButton
                        key={opt.value}
                        selected={selected}
                        onClick={() => toggleMulti("tool_types", opt.value)}
                      >
                        <div className="flex-1">
                          <p className="text-[13px] font-medium">{opt.label}</p>
                          <p className="text-[11px] text-ink-dim mt-0.5">{opt.desc}</p>
                        </div>
                      </OptionButton>
                    );
                  })}
                </div>
              )}

              {step.id === "context" && (
                <textarea
                  className="w-full h-40 bg-dark-bg border border-dark-border rounded-xl px-4 py-3 text-[12px] font-mono text-ink-secondary placeholder-ink-dim resize-none focus:outline-none focus:border-brand-500/50 transition-colors"
                  placeholder={`Paste anything helpful:\n• Your README or agent description\n• A list of your main files and what they do\n• How your multi-agent system is structured\n• What APIs / tools your agent calls\n\nOr skip — the prompt will still work.`}
                  value={answers.codebase_context ?? ""}
                  onChange={e => setAnswers(a => ({ ...a, codebase_context: e.target.value }))}
                />
              )}
            </div>
          ) : (
            /* Result screen */
            <div className="px-6 py-6 space-y-4">
              {/* Success header */}
              <div className="flex items-start gap-3 p-3.5 rounded-xl bg-green-500/5 border border-green-500/20">
                <Check className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[13px] font-semibold text-green-300">Your prompt is ready</p>
                  <p className="text-[11px] text-ink-muted mt-0.5">
                    Copy it and paste into Claude Code, Cursor, or Codex — it will read your codebase and add Dottle automatically.
                  </p>
                </div>
              </div>

              {/* Where to paste */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Claude Code", cmd: "claude" },
                  { label: "Cursor", cmd: "Ctrl+L" },
                  { label: "Codex CLI", cmd: "codex" },
                ].map(tool => (
                  <div key={tool.label} className="flex flex-col items-center gap-1 py-2.5 px-3 rounded-xl bg-dark-raised border border-dark-border text-center">
                    <Terminal className="w-4 h-4 text-ink-dim" />
                    <p className="text-[11px] font-medium text-ink-secondary">{tool.label}</p>
                    <code className="text-[9px] text-ink-dim font-mono">{tool.cmd}</code>
                  </div>
                ))}
              </div>

              {/* Prompt box */}
              <div className="relative">
                <pre className="bg-dark-bg border border-dark-border rounded-xl p-4 text-[10.5px] font-mono text-ink-secondary overflow-auto max-h-64 leading-relaxed whitespace-pre-wrap">
                  {prompt}
                </pre>
                <button
                  onClick={copyPrompt}
                  className={clsx(
                    "absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all",
                    copied
                      ? "bg-green-500/15 text-green-400 border border-green-500/30"
                      : "bg-dark-raised border border-dark-border text-ink-muted hover:text-ink-secondary",
                  )}
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>

              {/* Tip */}
              <p className="text-[11px] text-ink-dim text-center">
                After integrating, your sessions will appear in{" "}
                <a href="/sessions" className="text-brand-400 hover:underline">the dashboard</a>.
                Run with <code className="text-ink-muted">debug=True</code> to verify spans are being sent.
              </p>
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-dark-border shrink-0">
          {!isResult ? (
            <>
              <button
                onClick={stepIdx === 0 ? onClose : back}
                className="flex items-center gap-1.5 text-[12px] text-ink-muted hover:text-ink-secondary transition-colors"
              >
                {stepIdx > 0 && <ChevronLeft className="w-4 h-4" />}
                {stepIdx === 0 ? "Cancel" : "Back"}
              </button>
              <button
                onClick={next}
                disabled={!canAdvance()}
                className={clsx(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold transition-all",
                  canAdvance()
                    ? "bg-brand-600 text-white hover:bg-brand-500"
                    : "bg-dark-raised text-ink-dim cursor-not-allowed border border-dark-border",
                )}
              >
                {stepIdx === STEPS.length - 1 ? "Generate prompt" : "Next"}
                <ArrowRight className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <button onClick={() => { setStepIdx(0); setAnswers({ llm_providers: [], tool_types: [], codebase_context: "" }); }}
                className="text-[12px] text-ink-muted hover:text-ink-secondary transition-colors">
                Start over
              </button>
              <button
                onClick={copyPrompt}
                className={clsx(
                  "flex items-center gap-2 px-5 py-2 rounded-lg text-[13px] font-semibold transition-all",
                  copied
                    ? "bg-green-500/15 text-green-400 border border-green-500/30"
                    : "bg-brand-600 text-white hover:bg-brand-500",
                )}
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? "Copied to clipboard!" : "Copy prompt"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
