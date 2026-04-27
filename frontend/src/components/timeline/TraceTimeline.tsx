"use client";
import { useState, useMemo } from "react";
import type { Span, Session } from "@/lib/types";
import { clsx } from "clsx";
import {
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Cpu,
  Wrench,
  Database,
  Bot,
  Code2,
  Clock,
  Coins,
  Hash,
} from "lucide-react";

interface TraceTimelineProps {
  session: Session;
  spans: Span[];
}

// ── Tree building ──────────────────────────────────────────────────────────────

interface SpanNode {
  span: Span;
  children: SpanNode[];
  depth: number;
}

function buildTree(spans: Span[]): SpanNode[] {
  const map = new Map<string, SpanNode>();
  const roots: SpanNode[] = [];

  for (const span of spans) {
    map.set(span.id, { span, children: [], depth: 0 });
  }

  for (const span of spans) {
    const node = map.get(span.id)!;
    if (span.parent_span_id && map.has(span.parent_span_id)) {
      map.get(span.parent_span_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  function sortAndSetDepth(nodes: SpanNode[], depth: number) {
    nodes.sort(
      (a, b) =>
        new Date(a.span.started_at).getTime() -
        new Date(b.span.started_at).getTime()
    );
    for (const node of nodes) {
      node.depth = depth;
      sortAndSetDepth(node.children, depth + 1);
    }
  }
  sortAndSetDepth(roots, 0);

  return roots;
}

function flattenTree(nodes: SpanNode[], collapsed: Set<string>): SpanNode[] {
  const result: SpanNode[] = [];
  for (const node of nodes) {
    result.push(node);
    if (!collapsed.has(node.span.id) && node.children.length > 0) {
      result.push(...flattenTree(node.children, collapsed));
    }
  }
  return result;
}

// ── Formatting helpers ─────────────────────────────────────────────────────────

function formatMs(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function totalTokens(input: number | null, output: number | null): string | null {
  if (!input && !output) return null;
  return `${(input ?? 0) + (output ?? 0)} tok`;
}

// ── Span type icons & colours ──────────────────────────────────────────────────

const SPAN_ICON: Record<string, React.ReactNode> = {
  llm:       <Cpu       className="w-3.5 h-3.5 text-brand-400" />,
  tool:      <Wrench    className="w-3.5 h-3.5 text-amber-400" />,
  retrieval: <Database  className="w-3.5 h-3.5 text-sky-400"   />,
  agent:     <Bot       className="w-3.5 h-3.5 text-violet-400" />,
  custom:    <Code2     className="w-3.5 h-3.5 text-zinc-400"  />,
};

const SPAN_TOKEN_COLOR: Record<string, string> = {
  llm:       "text-brand-400",
  tool:      "text-amber-400",
  retrieval: "text-sky-400",
  agent:     "text-violet-400",
  custom:    "text-zinc-400",
};

// ── Collapsible accordion section ──────────────────────────────────────────────

function Section({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-dark-divider last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-dark-surface/40 transition-colors"
      >
        <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
          {title}
        </span>
        {open ? (
          <ChevronUp className="w-3.5 h-3.5 text-ink-dim" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-ink-dim" />
        )}
      </button>
      {open && <div className="px-5 pb-4">{children}</div>}
    </div>
  );
}

// ── Metric cell ────────────────────────────────────────────────────────────────

function MetricCell({
  label,
  icon,
  value,
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-1 bg-dark-surface rounded-lg p-3">
      <div className="flex items-center gap-1 text-ink-dim">
        {icon}
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <span className="text-xs font-mono text-ink-primary">{value}</span>
    </div>
  );
}

// ── Tree row ───────────────────────────────────────────────────────────────────

function TreeRow({
  node,
  isSelected,
  isCollapsed,
  onSelect,
  onToggle,
}: {
  node: SpanNode;
  isSelected: boolean;
  isCollapsed: boolean;
  onSelect: () => void;
  onToggle: (e: React.MouseEvent) => void;
}) {
  const { span, depth, children } = node;
  const hasChildren = children.length > 0;
  const tokStr = totalTokens(span.input_tokens, span.output_tokens);
  const tokenColor = SPAN_TOKEN_COLOR[span.span_type] ?? "text-zinc-400";
  const icon = SPAN_ICON[span.span_type] ?? SPAN_ICON.custom;

  return (
    <div
      className={clsx(
        "flex items-center gap-1 h-9 cursor-pointer border-b border-dark-divider/30 transition-colors",
        isSelected
          ? "bg-brand-500/10 border-l-2 border-l-brand-500"
          : "hover:bg-dark-surface/60 border-l-2 border-l-transparent"
      )}
      style={{ paddingLeft: `${8 + depth * 18}px`, paddingRight: "8px" }}
      onClick={onSelect}
    >
      {/* Expand / collapse toggle */}
      <button
        className={clsx(
          "w-4 h-4 flex items-center justify-center shrink-0 rounded",
          hasChildren ? "hover:bg-dark-raised" : "invisible"
        )}
        onClick={hasChildren ? onToggle : undefined}
      >
        {hasChildren &&
          (isCollapsed ? (
            <ChevronRight className="w-3 h-3 text-ink-dim" />
          ) : (
            <ChevronDown className="w-3 h-3 text-ink-dim" />
          ))}
      </button>

      {/* Type icon */}
      <span className="shrink-0">{icon}</span>

      {/* Name */}
      <span
        className={clsx(
          "flex-1 text-xs truncate min-w-0 ml-1",
          isSelected ? "text-ink-primary font-medium" : "text-ink-secondary"
        )}
      >
        {span.name}
      </span>

      {/* Right meta: tokens + duration + error dot */}
      <div className="shrink-0 flex items-center gap-2 text-[10px] font-mono">
        {tokStr && <span className={tokenColor}>{tokStr}</span>}
        <span className="text-ink-dim">{formatMs(span.duration_ms)}</span>
        {span.status === "error" && (
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
        )}
      </div>
    </div>
  );
}

// ── Detail panel ───────────────────────────────────────────────────────────────

function DetailPanel({ span }: { span: Span }) {
  const typeLabel =
    span.span_type.charAt(0).toUpperCase() + span.span_type.slice(1);
  const icon = SPAN_ICON[span.span_type] ?? SPAN_ICON.custom;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-dark-divider shrink-0 bg-dark-surface/30">
        {icon}
        <h3 className="text-sm font-semibold text-ink-primary truncate flex-1 min-w-0">
          {span.name}
        </h3>
        <span className="shrink-0 text-[10px] px-2 py-0.5 rounded bg-dark-raised text-ink-muted font-mono uppercase tracking-wider">
          {typeLabel}
        </span>
        {span.status === "error" && (
          <span className="shrink-0 text-[10px] px-2 py-0.5 rounded bg-red-500/10 text-red-400 uppercase tracking-wider">
            error
          </span>
        )}
      </div>

      {/* Scrollable sections */}
      <div className="flex-1 overflow-y-auto">
        {/* Metrics */}
        <Section title="Metrics">
          <div className="grid grid-cols-2 gap-2">
            <MetricCell
              label="Duration"
              icon={<Clock className="w-3 h-3" />}
              value={formatMs(span.duration_ms)}
            />
            {span.model && (
              <MetricCell
                label="Model"
                icon={<Cpu className="w-3 h-3" />}
                value={span.model}
              />
            )}
            {span.cost_usd !== null && (
              <MetricCell
                label="Cost"
                icon={<Coins className="w-3 h-3" />}
                value={`$${span.cost_usd?.toFixed(6)}`}
              />
            )}
            {(span.input_tokens || span.output_tokens) && (
              <MetricCell
                label="Tokens in / out"
                icon={<Hash className="w-3 h-3" />}
                value={`${span.input_tokens ?? 0} / ${span.output_tokens ?? 0}`}
              />
            )}
          </div>
        </Section>

        {/* Input */}
        {span.input_text && (
          <Section title="Input">
            <pre className="text-xs font-mono text-ink-secondary whitespace-pre-wrap break-words bg-dark-surface border border-dark-border rounded-lg p-3 max-h-56 overflow-y-auto">
              {span.input_text}
            </pre>
          </Section>
        )}

        {/* Output */}
        {span.output_text && (
          <Section title="Output">
            <pre className="text-xs font-mono text-ink-secondary whitespace-pre-wrap break-words bg-dark-surface border border-dark-border rounded-lg p-3 max-h-56 overflow-y-auto">
              {span.output_text}
            </pre>
          </Section>
        )}

        {/* Error */}
        {span.error_message && (
          <Section title="Error">
            <pre className="text-xs font-mono text-red-400 bg-red-500/5 border border-red-500/15 rounded-lg p-3 overflow-auto max-h-32">
              {span.error_message}
              {span.error_type ? `\n\nType: ${span.error_type}` : ""}
            </pre>
          </Section>
        )}

        {/* Metadata */}
        {Object.keys(span.attributes).length > 0 && (
          <Section title="Metadata" defaultOpen={false}>
            <pre className="text-xs font-mono text-ink-secondary bg-dark-surface border border-dark-border rounded-lg p-3 overflow-auto max-h-40">
              {JSON.stringify(span.attributes, null, 2)}
            </pre>
          </Section>
        )}
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

export default function TraceTimeline({ session: _session, spans }: TraceTimelineProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const roots = useMemo(() => buildTree(spans), [spans]);
  const flatNodes = useMemo(() => flattenTree(roots, collapsed), [roots, collapsed]);

  // Auto-select first span
  const selectedSpan =
    flatNodes.find((n) => n.span.id === selectedId)?.span ??
    flatNodes[0]?.span ??
    null;

  function toggleCollapse(spanId: string, e: React.MouseEvent) {
    e.stopPropagation();
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(spanId)) next.delete(spanId);
      else next.add(spanId);
      return next;
    });
  }

  if (spans.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-ink-muted text-sm">
        No spans recorded for this session.
      </div>
    );
  }

  return (
    <div className="flex rounded-xl border border-dark-border overflow-hidden bg-dark-bg" style={{ height: "calc(100vh - 260px)", minHeight: "480px" }}>
      {/* ── Left: span tree ── */}
      <div
        className={clsx(
          "flex flex-col border-r border-dark-divider overflow-hidden shrink-0",
          selectedSpan ? "w-[42%]" : "w-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-dark-divider bg-dark-surface/50 shrink-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
            Spans
          </span>
          <span className="ml-auto text-[10px] text-ink-dim font-mono">
            {spans.length} spans
          </span>
        </div>

        {/* Tree rows */}
        <div className="flex-1 overflow-y-auto">
          {flatNodes.map((node) => (
            <TreeRow
              key={node.span.id}
              node={node}
              isSelected={selectedSpan?.id === node.span.id}
              isCollapsed={collapsed.has(node.span.id)}
              onSelect={() => setSelectedId(node.span.id)}
              onToggle={(e) => toggleCollapse(node.span.id, e)}
            />
          ))}
        </div>
      </div>

      {/* ── Right: detail panel ── */}
      {selectedSpan && (
        <div className="flex-1 overflow-hidden">
          <DetailPanel span={selectedSpan} />
        </div>
      )}
    </div>
  );
}
