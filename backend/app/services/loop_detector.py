"""
Server-side loop detection.
Analyzes spans of a session and determines if it's stuck in a loop.
"""
from collections import Counter
from dataclasses import dataclass

from app.schemas.ingest import SpanPayload


MAX_ITERATIONS = 25
TOOL_REPEAT_THRESHOLD = 5       # same tool in a row
IDENTICAL_INPUT_THRESHOLD = 3   # same tool + same input hash N times


@dataclass
class LoopResult:
    detected: bool
    reason: str | None


def analyze_spans(spans: list[SpanPayload], existing_iteration_count: int = 0) -> LoopResult:
    """
    Analyze a batch of incoming spans for loop signals.
    Called on every /ingest/spans request.
    """
    llm_spans = [s for s in spans if s.span_type == "llm"]
    tool_spans = [s for s in spans if s.span_type == "tool"]

    new_iterations = existing_iteration_count + len(llm_spans)

    # Signal 1: too many iterations
    if new_iterations >= MAX_ITERATIONS:
        return LoopResult(
            detected=True,
            reason=f"iteration_count={new_iterations} exceeded threshold={MAX_ITERATIONS}"
        )

    # Signal 2: same tool called with identical inputs repeatedly
    if tool_spans:
        hash_counts: Counter[tuple[str, str]] = Counter()
        for s in tool_spans:
            input_hash = s.attributes.get("input_hash", "")
            if input_hash:
                hash_counts[(s.name, input_hash)] += 1

        for (tool_name, _), count in hash_counts.items():
            if count >= IDENTICAL_INPUT_THRESHOLD:
                return LoopResult(
                    detected=True,
                    reason=f"repeated_tool:{tool_name} called {count}x with identical inputs"
                )

    # Signal 3: same tool called too many times in a row (regardless of inputs)
    if tool_spans:
        tool_name_counts = Counter(s.name for s in tool_spans)
        for tool_name, count in tool_name_counts.items():
            if count >= TOOL_REPEAT_THRESHOLD:
                return LoopResult(
                    detected=True,
                    reason=f"repeated_tool:{tool_name} called {count}x in this batch"
                )

    return LoopResult(detected=False, reason=None)


def analyze_session_spans_from_db(
    all_tool_calls: list[dict], total_iterations: int
) -> LoopResult:
    """
    Full analysis from DB records (used by alert worker on existing sessions).
    all_tool_calls: list of dicts with keys: tool_name, input_hash, status
    """
    if total_iterations >= MAX_ITERATIONS:
        return LoopResult(
            detected=True,
            reason=f"iteration_count={total_iterations} exceeded threshold={MAX_ITERATIONS}"
        )

    hash_counts: Counter[tuple[str, str]] = Counter()
    for tc in all_tool_calls:
        if tc.get("input_hash"):
            hash_counts[(tc["tool_name"], tc["input_hash"])] += 1

    for (tool_name, _), count in hash_counts.items():
        if count >= IDENTICAL_INPUT_THRESHOLD:
            return LoopResult(
                detected=True,
                reason=f"repeated_tool:{tool_name} called {count}x with identical inputs"
            )

    return LoopResult(detected=False, reason=None)
