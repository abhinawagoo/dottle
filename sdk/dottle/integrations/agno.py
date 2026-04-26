"""
Agno integration for Dottle.

Records every Agno Agent run, tool call, and model response as Dottle spans.

Usage:
    from agno.agent import Agent
    from agno.models.anthropic import Claude
    from dottle.integrations.agno import instrument_agno_agent
    import dottle

    dottle.configure(api_key="dtl_live_...")

    agent = Agent(
        model=Claude(id="claude-sonnet-4-6"),
        instructions="You are a helpful assistant.",
    )
    instrument_agno_agent(agent)

    with dottle.session("agno-agent") as sid:
        agent.run("What is the capital of France?")

Or use the context manager style:
    from dottle.integrations.agno import DottleAgnoSession

    with DottleAgnoSession("agno-agent"):
        agent.run("What is the capital of France?")
"""
from __future__ import annotations

import logging
import uuid
import time
import functools
from typing import Any

from dottle.context import _current_session_id
from dottle.client import get_client
from dottle.models import SpanPayload

logger = logging.getLogger("dottle.agno")

try:
    from agno.agent import Agent as AgnoAgent
    _AGNO_AVAILABLE = True
except ImportError:
    _AGNO_AVAILABLE = False


def instrument_agno_agent(agent: Any) -> Any:
    """
    Patch an Agno Agent to record runs and tool calls as Dottle spans.

    Modifies the agent in-place and returns it.
    """
    if not _AGNO_AVAILABLE:
        logger.warning("agno not installed — skipping instrumentation")
        return agent

    agent_name = getattr(agent, "name", None) or type(agent).__name__

    # ── Wrap agent.run() ──────────────────────────────────────────────────────
    original_run = getattr(agent, "run", None)
    if original_run and not getattr(original_run, "_dottle_wrapped", False):
        @functools.wraps(original_run)
        def wrapped_run(message=None, *args, **kwargs):
            session_id = _current_session_id.get()
            if not session_id:
                return original_run(message, *args, **kwargs)

            span_id = str(uuid.uuid4())
            start = time.time()
            try:
                result = original_run(message, *args, **kwargs)
                status = "success"
                output_text = _extract_content(result)
            except Exception as exc:
                status = "error"
                output_text = str(exc)
                raise
            finally:
                _emit_span(
                    session_id=session_id,
                    span_id=span_id,
                    span_type="agent",
                    name=f"{agent_name}.run",
                    start=start,
                    input_text=str(message)[:2000] if message else None,
                    output_text=output_text,
                    status=status,
                    metadata={"agent": agent_name},
                )
            return result

        wrapped_run._dottle_wrapped = True
        agent.run = wrapped_run

    # ── Wrap agent.arun() (async) ─────────────────────────────────────────────
    original_arun = getattr(agent, "arun", None)
    if original_arun and not getattr(original_arun, "_dottle_wrapped", False):
        @functools.wraps(original_arun)
        async def wrapped_arun(message=None, *args, **kwargs):
            session_id = _current_session_id.get()
            if not session_id:
                return await original_arun(message, *args, **kwargs)

            span_id = str(uuid.uuid4())
            start = time.time()
            try:
                result = await original_arun(message, *args, **kwargs)
                status = "success"
                output_text = _extract_content(result)
            except Exception as exc:
                status = "error"
                output_text = str(exc)
                raise
            finally:
                _emit_span(
                    session_id=session_id,
                    span_id=span_id,
                    span_type="agent",
                    name=f"{agent_name}.run",
                    start=start,
                    input_text=str(message)[:2000] if message else None,
                    output_text=output_text,
                    status=status,
                    metadata={"agent": agent_name},
                )
            return result

        wrapped_arun._dottle_wrapped = True
        agent.arun = wrapped_arun

    # ── Hook into tool execution via model response processing ────────────────
    _patch_tools(agent, agent_name)

    logger.debug("Dottle instrumented Agno agent '%s'", agent_name)
    return agent


def _patch_tools(agent: Any, agent_name: str):
    """Wrap each registered tool's entrypoint to record tool spans."""
    tools = getattr(agent, "tools", None) or []
    for tool in tools:
        fn = getattr(tool, "entrypoint", None) or getattr(tool, "func", None)
        if fn and not getattr(fn, "_dottle_wrapped", False):
            tool_name = getattr(tool, "name", None) or getattr(fn, "__name__", "tool")

            @functools.wraps(fn)
            def make_wrapped(original_fn, tname):
                def wrapped(*args, **kwargs):
                    session_id = _current_session_id.get()
                    if not session_id:
                        return original_fn(*args, **kwargs)
                    start = time.time()
                    try:
                        result = original_fn(*args, **kwargs)
                        status = "success"
                    except Exception as exc:
                        status = "error"
                        raise
                    finally:
                        _emit_span(
                            session_id=session_id,
                            span_id=str(uuid.uuid4()),
                            span_type="tool",
                            name=tname,
                            start=start,
                            status=status,
                            metadata={"agent": agent_name},
                        )
                    return result
                wrapped._dottle_wrapped = True
                return wrapped

            if hasattr(tool, "entrypoint"):
                tool.entrypoint = make_wrapped(fn, tool_name)
            else:
                tool.func = make_wrapped(fn, tool_name)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _extract_content(result: Any) -> str | None:
    """Extract text content from an Agno RunResponse."""
    if result is None:
        return None
    # RunResponse.content is the primary output
    content = getattr(result, "content", None)
    if content and isinstance(content, str):
        return content[:2000]
    # Fallback: messages list
    messages = getattr(result, "messages", None)
    if messages:
        last = messages[-1] if messages else None
        if last:
            return str(getattr(last, "content", ""))[:2000]
    return str(result)[:2000]


def _emit_span(
    session_id: str,
    span_id: str,
    span_type: str,
    name: str,
    start: float,
    input_text: str | None = None,
    output_text: str | None = None,
    status: str = "success",
    metadata: dict | None = None,
):
    try:
        client = get_client()
        span = SpanPayload(
            span_id=span_id,
            session_id=session_id,
            span_type=span_type,
            name=name,
            started_at=_ts(start),
            ended_at=_now_iso(),
            duration_ms=int((time.time() - start) * 1000),
            input_text=input_text,
            output_text=output_text,
            status=status,
            metadata=metadata or {},
        )
        client._buffer_span(span)
    except Exception as e:
        logger.debug("dottle agno span error: %s", e)


def _now_iso() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


def _ts(t: float) -> str:
    from datetime import datetime, timezone
    return datetime.fromtimestamp(t, tz=timezone.utc).isoformat()
