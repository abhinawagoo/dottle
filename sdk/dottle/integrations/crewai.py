"""
CrewAI integration for Dottle.

Automatically tracks every CrewAI task and LLM call as Dottle spans.

Usage:
    from crewai import Crew, Agent, Task
    from dottle.integrations.crewai import DottleCrewCallback
    import dottle

    dottle.configure(api_key="dtl_live_...")
    callback = DottleCrewCallback()

    researcher = Agent(
        role="Researcher",
        goal="Research AI trends",
        backstory="Expert researcher",
        step_callback=callback.on_agent_step,
    )

    task = Task(description="Research the latest AI trends", agent=researcher)

    crew = Crew(
        agents=[researcher],
        tasks=[task],
        step_callback=callback.on_agent_step,
        task_callback=callback.on_task_complete,
    )

    with dottle.session("research-crew") as sid:
        result = crew.kickoff()
"""
from __future__ import annotations

import logging
import uuid
import time
from typing import Any, Optional

from dottle.context import _current_session_id, _span_stack
from dottle.client import get_client
from dottle.models import SpanPayload

logger = logging.getLogger("dottle.crewai")

try:
    from crewai import Task as CrewTask
    _CREWAI_AVAILABLE = True
except ImportError:
    _CREWAI_AVAILABLE = False


class DottleCrewCallback:
    """
    CrewAI callback handler that records task execution as Dottle spans.

    Pass instance methods as step_callback / task_callback on your Crew or Agent:

        callback = DottleCrewCallback()
        crew = Crew(..., task_callback=callback.on_task_complete)
    """

    def __init__(self, agent_name: str = "crew"):
        self._agent_name = agent_name
        self._task_spans: dict[str, tuple[str, float]] = {}  # task_id -> (span_id, start_time)

    # ── Task lifecycle ────────────────────────────────────────────────────────

    def on_task_start(self, task: Any, agent: Any = None) -> None:
        """Call at the beginning of each task (wire up manually if needed)."""
        session_id = _current_session_id.get()
        if not session_id:
            return

        task_id = _task_id(task)
        span_id = str(uuid.uuid4())
        self._task_spans[task_id] = (span_id, time.time())

        try:
            client = get_client()
            span = SpanPayload(
                span_id=span_id,
                session_id=session_id,
                span_type="agent",
                name=f"task:{_task_description(task)[:60]}",
                started_at=_now_iso(),
                input_text=_task_description(task),
                metadata={"agent": str(getattr(agent, "role", "unknown"))},
            )
            client._buffer_span(span)
            _span_stack.get().append(span_id)
        except Exception as e:
            logger.debug("dottle crewai on_task_start error: %s", e)

    def on_task_complete(self, task: Any) -> None:
        """Called by CrewAI after each task completes (use as task_callback)."""
        session_id = _current_session_id.get()
        if not session_id:
            return

        task_id = _task_id(task)
        span_data = self._task_spans.pop(task_id, None)

        try:
            client = get_client()
            output = _task_output(task)
            span_id = span_data[0] if span_data else str(uuid.uuid4())
            start_t = span_data[1] if span_data else time.time()

            span = SpanPayload(
                span_id=span_id,
                session_id=session_id,
                span_type="agent",
                name=f"task:{_task_description(task)[:60]}",
                started_at=_now_iso(),
                ended_at=_now_iso(),
                duration_ms=int((time.time() - start_t) * 1000),
                output_text=str(output)[:2000] if output else None,
                status="success",
            )
            client._buffer_span(span)
            stack = _span_stack.get()
            if span_id in stack:
                stack.remove(span_id)
        except Exception as e:
            logger.debug("dottle crewai on_task_complete error: %s", e)

    def on_agent_step(self, step: Any) -> None:
        """Called after each agent step (use as step_callback)."""
        session_id = _current_session_id.get()
        if not session_id:
            return

        try:
            client = get_client()
            # Extract tool use if present
            action = getattr(step, "action", None)
            tool_name = getattr(action, "tool", None) if action else None
            tool_input = getattr(action, "tool_input", None) if action else None
            observation = getattr(step, "observation", None)

            if tool_name:
                span = SpanPayload(
                    span_id=str(uuid.uuid4()),
                    session_id=session_id,
                    span_type="tool",
                    name=tool_name,
                    started_at=_now_iso(),
                    ended_at=_now_iso(),
                    duration_ms=0,
                    input_text=str(tool_input)[:500] if tool_input else None,
                    output_text=str(observation)[:1000] if observation else None,
                    status="success",
                )
                client._buffer_span(span)
        except Exception as e:
            logger.debug("dottle crewai on_agent_step error: %s", e)


def instrument_crew(crew: Any) -> Any:
    """
    Convenience function — attach a DottleCrewCallback to an existing Crew instance.

    Usage:
        from dottle.integrations.crewai import instrument_crew
        crew = instrument_crew(Crew(...))
    """
    if not _CREWAI_AVAILABLE:
        logger.warning("crewai not installed — skipping instrumentation")
        return crew

    callback = DottleCrewCallback()
    try:
        crew.task_callback = callback.on_task_complete
        crew.step_callback = callback.on_agent_step
    except Exception as e:
        logger.warning("Could not attach DottleCrewCallback to crew: %s", e)
    return crew


# ── Helpers ───────────────────────────────────────────────────────────────────

def _task_id(task: Any) -> str:
    return str(id(task))


def _task_description(task: Any) -> str:
    return str(getattr(task, "description", "") or getattr(task, "name", "unknown"))


def _task_output(task: Any) -> Any:
    output = getattr(task, "output", None)
    if output is None:
        return None
    return getattr(output, "raw", None) or getattr(output, "result", None) or str(output)


def _now_iso() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()
