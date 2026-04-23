"use client";
import { useState } from "react";
import { clsx } from "clsx";
import { Check, Copy, X, ArrowRight, ChevronLeft, Zap, Terminal, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { generatePrompt, WizardAnswers } from "@/lib/prompt-generator";
import { onboardingApi } from "@/lib/api";

// ── Step definitions ──────────────────────────────────────────────────────────

type StepId = "language" | "framework" | "llm" | "agent_type" | "tools" | "context" | "result";

interface Step {
  id: StepId;
  question: string;
  sub?: string;
}

const STEPS: Step[] = [
  { id: "language",   question: "What language is your agent written in?" },
  { id: "framework",  question: "Which AI framework are you using?",
    sub: "Pick the closest match. If yours isn't listed, choose 'Other' and describe it." },
  { id: "llm",        question: "Which LLM provider(s) or models?",
    sub: "Select all that apply. Include custom or self-hosted models." },
  { id: "agent_type", question: "What kind of agent is it?" },
  { id: "tools",      question: "What tools does your agent use?",
    sub: "Select all that apply. Skip if unsure — add custom ones in the field below." },
  { id: "context",    question: "Tell us more about your agent",
    sub: "Optional but makes the prompt much smarter. Paste README, file list, agent description, or how it's structured." },
];

// ── Option configs ────────────────────────────────────────────────────────────

const LANGUAGE_OPTIONS = [
  { value: "python",     label: "Python",         emoji: "🐍" },
  { value: "typescript", label: "TypeScript",      emoji: "🔷" },
  { value: "javascript", label: "JavaScript",      emoji: "🟡" },
  { value: "go",         label: "Go",              emoji: "🐹" },
  { value: "rust",       label: "Rust",            emoji: "🦀" },
  { value: "java",       label: "Java / Kotlin",   emoji: "☕" },
  { value: "custom",     label: "Other",           emoji: "🔧" },
];

const FRAMEWORK_OPTIONS = [
  // Popular
  { value: "langchain",      label: "LangChain",          emoji: "🦜", category: "popular" },
  { value: "llamaindex",     label: "LlamaIndex",         emoji: "🦙", category: "popular" },
  { value: "crewai",         label: "CrewAI",             emoji: "🤝", category: "popular" },
  { value: "autogen",        label: "AutoGen / AG2",      emoji: "🤖", category: "popular" },
  { value: "openai",         label: "Raw OpenAI API",     emoji: "⚡", category: "popular" },
  { value: "anthropic",      label: "Raw Anthropic API",  emoji: "🔮", category: "popular" },
  // Newer
  { value: "agno",           label: "Agno (Phidata)",     emoji: "🧠", category: "newer" },
  { value: "pydantic_ai",    label: "Pydantic AI",        emoji: "🐍", category: "newer" },
  { value: "smolagents",     label: "Smolagents (HF)",    emoji: "🤗", category: "newer" },
  { value: "vercel_ai",      label: "Vercel AI SDK",      emoji: "▲",  category: "newer" },
  { value: "mastra",         label: "Mastra",             emoji: "🌀", category: "newer" },
  { value: "haystack",       label: "Haystack",           emoji: "🌾", category: "newer" },
  { value: "dspy",           label: "DSPy",               emoji: "📐", category: "newer" },
  { value: "semantic_kernel",label: "Semantic Kernel",    emoji: "🔵", category: "newer" },
  { value: "dify",           label: "Dify / Flowise",     emoji: "🎨", category: "newer" },
  { value: "other",          label: "Custom / Other",     emoji: "🔧", category: "other" },
];

const LLM_OPTIONS = [
  { value: "openai",       label: "OpenAI (GPT-4o, o1, o3)" },
  { value: "anthropic",    label: "Anthropic (Claude 3/4)"  },
  { value: "google",       label: "Google (Gemini)"          },
  { value: "groq",         label: "Groq"                     },
  { value: "together",     label: "Together AI"              },
  { value: "fireworks",    label: "Fireworks AI"             },
  { value: "cohere",       label: "Cohere"                   },
  { value: "azure",        label: "Azure OpenAI"             },
  { value: "bedrock",      label: "AWS Bedrock"              },
  { value: "mistral",      label: "Mistral"                  },
  { value: "xai",          label: "xAI (Grok)"               },
  { value: "deepseek",     label: "DeepSeek"                 },
  { value: "ollama",       label: "Ollama / Local / vLLM"    },
  { value: "huggingface",  label: "Hugging Face"             },
  { value: "custom",       label: "Other / Custom model"     },
];

const AGENT_TYPE_OPTIONS = [
  { value: "single",   label: "Single agent",           desc: "One agent, one goal" },
  { value: "multi",    label: "Multi-agent system",     desc: "Agents coordinating with each other" },
  { value: "rag",      label: "RAG / document Q&A",     desc: "Retrieval-augmented generation" },
  { value: "workflow", label: "Workflow / pipeline",    desc: "Sequential or DAG-based steps" },
  { value: "chatbot",  label: "Chatbot",                desc: "Conversational with message history" },
  { value: "voice",    label: "Voice agent",            desc: "Speech-to-speech or STT/TTS pipeline" },
  { value: "code",     label: "Coding agent",           desc: "Writes, edits, or reviews code" },
  { value: "custom",   label: "Other / Custom",         desc: "Describe yours below" },
];

const TOOL_OPTIONS = [
  { value: "web_search",     label: "Web search",         desc: "Tavily, SerpAPI, Exa, Bing" },
  { value: "database",       label: "Database queries",   desc: "SQL, Postgres, MongoDB" },
  { value: "vector_db",      label: "Vector database",    desc: "Pinecone, Qdrant, Weaviate, pgvector" },
  { value: "file_system",    label: "File system",        desc: "Read/write local files" },
  { value: "browser",        label: "Browser / scraping", desc: "Playwright, Puppeteer, Stagehand" },
  { value: "external_apis",  label: "External APIs",      desc: "HTTP calls to third-party services" },
  { value: "code_execution", label: "Code execution",     desc: "Python REPL, E2B sandbox, subprocess" },
  { value: "email_slack",    label: "Email / messaging",  desc: "Slack, email, Discord, webhooks" },
  { value: "memory",         label: "Memory / knowledge", desc: "Mem0, knowledge graphs, long-term memory" },
  { value: "computer_use",   label: "Computer use",       desc: "GUI automation, desktop control" },
];

// ── Small reusable components ─────────────────────────────────────────────────

function OptionButton({ selected, onClick, children, small }: {
  selected?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  small?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "w-full text-left rounded-xl border transition-all duration-100 flex items-center gap-3",
        small ? "px-3 py-2.5" : "px-4 py-3",
        selected
          ? "border-brand-500 bg-brand-500/10 text-ink-primary"
          : "border-dark-border bg-dark-raised text-ink-secondary hover:border-dark-divider hover:bg-dark-raised/80",
      )}
    >
      {children}
      {selected && <Check className="w-4 h-4 text-brand-400 shrink-0 ml-auto" />}
    </button>
  );
}

function CustomInput({ placeholder, value, onChange }: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="text"
      placeholder={placeholder}
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full bg-dark-bg border border-brand-500/40 rounded-xl px-4 py-2.5 text-[13px] text-ink-primary placeholder-ink-dim focus:outline-none focus:border-brand-500/70 transition-colors"
      autoFocus
    />
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

// ── Answers state type ────────────────────────────────────────────────────────

interface Answers {
  language: string;
  custom_language: string;
  framework: string;
  custom_framework: string;
  llm_providers: string[];
  custom_llm: string;
  agent_type: string;
  custom_agent_type: string;
  tool_types: string[];
  custom_tools: string;
  codebase_context: string;
}

const BLANK_ANSWERS: Answers = {
  language: "",
  custom_language: "",
  framework: "",
  custom_framework: "",
  llm_providers: [],
  custom_llm: "",
  agent_type: "",
  custom_agent_type: "",
  tool_types: [],
  custom_tools: "",
  codebase_context: "",
};

// ── Main Wizard ───────────────────────────────────────────────────────────────

interface Props {
  apiKey: string;
  onClose: () => void;
}

export default function InstrumentWizard({ apiKey, onClose }: Props) {
  const [stepIdx, setStepIdx] = useState(0);
  const [answers, setAnswers] = useState<Answers>({ ...BLANK_ANSWERS });
  const [copied, setCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedPrompt, setGeneratedPrompt] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);

  const step = STEPS[stepIdx];
  const isResult = stepIdx === STEPS.length;

  function next() { setStepIdx(i => i + 1); }
  function back() { setStepIdx(i => i - 1); }

  function setSingle(key: keyof Answers, val: string) {
    setAnswers(a => ({ ...a, [key]: val }));
  }

  function toggleMulti(key: "llm_providers" | "tool_types", val: string) {
    setAnswers(a => {
      const arr = a[key];
      return { ...a, [key]: arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val] };
    });
  }

  function canAdvance(): boolean {
    if (step?.id === "language")   return !!answers.language && (answers.language !== "custom" || !!answers.custom_language.trim());
    if (step?.id === "framework")  return !!answers.framework && (answers.framework !== "other" || !!answers.custom_framework.trim());
    if (step?.id === "llm")        return answers.llm_providers.length > 0 || !!answers.custom_llm.trim();
    if (step?.id === "agent_type") return !!answers.agent_type && (answers.agent_type !== "custom" || !!answers.custom_agent_type.trim());
    if (step?.id === "tools")      return true;
    if (step?.id === "context")    return true;
    return true;
  }

  async function generate() {
    setIsGenerating(true);
    setGenError(null);
    try {
      const result = await onboardingApi.generatePrompt({
        language: answers.language,
        custom_language: answers.custom_language,
        framework: answers.framework,
        custom_framework: answers.custom_framework,
        llm_providers: answers.llm_providers,
        custom_llm: answers.custom_llm,
        agent_type: answers.agent_type,
        custom_agent_type: answers.custom_agent_type,
        tool_types: answers.tool_types,
        custom_tools: answers.custom_tools,
        codebase_context: answers.codebase_context,
      }, apiKey || "YOUR_API_KEY");
      setGeneratedPrompt(result.prompt);
      next();
    } catch {
      // Fall back to static template
      const fallbackAnswers: WizardAnswers = {
        language: (answers.language === "custom" ? "other" : answers.language) as WizardAnswers["language"],
        framework: (answers.framework === "other" ? "other" : answers.framework) as WizardAnswers["framework"],
        llm_providers: answers.llm_providers,
        agent_type: (answers.agent_type === "custom" ? "single" : answers.agent_type) as WizardAnswers["agent_type"],
        tool_types: answers.tool_types,
        codebase_context: answers.codebase_context,
      };
      setGeneratedPrompt(generatePrompt(fallbackAnswers, apiKey || "YOUR_API_KEY"));
      setGenError("AI generation unavailable — showing template prompt instead.");
      next();
    } finally {
      setIsGenerating(false);
    }
  }

  const prompt = generatedPrompt ?? "";

  function copyPrompt() {
    navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  function restart() {
    setStepIdx(0);
    setAnswers({ ...BLANK_ANSWERS });
    setGeneratedPrompt(null);
    setGenError(null);
  }

  // Separate popular and newer frameworks
  const popularFrameworks = FRAMEWORK_OPTIONS.filter(f => f.category === "popular");
  const newerFrameworks = FRAMEWORK_OPTIONS.filter(f => f.category === "newer" || f.category === "other");

  return (
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

          {/* ── Loading screen ── */}
          {isGenerating && (
            <div className="flex flex-col items-center justify-center py-16 px-6 gap-4">
              <div className="relative">
                <div className="w-12 h-12 rounded-full bg-brand-600/15 border border-brand-500/30 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-brand-400" />
                </div>
                <Loader2 className="w-12 h-12 text-brand-500/30 animate-spin absolute inset-0" />
              </div>
              <div className="text-center">
                <p className="text-[14px] font-semibold text-ink-primary">Generating your prompt</p>
                <p className="text-[12px] text-ink-muted mt-1">AI is analyzing your stack and writing tailored instrumentation…</p>
              </div>
            </div>
          )}

          {/* ── Question steps ── */}
          {!isGenerating && !isResult && (
            <div className="px-6 py-6 space-y-5">
              <div>
                <h2 className="text-[18px] font-semibold text-ink-primary leading-snug">{step.question}</h2>
                {step.sub && <p className="text-[12px] text-ink-muted mt-1">{step.sub}</p>}
              </div>

              {/* Language */}
              {step.id === "language" && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    {LANGUAGE_OPTIONS.map(opt => (
                      <OptionButton
                        key={opt.value}
                        selected={answers.language === opt.value}
                        onClick={() => setSingle("language", opt.value)}
                      >
                        <span className="text-lg">{opt.emoji}</span>
                        <span className="text-[13px] font-medium">{opt.label}</span>
                      </OptionButton>
                    ))}
                  </div>
                  {answers.language === "custom" && (
                    <CustomInput
                      placeholder="e.g. Ruby, Swift, C#, Elixir…"
                      value={answers.custom_language}
                      onChange={v => setSingle("custom_language", v)}
                    />
                  )}
                </div>
              )}

              {/* Framework */}
              {step.id === "framework" && (
                <div className="space-y-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-dim">Popular</p>
                  <div className="space-y-1.5">
                    {popularFrameworks.map(opt => (
                      <OptionButton key={opt.value} small selected={answers.framework === opt.value}
                        onClick={() => setSingle("framework", opt.value)}>
                        <span className="text-base w-5 text-center">{opt.emoji}</span>
                        <span className="text-[13px] font-medium">{opt.label}</span>
                      </OptionButton>
                    ))}
                  </div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-dim pt-1">Other frameworks</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {newerFrameworks.map(opt => (
                      <OptionButton key={opt.value} small selected={answers.framework === opt.value}
                        onClick={() => setSingle("framework", opt.value)}>
                        <span className="text-sm w-4 text-center">{opt.emoji}</span>
                        <span className="text-[12px] font-medium">{opt.label}</span>
                      </OptionButton>
                    ))}
                  </div>
                  {answers.framework === "other" && (
                    <CustomInput
                      placeholder="e.g. OpenClaw, Hermes, LangGraph, my own framework…"
                      value={answers.custom_framework}
                      onChange={v => setSingle("custom_framework", v)}
                    />
                  )}
                </div>
              )}

              {/* LLM providers */}
              {step.id === "llm" && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-1.5">
                    {LLM_OPTIONS.filter(o => o.value !== "custom").map(opt => {
                      const selected = answers.llm_providers.includes(opt.value);
                      return (
                        <OptionButton key={opt.value} small selected={selected}
                          onClick={() => toggleMulti("llm_providers", opt.value)}>
                          <span className="text-[12px] font-medium flex-1">{opt.label}</span>
                        </OptionButton>
                      );
                    })}
                  </div>
                  <CustomInput
                    placeholder="Custom model / provider (e.g. Hermes-3, Qwen, DeepSeek-R1, vLLM…)"
                    value={answers.custom_llm}
                    onChange={v => setSingle("custom_llm", v)}
                  />
                </div>
              )}

              {/* Agent type */}
              {step.id === "agent_type" && (
                <div className="space-y-1.5">
                  {AGENT_TYPE_OPTIONS.map(opt => (
                    <OptionButton key={opt.value} selected={answers.agent_type === opt.value}
                      onClick={() => setSingle("agent_type", opt.value)}>
                      <div className="flex-1">
                        <p className="text-[13px] font-medium">{opt.label}</p>
                        <p className="text-[11px] text-ink-dim mt-0.5">{opt.desc}</p>
                      </div>
                    </OptionButton>
                  ))}
                  {answers.agent_type === "custom" && (
                    <CustomInput
                      placeholder="Describe your agent type…"
                      value={answers.custom_agent_type}
                      onChange={v => setSingle("custom_agent_type", v)}
                    />
                  )}
                </div>
              )}

              {/* Tools */}
              {step.id === "tools" && (
                <div className="space-y-2">
                  <div className="space-y-1.5">
                    {TOOL_OPTIONS.map(opt => {
                      const selected = answers.tool_types.includes(opt.value);
                      return (
                        <OptionButton key={opt.value} small selected={selected}
                          onClick={() => toggleMulti("tool_types", opt.value)}>
                          <div className="flex-1">
                            <p className="text-[13px] font-medium">{opt.label}</p>
                            <p className="text-[11px] text-ink-dim">{opt.desc}</p>
                          </div>
                        </OptionButton>
                      );
                    })}
                  </div>
                  <CustomInput
                    placeholder="Other tools (e.g. Stripe API, SendGrid, custom MCP server, Notion…)"
                    value={answers.custom_tools}
                    onChange={v => setSingle("custom_tools", v)}
                  />
                </div>
              )}

              {/* Context */}
              {step.id === "context" && (
                <div className="space-y-3">
                  <textarea
                    className="w-full h-44 bg-dark-bg border border-dark-border rounded-xl px-4 py-3 text-[12px] font-mono text-ink-secondary placeholder-ink-dim resize-none focus:outline-none focus:border-brand-500/50 transition-colors"
                    placeholder={`Paste anything helpful:\n• README or agent description\n• Main file names and what they do\n• How your multi-agent system is structured\n• What APIs / databases / tools you call\n• Any unusual patterns or entry points\n\nOr skip — the AI will still generate a useful prompt.`}
                    value={answers.codebase_context}
                    onChange={e => setSingle("codebase_context", e.target.value)}
                  />
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-brand-500/5 border border-brand-500/15">
                    <Sparkles className="w-3.5 h-3.5 text-brand-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-ink-muted">
                      The more context you add, the more specific the AI prompt — it will reference your actual file names,
                      method names, and patterns instead of generic examples.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Result screen ── */}
          {!isGenerating && isResult && (
            <div className="px-6 py-6 space-y-4">

              {genError ? (
                <div className="flex items-start gap-3 p-3.5 rounded-xl bg-yellow-500/5 border border-yellow-500/20">
                  <span className="text-yellow-400 shrink-0 mt-0.5 text-sm">⚠</span>
                  <p className="text-[12px] text-yellow-300">{genError}</p>
                </div>
              ) : (
                <div className="flex items-start gap-3 p-3.5 rounded-xl bg-green-500/5 border border-green-500/20">
                  <Check className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[13px] font-semibold text-green-300">AI-generated — tailored to your stack</p>
                    <p className="text-[11px] text-ink-muted mt-0.5">
                      Paste this into Claude Code, Cursor, or any AI coding tool. It will read your codebase and add Dottle automatically.
                    </p>
                  </div>
                </div>
              )}

              {/* Where to paste */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Claude Code", cmd: "claude" },
                  { label: "Cursor",      cmd: "Ctrl+L" },
                  { label: "Codex CLI",   cmd: "codex"  },
                ].map(tool => (
                  <div key={tool.label}
                    className="flex flex-col items-center gap-1 py-2.5 px-3 rounded-xl bg-dark-raised border border-dark-border text-center">
                    <Terminal className="w-4 h-4 text-ink-dim" />
                    <p className="text-[11px] font-medium text-ink-secondary">{tool.label}</p>
                    <code className="text-[9px] text-ink-dim font-mono">{tool.cmd}</code>
                  </div>
                ))}
              </div>

              {/* Prompt */}
              <div className="relative">
                <pre className="bg-dark-bg border border-dark-border rounded-xl p-4 text-[10.5px] font-mono text-ink-secondary overflow-auto max-h-72 leading-relaxed whitespace-pre-wrap">
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

              <p className="text-[11px] text-ink-dim text-center">
                After integrating, sessions appear in{" "}
                <a href="/sessions" className="text-brand-400 hover:underline">the dashboard</a>.
                Run with <code className="text-ink-muted">debug=True</code> to verify spans are sent.
              </p>
            </div>
          )}
        </div>

        {/* Footer nav */}
        {!isGenerating && (
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
                  onClick={stepIdx === STEPS.length - 1 ? generate : next}
                  disabled={!canAdvance()}
                  className={clsx(
                    "flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold transition-all",
                    canAdvance()
                      ? "bg-brand-600 text-white hover:bg-brand-500"
                      : "bg-dark-raised text-ink-dim cursor-not-allowed border border-dark-border",
                  )}
                >
                  {stepIdx === STEPS.length - 1 ? (
                    <><Sparkles className="w-4 h-4" />Generate with AI</>
                  ) : (
                    <>Next<ArrowRight className="w-4 h-4" /></>
                  )}
                </button>
              </>
            ) : (
              <>
                <button onClick={restart}
                  className="flex items-center gap-1.5 text-[12px] text-ink-muted hover:text-ink-secondary transition-colors">
                  <RotateCcw className="w-3.5 h-3.5" />
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
        )}
      </div>
    </div>
  );
}
