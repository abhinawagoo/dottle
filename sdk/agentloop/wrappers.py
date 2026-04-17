"""
Drop-in wrappers for popular LLM clients.
Zero code change required — just wrap the client once at startup.

Usage:
    # OpenAI
    from openai import OpenAI
    import agentloop

    client = agentloop.wrap_openai(OpenAI())

    with agentloop.session("my-agent") as sid:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": "Hello"}]
        )
    # ↑ automatically tracked — no manual spans needed

    # Anthropic
    from anthropic import Anthropic
    import agentloop

    client = agentloop.wrap_anthropic(Anthropic())

    with agentloop.session("my-agent") as sid:
        response = client.messages.create(
            model="claude-opus-4-6",
            max_tokens=1024,
            messages=[{"role": "user", "content": "Hello"}]
        )
"""
from __future__ import annotations

import functools
import logging
from typing import Any

from agentloop.context import _current_session_id, span as al_span

logger = logging.getLogger("agentloop")


# ── OpenAI ─────────────────────────────────────────────────────────────────────

def wrap_openai(client: Any) -> Any:
    """
    Wrap an OpenAI client to automatically track all chat.completions.create calls.

    Supports: openai>=1.0.0
    Does NOT intercept streaming calls (stream=True) — those pass through unchanged.

    Args:
        client: An OpenAI() instance

    Returns:
        The same client instance, patched in-place. Safe to call multiple times.
    """
    if getattr(client, "_agentloop_wrapped", False):
        return client

    original_create = client.chat.completions.create

    @functools.wraps(original_create)
    def tracked_create(*args, **kwargs):
        sid = _current_session_id.get()

        # No active session → pass through silently (fail-safe)
        if not sid:
            return original_create(*args, **kwargs)

        # Streaming is not intercepted yet
        if kwargs.get("stream"):
            return original_create(*args, **kwargs)

        model = kwargs.get("model", "gpt-4o")
        messages = kwargs.get("messages", [])

        input_text = _extract_openai_input(messages)

        with al_span("llm", model) as s:
            try:
                response = original_create(*args, **kwargs)

                output_text = None
                finish_reason = None
                if response.choices:
                    choice = response.choices[0]
                    finish_reason = getattr(choice, "finish_reason", None)
                    msg = getattr(choice, "message", None)
                    if msg:
                        output_text = getattr(msg, "content", None)

                if response.usage:
                    s.record_tokens(
                        input=response.usage.prompt_tokens,
                        output=response.usage.completion_tokens,
                        model=model,
                    )
                else:
                    s.model = model

                if input_text or output_text:
                    s.record_prompt(input_text or "", output_text or "")

                s.set_attribute("provider", "openai")
                if finish_reason:
                    s.set_attribute("finish_reason", finish_reason)

                return response

            except Exception as exc:
                s.set_error(str(exc), type(exc).__name__)
                raise

    client.chat.completions.create = tracked_create
    client._agentloop_wrapped = True
    return client


def _extract_openai_input(messages: list[dict]) -> str | None:
    """Pull system + last user message from an OpenAI messages list."""
    parts = []
    system = next(
        (m.get("content", "") for m in messages if m.get("role") == "system"), None
    )
    if system:
        parts.append(f"[system]: {system}")

    # Last user message only
    for m in reversed(messages):
        if m.get("role") == "user":
            content = m.get("content", "")
            if isinstance(content, str):
                parts.append(content)
            elif isinstance(content, list):
                # vision / multi-modal content blocks
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "text":
                        parts.append(block["text"])
            break

    return "\n".join(parts) if parts else None


# ── Anthropic ──────────────────────────────────────────────────────────────────

def wrap_anthropic(client: Any) -> Any:
    """
    Wrap an Anthropic client to automatically track all messages.create calls.

    Supports: anthropic>=0.20.0
    Does NOT intercept streaming calls (stream=True) — those pass through unchanged.

    Args:
        client: An Anthropic() instance

    Returns:
        The same client instance, patched in-place. Safe to call multiple times.
    """
    if getattr(client, "_agentloop_wrapped", False):
        return client

    original_create = client.messages.create

    @functools.wraps(original_create)
    def tracked_create(*args, **kwargs):
        sid = _current_session_id.get()

        if not sid:
            return original_create(*args, **kwargs)

        if kwargs.get("stream"):
            return original_create(*args, **kwargs)

        model = kwargs.get("model", "claude-opus-4-6")
        messages = kwargs.get("messages", [])
        system = kwargs.get("system", "")

        input_text = _extract_anthropic_input(system, messages)

        with al_span("llm", model) as s:
            try:
                response = original_create(*args, **kwargs)

                # Extract text blocks from response
                output_text = None
                content = getattr(response, "content", [])
                if content:
                    texts = [
                        getattr(block, "text", "")
                        for block in content
                        if hasattr(block, "text")
                    ]
                    output_text = "\n".join(texts) if texts else None

                usage = getattr(response, "usage", None)
                if usage:
                    s.record_tokens(
                        input=usage.input_tokens,
                        output=usage.output_tokens,
                        model=model,
                    )
                else:
                    s.model = model

                if input_text or output_text:
                    s.record_prompt(input_text or "", output_text or "")

                s.set_attribute("provider", "anthropic")
                stop_reason = getattr(response, "stop_reason", None)
                if stop_reason:
                    s.set_attribute("stop_reason", stop_reason)

                return response

            except Exception as exc:
                s.set_error(str(exc), type(exc).__name__)
                raise

    client.messages.create = tracked_create
    client._agentloop_wrapped = True
    return client


def _extract_anthropic_input(system: str | list | None, messages: list[dict]) -> str | None:
    """Pull system prompt + last user message from Anthropic-format messages."""
    parts = []

    if system:
        if isinstance(system, str) and system:
            parts.append(f"[system]: {system}")
        elif isinstance(system, list):
            for block in system:
                if isinstance(block, dict) and block.get("type") == "text":
                    parts.append(f"[system]: {block['text']}")

    for m in reversed(messages):
        if m.get("role") == "user":
            content = m.get("content", "")
            if isinstance(content, str):
                parts.append(content)
            elif isinstance(content, list):
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "text":
                        parts.append(block["text"])
            break

    return "\n".join(parts) if parts else None
