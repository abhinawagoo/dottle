"use client";
/**
 * ModelPicker — reusable model selector that reads the org's configured providers.
 *
 * - Shows models grouped by provider with logos
 * - Marks unconfigured providers as disabled/greyed
 * - "Add provider" CTA at the bottom when nothing is configured
 *
 * Usage:
 *   <ModelPicker orgId={orgId} value={model} onChange={setModel} />
 */
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Plus, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

// ── Provider metadata ──────────────────────────────────────────────────────

export interface ProviderMeta {
  label: string;
  color: string;       // badge bg
  textColor: string;   // badge text
  Logo: React.FC<{ size?: number }>;
}

// Simple inline SVG logos for each provider
function AnthropicLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M13.827 3.52h3.603L24 20h-3.603l-6.57-16.48zm-7.258 0h3.767L16.906 20h-3.674L13.1 17.67H6.9l-.83 2.33H2.474L6.57 3.52zm5.714 11.326L10 9.77l-2.283 5.076h4.566z" fill="currentColor"/>
    </svg>
  );
}

function OpenAILogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387 2.02-1.168a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.412-.663zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" fill="currentColor"/>
    </svg>
  );
}

function GeminiLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 24A14.304 14.304 0 000 12 14.304 14.304 0 0012 0a14.305 14.305 0 0012 12 14.305 14.305 0 00-12 12" fill="currentColor"/>
    </svg>
  );
}

function MistralLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="2"  y="2"  width="5" height="5" fill="currentColor"/>
      <rect x="9"  y="2"  width="5" height="5" fill="currentColor"/>
      <rect x="16" y="2"  width="6" height="5" fill="currentColor"/>
      <rect x="2"  y="9"  width="5" height="5" fill="currentColor"/>
      <rect x="16" y="9"  width="6" height="5" fill="currentColor"/>
      <rect x="2"  y="16" width="5" height="6" fill="currentColor"/>
      <rect x="9"  y="16" width="5" height="6" fill="currentColor"/>
      <rect x="16" y="16" width="6" height="6" fill="currentColor"/>
    </svg>
  );
}

function GroqLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none"/>
      <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

function TogetherLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="8"  cy="12" r="4" fill="currentColor" opacity="0.8"/>
      <circle cx="16" cy="12" r="4" fill="currentColor" opacity="0.6"/>
    </svg>
  );
}

function MetaLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M2 12.5C2 9 4.5 6 7.5 6s5.5 3 5.5 6.5-2.5 6.5-5.5 6.5S2 16 2 12.5zm14 0c0-3.5 2.5-6.5 5.5-6.5S22 9 22 12.5" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
    </svg>
  );
}

export const PROVIDER_META: Record<string, ProviderMeta> = {
  anthropic: { label: "Anthropic", color: "#C8613A1A", textColor: "#C8613A", Logo: AnthropicLogo },
  openai:    { label: "OpenAI",    color: "#10a37f1A", textColor: "#10a37f", Logo: OpenAILogo    },
  gemini:    { label: "Google",    color: "#4285F41A", textColor: "#4285F4", Logo: GeminiLogo    },
  mistral:   { label: "Mistral",   color: "#FA531C1A", textColor: "#FA531C", Logo: MistralLogo   },
  groq:      { label: "Groq",      color: "#F55B501A", textColor: "#F55B50", Logo: GroqLogo      },
  together:  { label: "Together",  color: "#6E40C91A", textColor: "#9B72E8", Logo: TogetherLogo  },
  meta:      { label: "Meta",      color: "#0082FB1A", textColor: "#0082FB", Logo: MetaLogo      },
};

// ── API types ──────────────────────────────────────────────────────────────

export interface ModelInfo { id: string; label: string; }
export interface ProviderGroup { provider: string; configured: boolean; models: ModelInfo[]; }

// ── ProviderIcon helper ────────────────────────────────────────────────────

export function ProviderIcon({ provider, size = 14 }: { provider: string; size?: number }) {
  const meta = PROVIDER_META[provider];
  if (!meta) return <span className="w-4 h-4 rounded-sm bg-dark-raised" />;
  const { Logo, textColor } = meta;
  return <span style={{ color: textColor }}><Logo size={size} /></span>;
}

// ── ModelPicker ────────────────────────────────────────────────────────────

interface ModelPickerProps {
  orgId?: string | null;
  value: string;
  onChange: (model: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function ModelPicker({
  orgId,
  value,
  onChange,
  placeholder = "Select model…",
  className,
  disabled,
}: ModelPickerProps) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const ref = React.useRef<HTMLDivElement>(null);

  const { data: groups = [] } = useQuery<ProviderGroup[]>({
    queryKey: ["playground-models", orgId],
    queryFn: () =>
      api.get("/playground/models", { params: orgId ? { org_id: orgId } : {} })
         .then(r => r.data),
    staleTime: 30_000,
  });

  const configuredGroups = groups.filter(g => g.configured);
  const unconfiguredGroups = groups.filter(g => !g.configured);
  const hasAny = configuredGroups.length > 0;

  // Find the display info for current value
  const currentModel = groups.flatMap(g => g.models).find(m => m.id === value);
  const currentProvider = groups.find(g => g.models.some(m => m.id === value))?.provider;

  // Close on outside click
  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className={cn("relative", className)}>
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-md border border-dark-border bg-dark-raised px-3 py-2 text-sm text-ink-primary shadow-sm",
          "focus:outline-none focus:ring-2 focus:ring-brand-400",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "hover:border-dark-border/80 transition-colors"
        )}
      >
        {currentProvider && <ProviderIcon provider={currentProvider} size={14} />}
        <span className="flex-1 text-left truncate">
          {currentModel?.label ?? value ?? placeholder}
        </span>
        <ChevronDown className={cn("w-4 h-4 text-ink-dim shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border border-dark-border bg-[#0d0d0f] shadow-2xl overflow-hidden">
          <div className="max-h-80 overflow-y-auto">
            {/* When NO providers configured — show all models as reference */}
            {!hasAny ? (
              <div>
                <div className="px-4 pt-3 pb-2 text-[12px] text-[#a1a1aa] leading-relaxed border-b border-[#27272a]">
                  No supported models found. Add an org-level AI provider that includes any of the following models to get started.
                </div>
                {groups.flatMap(g => g.models.map(m => ({ ...m, provider: g.provider }))).map(model => (
                  <div
                    key={model.id}
                    className="flex items-center gap-3 px-4 py-2 text-[13px] text-[#71717a]"
                  >
                    <ProviderIcon provider={model.provider} size={14} />
                    <span className="flex-1">{model.id}</span>
                  </div>
                ))}
              </div>
            ) : (
              <>
                {/* Configured providers — selectable */}
                {configuredGroups.map(group => {
                  const meta = PROVIDER_META[group.provider];
                  return (
                    <div key={group.provider}>
                      <div className="px-3 pt-2 pb-1 flex items-center gap-1.5">
                        <ProviderIcon provider={group.provider} size={11} />
                        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: meta?.textColor ?? "#888" }}>
                          {meta?.label ?? group.provider}
                        </span>
                      </div>
                      {group.models.map(model => (
                        <button
                          key={model.id}
                          type="button"
                          onClick={() => { onChange(model.id); setOpen(false); }}
                          className={cn(
                            "w-full flex items-center gap-2.5 px-4 py-2 text-[13px] transition-colors",
                            value === model.id
                              ? "bg-brand-500/15 text-white"
                              : "text-[#d4d4d8] hover:bg-[#1c1c1f] hover:text-white"
                          )}
                        >
                          <ProviderIcon provider={group.provider} size={13} />
                          <span className="flex-1 text-left">{model.label}</span>
                          {value === model.id && <Check className="w-3.5 h-3.5 text-brand-400 shrink-0" />}
                        </button>
                      ))}
                    </div>
                  );
                })}

                {/* Unconfigured — greyed hints */}
                {unconfiguredGroups.length > 0 && (
                  <>
                    <div className="mx-3 my-1.5 h-px bg-[#27272a]" />
                    <div className="px-3 pt-1 pb-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[#52525b]">Not configured</span>
                    </div>
                    {unconfiguredGroups.map(group => (
                      <div key={group.provider}>
                        {group.models.slice(0, 2).map(model => (
                          <div key={model.id} className="flex items-center gap-2.5 px-4 py-1.5 text-[13px] text-[#3f3f46] cursor-not-allowed">
                            <ProviderIcon provider={group.provider} size={13} />
                            <span>{model.label}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </div>

          {/* Footer — Add provider */}
          <div className="border-t border-dark-border p-2">
            <button
              type="button"
              onClick={() => { setOpen(false); router.push("/settings?tab=providers"); }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] text-[#a1a1aa] hover:text-white hover:bg-[#1c1c1f] transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span className="flex-1 text-left">Manage providers</span>
              <span className="flex items-center gap-1">
                {unconfiguredGroups.slice(0, 3).map(g => (
                  <span key={g.provider} className="opacity-40">
                    <ProviderIcon provider={g.provider} size={12} />
                  </span>
                ))}
                {unconfiguredGroups.length > 3 && (
                  <span className="text-[10px] text-[#52525b]">+{unconfiguredGroups.length - 3}</span>
                )}
              </span>
              <ExternalLink className="w-3 h-3 opacity-40" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
