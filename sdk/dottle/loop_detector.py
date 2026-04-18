"""
Client-side loop detection.
Runs inside the agent process — can raise warnings or stop the agent early.
"""
from __future__ import annotations
import hashlib
import json
from collections import Counter
from dataclasses import dataclass, field
from typing import Any


MAX_ITERATIONS = 25
TOOL_REPEAT_THRESHOLD = 5
IDENTICAL_INPUT_THRESHOLD = 3


@dataclass
class LoopSignal:
    detected: bool
    reason: str | None


class LoopDetector:
    """
    Stateful per-session loop detector.
    Track LLM iterations and tool call patterns.
    """

    def __init__(self):
        self.iteration_count: int = 0
        self._tool_history: list[tuple[str, str]] = []    # (tool_name, input_hash)
        self._consecutive_tool: dict[str, int] = {}
        self._last_tool: str | None = None
        self._loop_detected: bool = False
        self._loop_reason: str | None = None

    def record_llm_call(self) -> LoopSignal:
        self.iteration_count += 1
        if self.iteration_count >= MAX_ITERATIONS:
            signal = LoopSignal(
                detected=True,
                reason=f"iteration_count={self.iteration_count} exceeded threshold={MAX_ITERATIONS}"
            )
            self._loop_detected = True
            self._loop_reason = signal.reason
            return signal
        return LoopSignal(detected=False, reason=None)

    def record_tool_call(self, name: str, input_args: dict[str, Any] | None = None) -> LoopSignal:
        # Hash input args for identity detection
        input_hash = ""
        if input_args:
            try:
                raw = json.dumps(input_args, sort_keys=True, default=str)
                input_hash = hashlib.md5(raw.encode()).hexdigest()[:16]
            except Exception:
                pass

        self._tool_history.append((name, input_hash))

        # Check identical inputs
        identical_count = sum(
            1 for tn, ih in self._tool_history if tn == name and ih == input_hash and input_hash
        )
        if identical_count >= IDENTICAL_INPUT_THRESHOLD:
            signal = LoopSignal(
                detected=True,
                reason=f"repeated_tool:{name} called {identical_count}x with identical inputs"
            )
            self._loop_detected = True
            self._loop_reason = signal.reason
            return signal

        # Check consecutive calls (regardless of input)
        if name == self._last_tool:
            self._consecutive_tool[name] = self._consecutive_tool.get(name, 1) + 1
        else:
            self._consecutive_tool = {name: 1}
            self._last_tool = name

        if self._consecutive_tool.get(name, 0) >= TOOL_REPEAT_THRESHOLD:
            signal = LoopSignal(
                detected=True,
                reason=f"repeated_tool:{name} called {self._consecutive_tool[name]}x consecutively"
            )
            self._loop_detected = True
            self._loop_reason = signal.reason
            return signal

        return LoopSignal(detected=False, reason=None)

    def get_report(self) -> dict:
        return {
            "iteration_count": self.iteration_count,
            "tool_call_count": len(self._tool_history),
            "unique_tools": len({tn for tn, _ in self._tool_history}),
            "loop_detected": self._loop_detected,
            "loop_reason": self._loop_reason,
        }

    def reset(self) -> None:
        self.iteration_count = 0
        self._tool_history = []
        self._consecutive_tool = {}
        self._last_tool = None
