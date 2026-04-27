"""
Rule-based issue detector.
Runs synchronously after a session ends — fast, no LLM required.

Each detector returns zero or more IssueResult objects.
They are saved to session_issues table and surfaced in the UI.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass, field
from typing import Any
import uuid


# ── Thresholds ────────────────────────────────────────────────────────────────

HIGH_LATENCY_SESSION_MS  = 30_000   # 30 s
HIGH_LATENCY_SPAN_MS     = 10_000   # 10 s per single span
HIGH_COST_USD            = 1.00     # $1 per session
EXCESSIVE_TOKENS_SPAN    = 50_000   # tokens in a single LLM span
TOOL_FAILURE_RATE_PCT    = 50.0     # % of tool calls that error
REPEATED_TOOL_ERROR_MIN  = 2        # same tool fails this many times


@dataclass
class IssueResult:
    issue_type: str
    severity: str          # critical | high | medium | low | info
    title: str
    description: str
    span_id: uuid.UUID | None = None


@dataclass
class SessionSnapshot:
    """Lightweight view of a finished session passed to each detector."""
    session_id: uuid.UUID
    project_id: uuid.UUID
    status: str
    duration_ms: int | None
    total_cost_usd: float | None
    total_tokens: int | None
    iteration_count: int
    loop_detected: bool
    loop_reason: str | None
    error_message: str | None
    error_type: str | None
    spans: list[dict]        # raw span dicts from DB/schemas


def detect_all(snapshot: SessionSnapshot) -> list[IssueResult]:
    """Run every detector and return the deduplicated list of issues."""
    issues: list[IssueResult] = []

    issues.extend(_detect_session_failed(snapshot))
    issues.extend(_detect_span_errors(snapshot))
    issues.extend(_detect_loop(snapshot))
    issues.extend(_detect_high_latency(snapshot))
    issues.extend(_detect_high_cost(snapshot))
    issues.extend(_detect_tool_failures(snapshot))
    issues.extend(_detect_excessive_tokens(snapshot))
    issues.extend(_detect_no_llm_output(snapshot))
    issues.extend(_detect_zero_llm_calls(snapshot))

    return issues


# ── Individual detectors ──────────────────────────────────────────────────────

def _detect_session_failed(s: SessionSnapshot) -> list[IssueResult]:
    if s.status != "failed":
        return []

    err = s.error_type or "UnknownError"
    msg = s.error_message or "No details available."

    return [IssueResult(
        issue_type="session_failed",
        severity="critical",
        title=f"Session failed — {err}",
        description=(
            f"The agent session terminated with an unhandled exception.\n\n"
            f"**Error type:** `{err}`\n"
            f"**Message:** {msg}\n\n"
            f"Check the span marked as `error` for the root cause. "
            f"Ensure exceptions are caught and the session is closed gracefully."
        ),
    )]


def _detect_span_errors(s: SessionSnapshot) -> list[IssueResult]:
    """
    Surface spans that have status='error' even when the overall session is 'completed'.
    This catches cases where the agent caught an exception internally and recorded it
    via span.set_error() / span.record_error() without propagating it to the session.
    """
    # If session already failed, _detect_session_failed handles it at session level
    if s.status == "failed":
        return []

    error_spans = [sp for sp in s.spans if sp.get("status") == "error"]
    if not error_spans:
        return []

    issues = []
    for sp in error_spans:
        name = sp.get("name", "unknown")
        span_type = sp.get("span_type", "span")
        err_type = sp.get("error_type") or "Error"
        err_msg = sp.get("error_message") or "No details available."
        span_id = sp.get("id")

        # Severity: llm/agent errors are higher priority than tool errors
        if span_type in ("llm", "agent"):
            severity = "high"
        elif span_type == "tool":
            severity = "medium"
        else:
            severity = "medium"

        issues.append(IssueResult(
            issue_type="span_error",
            severity=severity,
            title=f"Error in `{name}` — {err_type}",
            description=(
                f"The span **{name}** (type: `{span_type}`) completed with an error "
                f"even though the session status is `{s.status}`.\n\n"
                f"**Error type:** `{err_type}`\n"
                f"**Message:** {err_msg}\n\n"
                f"The agent caught this exception internally. Open the trace timeline "
                f"and inspect this span to see the full stack trace."
            ),
            span_id=span_id,
        ))

    return issues


def _detect_loop(s: SessionSnapshot) -> list[IssueResult]:
    if not s.loop_detected:
        return []

    reason = s.loop_reason or "Repeated pattern detected."

    # Parse reason for a human-readable title
    if "repeated_tool:" in reason:
        tool = reason.split("repeated_tool:")[-1].split(" ")[0]
        title = f"Loop — `{tool}` called repeatedly with identical inputs"
    elif "iteration_count" in reason:
        title = f"Loop — exceeded max iterations ({s.iteration_count})"
    else:
        title = "Loop detected — agent made no progress"

    return [IssueResult(
        issue_type="loop_detected",
        severity="critical",
        title=title,
        description=(
            f"The agent was detected in a loop and the session was marked `looping`.\n\n"
            f"**Detection reason:** {reason}\n\n"
            f"**Iterations completed:** {s.iteration_count}\n\n"
            f"Common causes:\n"
            f"- The LLM doesn't recognise that a tool already ran\n"
            f"- Missing memory / context between iterations\n"
            f"- The tool always returns the same unhelpful output\n\n"
            f"**Fix:** Add a results cache or pass prior tool outputs back into the prompt context."
        ),
    )]


def _detect_high_latency(s: SessionSnapshot) -> list[IssueResult]:
    issues = []

    if s.duration_ms and s.duration_ms > HIGH_LATENCY_SESSION_MS:
        secs = s.duration_ms / 1000
        issues.append(IssueResult(
            issue_type="high_latency",
            severity="medium",
            title=f"Slow session — took {secs:.1f}s",
            description=(
                f"The session took **{secs:.1f} seconds** to complete, "
                f"exceeding the {HIGH_LATENCY_SESSION_MS // 1000}s threshold.\n\n"
                f"Inspect the trace timeline to find the slowest spans. "
                f"Consider parallelising independent tool calls or caching repeated LLM calls."
            ),
        ))

    # Slow individual spans
    for sp in s.spans:
        dur = sp.get("duration_ms") or 0
        if dur > HIGH_LATENCY_SPAN_MS:
            name = sp.get("name", "unknown")
            span_id = sp.get("id")
            issues.append(IssueResult(
                issue_type="slow_span",
                severity="low",
                title=f"Slow span — `{name}` took {dur / 1000:.1f}s",
                description=(
                    f"The span **{name}** took {dur / 1000:.2f}s, "
                    f"which is above the {HIGH_LATENCY_SPAN_MS // 1000}s single-span threshold.\n\n"
                    f"If this is an LLM call, consider a faster model or shorter prompt. "
                    f"If it's a tool call, check for network latency or blocking I/O."
                ),
                span_id=span_id,
            ))

    return issues


def _detect_high_cost(s: SessionSnapshot) -> list[IssueResult]:
    if not s.total_cost_usd or s.total_cost_usd < HIGH_COST_USD:
        return []

    return [IssueResult(
        issue_type="high_cost",
        severity="medium",
        title=f"High cost — ${s.total_cost_usd:.4f} for this session",
        description=(
            f"This session cost **${s.total_cost_usd:.4f}**, exceeding the ${HIGH_COST_USD:.2f} threshold.\n\n"
            f"**Total tokens:** {s.total_tokens or 0:,}\n\n"
            f"Consider:\n"
            f"- Using a cheaper model for classification or summarisation steps\n"
            f"- Truncating long context before passing to the LLM\n"
            f"- Caching responses for repeated identical prompts"
        ),
    )]


def _detect_tool_failures(s: SessionSnapshot) -> list[IssueResult]:
    issues = []
    tool_spans = [sp for sp in s.spans if sp.get("span_type") == "tool"]

    if not tool_spans:
        return []

    # Overall failure rate
    failed = [sp for sp in tool_spans if sp.get("status") == "error"]
    rate = len(failed) / len(tool_spans) * 100

    if rate >= TOOL_FAILURE_RATE_PCT:
        issues.append(IssueResult(
            issue_type="tool_failure_storm",
            severity="high",
            title=f"Tool failure storm — {rate:.0f}% of tool calls failed",
            description=(
                f"**{len(failed)} out of {len(tool_spans)}** tool calls in this session returned errors ({rate:.0f}%).\n\n"
                "Failed tools: " + ", ".join(f"`{sp['name']}`" for sp in failed[:5]) + "\n\n"
                "This often indicates:\n"
                f"- External service downtime or rate limiting\n"
                f"- Incorrect tool inputs generated by the LLM\n"
                f"- Missing credentials or permissions"
            ),
        ))

    # Per-tool repeated failures
    tool_errors: dict[str, list] = defaultdict(list)
    for sp in failed:
        tool_errors[sp.get("name", "unknown")].append(sp)

    for tool_name, error_spans in tool_errors.items():
        if len(error_spans) >= REPEATED_TOOL_ERROR_MIN:
            # Get the distinct error messages
            msgs = list({sp.get("error_message", "") for sp in error_spans if sp.get("error_message")})
            issues.append(IssueResult(
                issue_type="repeated_tool_error",
                severity="high",
                title=f"`{tool_name}` failed {len(error_spans)} times",
                description=(
                    f"The tool **`{tool_name}`** failed **{len(error_spans)} times** in this session.\n\n"
                    f"**Errors seen:**\n"
                    + "\n".join(f"- `{m}`" for m in msgs[:3])
                    + "\n\n**Fix:** Add retry logic with exponential backoff, or validate tool inputs before calling."
                ),
                span_id=error_spans[0].get("id"),
            ))

    return issues


def _detect_excessive_tokens(s: SessionSnapshot) -> list[IssueResult]:
    issues = []
    llm_spans = [sp for sp in s.spans if sp.get("span_type") == "llm"]

    for sp in llm_spans:
        total = (sp.get("input_tokens") or 0) + (sp.get("output_tokens") or 0)
        if total > EXCESSIVE_TOKENS_SPAN:
            name = sp.get("name", "LLM call")
            issues.append(IssueResult(
                issue_type="excessive_tokens",
                severity="medium",
                title=f"Large context — `{name}` used {total:,} tokens",
                description=(
                    f"A single LLM call (**{name}**) consumed **{total:,} tokens** "
                    f"({sp.get('input_tokens', 0):,} in / {sp.get('output_tokens', 0):,} out).\n\n"
                    f"Large contexts increase cost and latency. Consider:\n"
                    f"- Summarising prior conversation history before re-injecting it\n"
                    f"- Using RAG (retrieval-augmented generation) instead of stuffing full docs\n"
                    f"- Splitting into smaller sub-tasks"
                ),
                span_id=sp.get("id"),
            ))

    return issues


def _detect_no_llm_output(s: SessionSnapshot) -> list[IssueResult]:
    issues = []
    llm_spans = [sp for sp in s.spans if sp.get("span_type") == "llm"]

    for sp in llm_spans:
        if sp.get("status") == "ok" and not sp.get("output_text") and not sp.get("output_tokens"):
            name = sp.get("name", "LLM call")
            issues.append(IssueResult(
                issue_type="no_llm_output",
                severity="low",
                title=f"`{name}` completed but captured no output",
                description=(
                    f"The LLM span **{name}** finished with status `ok` but no output text was recorded.\n\n"
                    f"This usually means `record_prompt()` was not called, or the response was empty.\n"
                    f"Check that your SDK instrumentation captures the model response."
                ),
                span_id=sp.get("id"),
            ))

    return issues


def _detect_zero_llm_calls(s: SessionSnapshot) -> list[IssueResult]:
    llm_spans = [sp for sp in s.spans if sp.get("span_type") == "llm"]
    tool_spans = [sp for sp in s.spans if sp.get("span_type") == "tool"]

    if not llm_spans and tool_spans:
        return [IssueResult(
            issue_type="no_llm_calls",
            severity="info",
            title="No LLM calls recorded — only tool calls",
            description=(
                f"This session ran **{len(tool_spans)} tool calls** but no LLM spans were recorded.\n\n"
                f"If your agent does call an LLM, make sure it's instrumented with "
                f"`dottle.wrap_openai()`, `dottle.wrap_anthropic()`, or a manual `span('llm', ...)`."
            ),
        )]

    return []
