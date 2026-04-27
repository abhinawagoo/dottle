"""
Context managers and span tracking for the current session/span stack.
Uses contextvars so concurrent async tasks each have their own session context.
"""
from __future__ import annotations
import hashlib
import json
import uuid
from contextlib import contextmanager, asynccontextmanager
from contextvars import ContextVar
from typing import AsyncGenerator
from datetime import datetime, timezone
from typing import Any, Generator, AsyncGenerator

from dottle.client import get_client
from dottle.loop_detector import LoopDetector
from dottle.models import SpanPayload
from dottle.redaction import maybe_redact

# Per-context state
_current_session_id: ContextVar[str | None] = ContextVar("dottle_session_id", default=None)
_span_stack: ContextVar[list[str]] = ContextVar("dottle_span_stack", default=[])
_loop_detector: ContextVar[LoopDetector | None] = ContextVar("dottle_loop_detector", default=None)
_iteration_count: ContextVar[int] = ContextVar("dottle_iteration_count", default=0)


class SpanContext:
    """Mutable context for an active span."""

    def __init__(self, span_id: str, span_type: str, name: str, parent_span_id: str | None):
        self.span_id = span_id
        self.span_type = span_type
        self.name = name
        self.parent_span_id = parent_span_id
        self.started_at = datetime.now(timezone.utc)
        self.model: str | None = None
        self.input_tokens: int | None = None
        self.output_tokens: int | None = None
        self.input_text: str | None = None
        self.output_text: str | None = None
        self.status = "ok"
        self.error_message: str | None = None
        self.error_type: str | None = None
        self.attributes: dict[str, Any] = {}

    def record_tokens(self, input: int, output: int, model: str) -> None:
        self.input_tokens = input
        self.output_tokens = output
        self.model = model

    def record_prompt(self, input_text: str, output_text: str) -> None:
        """Store the actual prompt and response text for this LLM span."""
        from dottle.config import get_config
        redact = get_config().redact_pii
        self.input_text = maybe_redact(input_text, redact)
        self.output_text = maybe_redact(output_text, redact)

    def set_attribute(self, key: str, value: Any) -> None:
        self.attributes[key] = value

    def set_error(self, message: str, error_type: str | None = None) -> None:
        self.status = "error"
        self.error_message = message
        self.error_type = error_type

    # Alias — both names work
    record_error = set_error

    def _to_payload(self) -> SpanPayload:
        ended_at = datetime.now(timezone.utc)
        duration_ms = int((ended_at - self.started_at).total_seconds() * 1000)
        return SpanPayload(
            span_id=self.span_id,
            parent_span_id=self.parent_span_id,
            span_type=self.span_type,
            name=self.name,
            status=self.status,
            started_at=self.started_at,
            ended_at=ended_at,
            duration_ms=duration_ms,
            model=self.model,
            input_tokens=self.input_tokens,
            output_tokens=self.output_tokens,
            input_text=self.input_text,
            output_text=self.output_text,
            error_message=self.error_message,
            error_type=self.error_type,
            attributes=self.attributes,
        )


@contextmanager
def session(
    agent_name: str,
    session_id: str | None = None,
    external_id: str | None = None,
    metadata: dict[str, Any] | None = None,
    user_id: str | None = None,
    user_email: str | None = None,
    tags: list[str] | None = None,
    agent_version: str | None = None,
) -> Generator[str, None, None]:
    """
    Context manager for a full agent session.

    Usage:
        with dottle.session("my_agent") as sid:
            ...
        with dottle.session("my_agent", user_id="u123", tags=["prod"]) as sid:
            ...
    """
    client = get_client()
    detector = LoopDetector()

    sid = client.start_session(
        agent_name=agent_name,
        session_id=session_id,
        external_id=external_id,
        metadata=metadata,
        user_id=user_id,
        user_email=user_email,
        tags=tags,
        agent_version=agent_version,
    )
    token_sid = _current_session_id.set(sid)
    token_stack = _span_stack.set([])
    token_detector = _loop_detector.set(detector)
    token_iter = _iteration_count.set(0)

    final_status = "completed"
    error_message = None
    error_type = None

    try:
        yield sid
    except Exception as exc:
        final_status = "failed"
        error_message = str(exc)
        error_type = type(exc).__name__
        raise
    finally:
        report = detector.get_report()
        loop_detected = report.get("loop_detected", False)
        loop_reason = report.get("loop_reason", None)
        if loop_detected and final_status == "completed":
            final_status = "looping"
        client.end_session(
            session_id=sid,
            status=final_status,
            error_message=error_message,
            error_type=error_type,
            loop_detected=loop_detected,
            loop_reason=loop_reason,
            iteration_count=report["iteration_count"],
        )
        _current_session_id.reset(token_sid)
        _span_stack.reset(token_stack)
        _loop_detector.reset(token_detector)
        _iteration_count.reset(token_iter)


@contextmanager
def span(
    span_type: str,
    name: str,
    input_args: dict[str, Any] | None = None,
) -> Generator[SpanContext, None, None]:
    """
    Context manager for any timed operation.

    Usage:
        with dottle.span("llm", "gpt-4o call") as s:
            result = llm.complete(prompt)
            s.record_tokens(input=100, output=50, model="gpt-4o")
    """
    client = get_client()
    sid = _current_session_id.get()
    stack = _span_stack.get()
    detector = _loop_detector.get()

    parent_id = stack[-1] if stack else None
    span_id = str(uuid.uuid4())

    ctx = SpanContext(
        span_id=span_id,
        span_type=span_type,
        name=name,
        parent_span_id=parent_id,
    )

    # Hash input args for tool loop detection
    if input_args:
        try:
            raw = json.dumps(input_args, sort_keys=True, default=str)
            ctx.attributes["input_hash"] = hashlib.md5(raw.encode()).hexdigest()[:16]
        except Exception:
            pass

    new_stack = stack + [span_id]
    token_stack = _span_stack.set(new_stack)

    try:
        yield ctx
    except Exception as exc:
        ctx.set_error(str(exc), type(exc).__name__)
        raise
    finally:
        payload = ctx._to_payload()

        # Run loop detector
        if detector:
            if span_type == "llm":
                signal = detector.record_llm_call()
            elif span_type == "tool":
                signal = detector.record_tool_call(name, input_args)
            else:
                signal = None

            if signal and signal.detected:
                payload.attributes["loop_detected"] = True
                payload.attributes["loop_reason"] = signal.reason

        if sid:
            client.add_span(payload)

        _span_stack.reset(token_stack)


# ── Async variants ────────────────────────────────────────────────────────────

@asynccontextmanager
async def async_session(
    agent_name: str,
    session_id: str | None = None,
    external_id: str | None = None,
    metadata: dict[str, Any] | None = None,
    user_id: str | None = None,
    user_email: str | None = None,
    tags: list[str] | None = None,
    agent_version: str | None = None,
) -> AsyncGenerator[str, None]:
    """
    Async context manager for a full agent session.

    Usage:
        async with dottle.async_session("my_agent") as sid:
            result = await agent.run(...)
    """
    client = get_client()
    detector = LoopDetector()

    sid = client.start_session(
        agent_name=agent_name,
        session_id=session_id,
        external_id=external_id,
        metadata=metadata,
        user_id=user_id,
        user_email=user_email,
        tags=tags,
        agent_version=agent_version,
    )
    token_sid = _current_session_id.set(sid)
    token_stack = _span_stack.set([])
    token_detector = _loop_detector.set(detector)
    token_iter = _iteration_count.set(0)

    final_status = "completed"
    error_message = None
    error_type = None

    try:
        yield sid
    except Exception as exc:
        final_status = "failed"
        error_message = str(exc)
        error_type = type(exc).__name__
        raise
    finally:
        report = detector.get_report()
        loop_detected = report.get("loop_detected", False)
        loop_reason = report.get("loop_reason", None)
        if loop_detected and final_status == "completed":
            final_status = "looping"
        client.end_session(
            session_id=sid,
            status=final_status,
            error_message=error_message,
            error_type=error_type,
            loop_detected=loop_detected,
            loop_reason=loop_reason,
            iteration_count=report["iteration_count"],
        )
        _current_session_id.reset(token_sid)
        _span_stack.reset(token_stack)
        _loop_detector.reset(token_detector)
        _iteration_count.reset(token_iter)


@asynccontextmanager
async def async_span(
    span_type: str,
    name: str,
    input_args: dict[str, Any] | None = None,
) -> AsyncGenerator[SpanContext, None]:
    """
    Async context manager for any timed operation.

    Usage:
        async with dottle.async_span("llm", "gpt-4o call") as s:
            result = await llm.complete(prompt)
            s.record_tokens(input=100, output=50, model="gpt-4o")
    """
    client = get_client()
    sid = _current_session_id.get()
    stack = _span_stack.get()
    detector = _loop_detector.get()

    parent_id = stack[-1] if stack else None
    span_id = str(uuid.uuid4())

    ctx = SpanContext(
        span_id=span_id,
        span_type=span_type,
        name=name,
        parent_span_id=parent_id,
    )

    if input_args:
        try:
            raw = json.dumps(input_args, sort_keys=True, default=str)
            ctx.attributes["input_hash"] = hashlib.md5(raw.encode()).hexdigest()[:16]
        except Exception:
            pass

    new_stack = stack + [span_id]
    token_stack = _span_stack.set(new_stack)

    try:
        yield ctx
    except Exception as exc:
        ctx.set_error(str(exc), type(exc).__name__)
        raise
    finally:
        payload = ctx._to_payload()

        if detector:
            if span_type == "llm":
                signal = detector.record_llm_call()
            elif span_type == "tool":
                signal = detector.record_tool_call(name, input_args)
            else:
                signal = None

            if signal and signal.detected:
                payload.attributes["loop_detected"] = True
                payload.attributes["loop_reason"] = signal.reason

        if sid:
            client.add_span(payload)

        _span_stack.reset(token_stack)
