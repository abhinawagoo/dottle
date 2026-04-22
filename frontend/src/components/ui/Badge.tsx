import { clsx } from "clsx";

// Dark-theme status badge styles
const STATUS_STYLES: Record<string, string> = {
  running:   "bg-blue-500/10 text-blue-400 border-blue-500/20",
  completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  failed:    "bg-red-500/10 text-red-400 border-red-500/20",
  looping:   "bg-amber-500/10 text-amber-400 border-amber-500/20",
  timeout:   "bg-orange-500/10 text-orange-400 border-orange-500/20",
  timed_out: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  ok:        "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  error:     "bg-red-500/10 text-red-400 border-red-500/20",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={clsx(
      "inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border",
      STATUS_STYLES[status] ?? "bg-zinc-800 text-zinc-400 border-zinc-700"
    )}>
      {status}
    </span>
  );
}

export function LoopBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/25">
      ⚠ loop
    </span>
  );
}

export function SpanTypeBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    llm:       "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    tool:      "bg-amber-500/10 text-amber-400 border-amber-500/20",
    retrieval: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    agent:     "bg-blue-500/10 text-blue-400 border-blue-500/20",
    custom:    "bg-purple-500/10 text-purple-400 border-purple-500/20",
  };
  return (
    <span className={clsx(
      "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border",
      styles[type] ?? "bg-zinc-800 text-zinc-400 border-zinc-700"
    )}>
      {type}
    </span>
  );
}
