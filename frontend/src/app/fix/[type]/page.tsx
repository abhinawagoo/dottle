"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { issuesApi, codeFixApi } from "@/lib/api";
import { useProject } from "@/lib/project-context";
import Link from "next/link";
import {
  ArrowLeft, Wrench, GitBranch, ExternalLink, CheckCircle2,
  XCircle, Loader2, FileCode2, ChevronDown, ChevronUp, AlertTriangle,
} from "lucide-react";
import type { CodeFixJob, FilePatch } from "@/lib/types";

interface Props { params: { type: string } }

const ISSUE_TYPE_LABELS: Record<string, string> = {
  session_failed:       "Session Failure",
  loop_detected:        "Agent Loop",
  high_latency:         "High Latency",
  slow_span:            "Slow Operation",
  high_cost:            "High Cost",
  tool_failure_storm:   "Tool Failure Storm",
  repeated_tool_error:  "Repeated Tool Error",
  excessive_tokens:     "Excessive Token Usage",
  no_llm_output:        "Missing LLM Output",
  no_llm_calls:         "No LLM Calls Recorded",
};

// ── Diff viewer ───────────────────────────────────────────────────────────────

function DiffLine({ line, type }: { line: string; type: "add" | "remove" | "context" }) {
  const bg = type === "add" ? "bg-green-500/10" : type === "remove" ? "bg-red-500/10" : "";
  const prefix = type === "add" ? "+" : type === "remove" ? "−" : " ";
  const color = type === "add" ? "text-green-400" : type === "remove" ? "text-red-400" : "text-ink-muted";
  return (
    <div className={`flex gap-2 px-3 py-0.5 font-mono text-[11px] ${bg}`}>
      <span className={`select-none w-3 shrink-0 ${color}`}>{prefix}</span>
      <span className={color}>{line}</span>
    </div>
  );
}

function PatchViewer({ patch, index }: { patch: FilePatch; index: number }) {
  const [open, setOpen] = useState(index === 0);

  const oldLines = patch.old_code.split("\n");
  const newLines = patch.new_code.split("\n");

  return (
    <div className="border border-dark-border rounded-xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-dark-raised hover:bg-dark-bg transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <FileCode2 className="w-3.5 h-3.5 text-brand-400" />
          <span className="font-mono text-[12px] text-ink-primary">{patch.file_path}</span>
          <span className="text-[10px] text-ink-dim bg-dark-bg border border-dark-border px-1.5 py-0.5 rounded">
            {patch.explanation}
          </span>
        </div>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-ink-dim" /> : <ChevronDown className="w-3.5 h-3.5 text-ink-dim" />}
      </button>

      {/* Diff body */}
      {open && (
        <div className="bg-[#0d0d0f] overflow-x-auto">
          <div className="py-1">
            {oldLines.map((line, i) => <DiffLine key={`r${i}`} line={line} type="remove" />)}
            <div className="h-px bg-dark-divider my-1" />
            {newLines.map((line, i) => <DiffLine key={`a${i}`} line={line} type="add" />)}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Status indicator ──────────────────────────────────────────────────────────

function JobStatus({ status }: { status: string }) {
  if (status === "pending" || status === "running") {
    return (
      <div className="flex items-center gap-2 text-brand-400 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="font-medium">{status === "pending" ? "Queued..." : "Analyzing your codebase..."}</span>
      </div>
    );
  }
  if (status === "ready") {
    return (
      <div className="flex items-center gap-2 text-green-400 text-sm">
        <CheckCircle2 className="w-4 h-4" />
        <span className="font-medium">Fix ready — review the patch below</span>
      </div>
    );
  }
  if (status === "applied") {
    return (
      <div className="flex items-center gap-2 text-brand-400 text-sm">
        <GitBranch className="w-4 h-4" />
        <span className="font-medium">PR created</span>
      </div>
    );
  }
  if (status === "failed") {
    return (
      <div className="flex items-center gap-2 text-red-400 text-sm">
        <XCircle className="w-4 h-4" />
        <span className="font-medium">Fix generation failed</span>
      </div>
    );
  }
  return null;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FixPage({ params }: Props) {
  const { selectedProject } = useProject();
  const PROJECT_ID = selectedProject?.id ?? "";
  const issueType = params.type;
  const label = ISSUE_TYPE_LABELS[issueType] ?? issueType.replace(/_/g, " ");
  const queryClient = useQueryClient();

  const [jobId, setJobId] = useState<string | null>(null);
  const [prTitle, setPrTitle] = useState("");
  const [showPrForm, setShowPrForm] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Load issue context to pass to fix job
  const { data: issueData } = useQuery({
    queryKey: ["issues", PROJECT_ID],
    queryFn: () => issuesApi.list({ project_id: PROJECT_ID }),
    enabled: !!PROJECT_ID,
  });
  const issueGroup = issueData?.groups?.find((g: { issue_type: string }) => g.issue_type === issueType);

  // Check GitHub config
  const { data: ghConfig, isError: ghMissing } = useQuery({
    queryKey: ["github-config", PROJECT_ID],
    queryFn: () => codeFixApi.getGitHubConfig(PROJECT_ID),
    enabled: !!PROJECT_ID,
    retry: false,
  });

  // Poll job status
  const { data: job, refetch: refetchJob } = useQuery<CodeFixJob>({
    queryKey: ["fix-job", jobId],
    queryFn: () => codeFixApi.getJob(jobId!),
    enabled: !!jobId,
    refetchInterval: false, // manual polling
  });

  // Start polling when job is running/pending
  useEffect(() => {
    if (!jobId) return;
    if (job?.status === "pending" || job?.status === "running") {
      pollingRef.current = setInterval(() => refetchJob(), 3000);
    } else {
      if (pollingRef.current) clearInterval(pollingRef.current);
    }
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [jobId, job?.status, refetchJob]);

  // Create fix job mutation
  const createJob = useMutation({
    mutationFn: () => codeFixApi.createFixJob(issueType, {
      project_id: PROJECT_ID,
      issue_context: {
        occurrence_count: issueGroup?.occurrence_count ?? 0,
        session_count: issueGroup?.session_count ?? 0,
        user_count: issueGroup?.user_count ?? 0,
        agent_names: issueGroup?.agent_names ?? [],
        severity: issueGroup?.severity ?? "info",
        title: issueGroup?.title ?? label,
      },
    }),
    onSuccess: (data: CodeFixJob) => {
      setJobId(data.id);
    },
  });

  // Create PR mutation
  const createPR = useMutation({
    mutationFn: () => codeFixApi.createPR(jobId!, {
      title: prTitle || undefined,
    }),
    onSuccess: (data: CodeFixJob) => {
      queryClient.setQueryData(["fix-job", jobId], data);
      setShowPrForm(false);
    },
  });

  const isActive = job?.status === "pending" || job?.status === "running";

  return (
    <div className="space-y-5 max-w-4xl mx-auto">

      {/* Back + header */}
      <div>
        <Link
          href={`/issues/${issueType}`}
          className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted hover:text-ink-secondary mb-3 transition-colors"
        >
          <ArrowLeft className="w-3 h-3" /> Back to Issue
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-600/20 border border-brand-500/30 flex items-center justify-center">
            <Wrench className="w-4 h-4 text-brand-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-ink-primary">AI Code Fix</h1>
            <p className="text-xs text-ink-muted">{label} · {issueType}</p>
          </div>
        </div>
      </div>

      {/* GitHub not configured warning */}
      {ghMissing && !ghConfig && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-500/20 bg-amber-500/5">
          <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-300">GitHub not connected</p>
            <p className="text-xs text-ink-muted mt-0.5">
              Connect your GitHub repository in{" "}
              <Link href="/settings" className="text-brand-400 hover:underline">Settings → Integrations</Link>{" "}
              before generating a fix.
            </p>
          </div>
        </div>
      )}

      {/* Connected repo info */}
      {ghConfig && (
        <div className="flex items-center gap-2.5 text-xs text-ink-muted p-3 rounded-xl bg-dark-raised border border-dark-border">
          <GitBranch className="w-3.5 h-3.5 text-ink-dim" />
          <span>Repo:</span>
          <span className="font-mono text-ink-secondary">{ghConfig.repo_owner}/{ghConfig.repo_name}</span>
          <span className="text-ink-dim">·</span>
          <span>Branch:</span>
          <span className="font-mono text-ink-secondary">{ghConfig.default_branch}</span>
        </div>
      )}

      {/* Issue snapshot */}
      {issueGroup && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Occurrences", value: issueGroup.occurrence_count },
            { label: "Sessions affected", value: issueGroup.session_count },
            { label: "Severity", value: issueGroup.severity.toUpperCase() },
          ].map(({ label, value }) => (
            <div key={label} className="p-3 rounded-xl bg-dark-raised border border-dark-border">
              <p className="text-[10px] text-ink-dim uppercase tracking-wider mb-1">{label}</p>
              <p className="text-sm font-semibold text-ink-primary">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Start Fix button */}
      {!jobId && (
        <button
          onClick={() => createJob.mutate()}
          disabled={!ghConfig || createJob.isPending}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
        >
          {createJob.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
          Generate Fix
        </button>
      )}

      {/* Job in progress / results */}
      {job && (
        <div className="space-y-4">

          {/* Status bar */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-dark-raised border border-dark-border">
            <JobStatus status={job.status} />
            {job.files_loaded && (
              <span className="text-[11px] text-ink-dim">
                {job.files_loaded.length} file{job.files_loaded.length !== 1 ? "s" : ""} analyzed
              </span>
            )}
          </div>

          {/* Error */}
          {job.status === "failed" && job.error_message && (
            <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/20 text-sm text-red-300">
              {job.error_message}
            </div>
          )}

          {/* Diagnosis */}
          {job.diagnosis && (
            <div className="p-4 rounded-xl bg-dark-raised border border-dark-border space-y-1">
              <p className="text-[10px] font-semibold text-ink-dim uppercase tracking-wider">Root Cause</p>
              <p className="text-sm text-ink-secondary leading-relaxed">{job.diagnosis}</p>
            </div>
          )}

          {/* Patches */}
          {job.patches && job.patches.length > 0 && (
            <div className="space-y-3">
              <p className="text-[11px] font-semibold text-ink-dim uppercase tracking-wider">
                Patches ({job.patches.length} file{job.patches.length !== 1 ? "s" : ""})
              </p>
              {job.patches.map((patch, i) => (
                <PatchViewer key={patch.file_path} patch={patch} index={i} />
              ))}
            </div>
          )}

          {/* No patches */}
          {job.status === "ready" && (!job.patches || job.patches.length === 0) && (
            <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 text-sm text-amber-300">
              The AI analyzed the issue but could not generate specific patches for the provided files.
              Review the root cause above and apply the fix manually.
            </div>
          )}

          {/* Files loaded (collapsed) */}
          {job.files_loaded && job.files_loaded.length > 0 && (
            <details className="text-[11px]">
              <summary className="text-ink-dim cursor-pointer hover:text-ink-muted select-none">
                View analyzed files ({job.files_loaded.length})
              </summary>
              <div className="mt-2 space-y-1 pl-2">
                {job.files_loaded.map(f => (
                  <p key={f} className="font-mono text-ink-dim">{f}</p>
                ))}
              </div>
            </details>
          )}

          {/* PR creation */}
          {job.status === "ready" && job.patches && job.patches.length > 0 && (
            <div className="pt-2">
              {!showPrForm ? (
                <button
                  onClick={() => setShowPrForm(true)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-semibold transition-colors"
                >
                  <GitBranch className="w-4 h-4" />
                  Create Pull Request
                </button>
              ) : (
                <div className="p-4 rounded-xl bg-dark-raised border border-dark-border space-y-3">
                  <p className="text-sm font-medium text-ink-primary">Create PR</p>
                  <input
                    type="text"
                    placeholder={`fix(${issueType}): Dottle auto-fix`}
                    value={prTitle}
                    onChange={e => setPrTitle(e.target.value)}
                    className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-ink-primary placeholder:text-ink-dim focus:outline-none focus:border-brand-500"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => createPR.mutate()}
                      disabled={createPR.isPending}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
                    >
                      {createPR.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitBranch className="w-3.5 h-3.5" />}
                      Open PR on GitHub
                    </button>
                    <button
                      onClick={() => setShowPrForm(false)}
                      className="px-4 py-2 rounded-lg text-sm text-ink-muted hover:text-ink-secondary transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* PR applied */}
          {job.status === "applied" && job.pr_url && (
            <a
              href={job.pr_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-dark-raised border border-green-500/30 text-green-400 text-sm font-medium hover:border-green-500/60 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              View PR on GitHub
            </a>
          )}
        </div>
      )}
    </div>
  );
}
