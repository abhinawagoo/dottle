"""
LangChain integration for Dottle.

Zero-code-change tracking for any LangChain chain or agent.

Usage:
    from langchain_openai import ChatOpenAI
    from langchain.agents import AgentExecutor
    from dottle.integrations.langchain import DottleCallbackHandler
    import dottle

    dottle.configure(api_key="dtl_live_...")
    handler = DottleCallbackHandler()

    llm = ChatOpenAI(model="gpt-4o", callbacks=[handler])
    agent = AgentExecutor(agent=..., tools=..., callbacks=[handler])

    with dottle.session("langchain-agent") as sid:
        result = agent.invoke({"input": "What is the capital of France?"})

    # Every LLM call and tool invocation is automatically tracked.

Works with:
    - LangChain 0.2+ / 0.3+
    - LangGraph (each node becomes a span)
    - ChatOpenAI, ChatAnthropic, ChatGoogleGenerativeAI, etc.
    - All LangChain tools (TavilySearch, PythonREPL, etc.)
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Union

from dottle.context import _current_session_id, _span_stack, _loop_detector
from dottle.client import get_client
from dottle.models import SpanPayload

logger = logging.getLogger("dottle.langchain")

try:
    from langchain_core.callbacks import BaseCallbackHandler
    from langchain_core.outputs import LLMResult
    _LANGCHAIN_AVAILABLE = True
except ImportError:
    # Define a no-op base class so the import doesn't crash if LangChain isn't installed
    class BaseCallbackHandler:  # type: ignore[no-redef]
        pass
    _LANGCHAIN_AVAILABLE = False


class DottleCallbackHandler(BaseCallbackHandler):
    """
    LangChain BaseCallbackHandler that records every LLM call and tool use
    as an Dottle span, nested inside the current dottle.session() context.

    Must be used inside an active dottle.session() block.
    If there is no active session, all callbacks are no-ops (fail-safe).
    """

    def __init__(self) -> None:
        if not _LANGCHAIN_AVAILABLE:
            raise ImportError(
                "langchain-core is required for DottleCallbackHandler. "
                "Install it with: pip install langchain-core"
            )
        super().__init__()
        # Maps run_id → SpanContext (open spans)
        self._open_spans: dict[str, _OpenSpan] = {}

    # ── LLM callbacks ─────────────────────────────────────────────────────────

    def on_llm_start(
        self,
        serialized: dict[str, Any],
        prompts: list[str],
        *,
        run_id: uuid.UUID,
        **kwargs: Any,
    ) -> None:
        sid = _current_session_id.get()
        if not sid:
            return

        model = (
            serialized.get("kwargs", {}).get("model_name")
            or serialized.get("kwargs", {}).get("model")
            or serialized.get("name", "llm")
        )

        input_text = "\n---\n".join(prompts) if prompts else None

        span_id = str(uuid.uuid4())
        stack = _span_stack.get()
        parent_id = stack[-1] if stack else None

        open_span = _OpenSpan(
            span_id=span_id,
            span_type="llm",
            name=model,
            parent_span_id=parent_id,
            input_text=input_text,
        )
        self._open_spans[str(run_id)] = open_span

        # Push onto span stack so nested calls see this as parent
        _span_stack.set(stack + [span_id])

    def on_chat_model_start(
        self,
        serialized: dict[str, Any],
        messages: list[list[Any]],
        *,
        run_id: uuid.UUID,
        **kwargs: Any,
    ) -> None:
        sid = _current_session_id.get()
        if not sid:
            return

        model = (
            serialized.get("kwargs", {}).get("model_name")
            or serialized.get("kwargs", {}).get("model")
            or serialized.get("name", "llm")
        )

        # Flatten the nested message list to a readable string
        input_parts = []
        for msg_list in messages:
            for msg in msg_list:
                role = getattr(msg, "type", "user")
                content = getattr(msg, "content", "")
                if isinstance(content, str) and content:
                    input_parts.append(f"[{role}]: {content}")
                elif isinstance(content, list):
                    for block in content:
                        if isinstance(block, dict) and block.get("type") == "text":
                            input_parts.append(f"[{role}]: {block['text']}")
        input_text = "\n".join(input_parts) if input_parts else None

        span_id = str(uuid.uuid4())
        stack = _span_stack.get()
        parent_id = stack[-1] if stack else None

        open_span = _OpenSpan(
            span_id=span_id,
            span_type="llm",
            name=model,
            parent_span_id=parent_id,
            input_text=input_text,
        )
        self._open_spans[str(run_id)] = open_span
        _span_stack.set(stack + [span_id])

    def on_llm_end(
        self,
        response: "LLMResult",
        *,
        run_id: uuid.UUID,
        **kwargs: Any,
    ) -> None:
        key = str(run_id)
        open_span = self._open_spans.pop(key, None)
        if not open_span:
            return

        # Extract output text
        output_text = None
        if response.generations:
            texts = []
            for gen_list in response.generations:
                for gen in gen_list:
                    text = getattr(gen, "text", None) or (
                        getattr(getattr(gen, "message", None), "content", None)
                    )
                    if text:
                        texts.append(str(text))
            output_text = "\n".join(texts) if texts else None

        # Extract token usage
        input_tokens = output_tokens = None
        model = open_span.name
        llm_output = response.llm_output or {}
        token_usage = llm_output.get("token_usage") or llm_output.get("usage")
        if token_usage:
            input_tokens = token_usage.get("prompt_tokens") or token_usage.get("input_tokens")
            output_tokens = token_usage.get("completion_tokens") or token_usage.get("output_tokens")
            model = llm_output.get("model_name", model)

        open_span.finish(
            output_text=output_text,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            model=model,
        )
        _pop_span_stack(open_span.span_id)

    def on_llm_error(
        self,
        error: BaseException,
        *,
        run_id: uuid.UUID,
        **kwargs: Any,
    ) -> None:
        key = str(run_id)
        open_span = self._open_spans.pop(key, None)
        if open_span:
            open_span.finish(error=error)
            _pop_span_stack(open_span.span_id)

    # ── Tool callbacks ─────────────────────────────────────────────────────────

    def on_tool_start(
        self,
        serialized: dict[str, Any],
        input_str: str,
        *,
        run_id: uuid.UUID,
        **kwargs: Any,
    ) -> None:
        sid = _current_session_id.get()
        if not sid:
            return

        tool_name = serialized.get("name", "tool")

        span_id = str(uuid.uuid4())
        stack = _span_stack.get()
        parent_id = stack[-1] if stack else None

        open_span = _OpenSpan(
            span_id=span_id,
            span_type="tool",
            name=tool_name,
            parent_span_id=parent_id,
            input_text=input_str[:2000] if input_str else None,
            attributes={"input_str": input_str[:500] if input_str else ""},
        )
        self._open_spans[str(run_id)] = open_span
        _span_stack.set(stack + [span_id])

        # Notify loop detector
        detector = _loop_detector.get()
        if detector:
            try:
                import json
                input_args = {"input": input_str}
                detector.record_tool_call(tool_name, input_args)
            except Exception:
                pass

    def on_tool_end(
        self,
        output: str,
        *,
        run_id: uuid.UUID,
        **kwargs: Any,
    ) -> None:
        key = str(run_id)
        open_span = self._open_spans.pop(key, None)
        if open_span:
            open_span.finish(output_text=str(output)[:2000] if output else None)
            _pop_span_stack(open_span.span_id)

    def on_tool_error(
        self,
        error: BaseException,
        *,
        run_id: uuid.UUID,
        **kwargs: Any,
    ) -> None:
        key = str(run_id)
        open_span = self._open_spans.pop(key, None)
        if open_span:
            open_span.finish(error=error)
            _pop_span_stack(open_span.span_id)

    # ── Agent callbacks (optional enrichment) ──────────────────────────────────

    def on_agent_action(self, action: Any, *, run_id: uuid.UUID, **kwargs: Any) -> None:
        detector = _loop_detector.get()
        if detector:
            detector.record_llm_call()

    def on_chain_error(self, error: BaseException, *, run_id: uuid.UUID, **kwargs: Any) -> None:
        logger.debug(f"LangChain chain error (run={run_id}): {error}")


# ── Internal helpers ───────────────────────────────────────────────────────────

def _pop_span_stack(span_id: str) -> None:
    """Remove a specific span_id from the stack (safe even if already gone)."""
    stack = _span_stack.get()
    if span_id in stack:
        new_stack = [s for s in stack if s != span_id]
        _span_stack.set(new_stack)


class _OpenSpan:
    """Tracks an in-flight span until its on_*_end callback fires."""

    def __init__(
        self,
        span_id: str,
        span_type: str,
        name: str,
        parent_span_id: str | None,
        input_text: str | None = None,
        attributes: dict | None = None,
    ) -> None:
        self.span_id = span_id
        self.span_type = span_type
        self.name = name
        self.parent_span_id = parent_span_id
        self.input_text = input_text
        self.attributes = attributes or {}
        self.started_at = datetime.now(timezone.utc)

    def finish(
        self,
        output_text: str | None = None,
        input_tokens: int | None = None,
        output_tokens: int | None = None,
        model: str | None = None,
        error: BaseException | None = None,
    ) -> None:
        sid = _current_session_id.get()
        if not sid:
            return

        ended_at = datetime.now(timezone.utc)
        duration_ms = int((ended_at - self.started_at).total_seconds() * 1000)

        status = "error" if error else "ok"
        error_message = str(error) if error else None
        error_type = type(error).__name__ if error else None

        # Cost calculation (best-effort)
        cost_usd: float | None = None
        if input_tokens and output_tokens and model:
            try:
                from dottle.services.cost import estimate_cost
                cost_usd = estimate_cost(model, input_tokens, output_tokens)
            except Exception:
                pass

        payload = SpanPayload(
            span_id=self.span_id,
            parent_span_id=self.parent_span_id,
            span_type=self.span_type,
            name=model or self.name,
            status=status,
            started_at=self.started_at,
            ended_at=ended_at,
            duration_ms=duration_ms,
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            input_text=self.input_text,
            output_text=output_text,
            error_message=error_message,
            error_type=error_type,
            attributes=self.attributes,
        )

        try:
            client = get_client()
            client.add_span(payload)
        except Exception as exc:
            logger.warning(f"Dottle: failed to record LangChain span: {exc}")
