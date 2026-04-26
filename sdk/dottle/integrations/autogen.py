"""
AutoGen integration for Dottle.

Wraps AutoGen ConversableAgent to automatically record every LLM call and
tool execution as Dottle spans inside the current session context.

Usage:
    from autogen import ConversableAgent, UserProxyAgent
    from dottle.integrations.autogen import instrument_agent
    import dottle

    dottle.configure(api_key="dtl_live_...")

    assistant = ConversableAgent("assistant", llm_config={...})
    user      = UserProxyAgent("user", human_input_mode="NEVER")

    instrument_agent(assistant)
    instrument_agent(user)

    with dottle.session("autogen-chat") as sid:
        user.initiate_chat(assistant, message="What is 2+2?")
"""
from __future__ import annotations

import logging
import uuid
import time
import functools
from typing import Any, Optional

from dottle.context import _current_session_id
from dottle.client import get_client
from dottle.models import SpanPayload

logger = logging.getLogger("dottle.autogen")

try:
    from autogen import ConversableAgent
    _AUTOGEN_AVAILABLE = True
except ImportError:
    try:
        from autogen.agentchat import ConversableAgent  # type: ignore
        _AUTOGEN_AVAILABLE = True
    except ImportError:
        _AUTOGEN_AVAILABLE = False


def instrument_agent(agent: Any, *, record_messages: bool = True) -> Any:
    """
    Patch a ConversableAgent (or subclass) to record its LLM calls and
    tool executions as Dottle spans.

    Modifies the agent in-place and returns it.

    Args:
        agent: any AutoGen ConversableAgent instance
        record_messages: if True, records message content (may contain PII)
    """
    if not _AUTOGEN_AVAILABLE:
        logger.warning("autogen not installed — skipping instrumentation")
        return agent

    agent_name = getattr(agent, "name", type(agent).__name__)

    # ── Wrap generate_reply (covers LLM calls) ────────────────────────────────
    original_generate = getattr(agent, "generate_reply", None)
    if original_generate and not getattr(original_generate, "_dottle_wrapped", False):
        @functools.wraps(original_generate)
        def wrapped_generate_reply(messages=None, sender=None, **kwargs):
            session_id = _current_session_id.get()
            if not session_id:
                return original_generate(messages=messages, sender=sender, **kwargs)

            span_id = str(uuid.uuid4())
            start = time.time()
            input_text = None
            if record_messages and messages:
                last = messages[-1] if messages else {}
                input_text = str(last.get("content", ""))[:2000]

            try:
                result = original_generate(messages=messages, sender=sender, **kwargs)
                status = "success"
                output_text = str(result)[:2000] if record_messages and result else None
            except Exception as exc:
                status = "error"
                output_text = str(exc)
                raise
            finally:
                try:
                    client = get_client()
                    span = SpanPayload(
                        span_id=span_id,
                        session_id=session_id,
                        span_type="llm",
                        name=f"{agent_name}.generate_reply",
                        started_at=_ts(start),
                        ended_at=_now_iso(),
                        duration_ms=int((time.time() - start) * 1000),
                        input_text=input_text,
                        output_text=output_text,
                        status=status,
                        metadata={"agent": agent_name},
                    )
                    client._buffer_span(span)
                except Exception as e:
                    logger.debug("dottle autogen span error: %s", e)

            return result

        wrapped_generate_reply._dottle_wrapped = True
        agent.generate_reply = wrapped_generate_reply

    # ── Wrap execute_function / execute_code_blocks (tool calls) ─────────────
    for method_name in ("execute_function", "execute_code_blocks"):
        original = getattr(agent, method_name, None)
        if original and not getattr(original, "_dottle_wrapped", False):
            def make_tool_wrapper(orig, mname):
                @functools.wraps(orig)
                def wrapped(*args, **kwargs):
                    session_id = _current_session_id.get()
                    if not session_id:
                        return orig(*args, **kwargs)

                    span_id = str(uuid.uuid4())
                    start = time.time()
                    try:
                        result = orig(*args, **kwargs)
                        status = "success"
                    except Exception as exc:
                        status = "error"
                        raise
                    finally:
                        try:
                            client = get_client()
                            span = SpanPayload(
                                span_id=span_id,
                                session_id=session_id,
                                span_type="tool",
                                name=f"{agent_name}.{mname}",
                                started_at=_ts(start),
                                ended_at=_now_iso(),
                                duration_ms=int((time.time() - start) * 1000),
                                status=status,
                                metadata={"agent": agent_name},
                            )
                            client._buffer_span(span)
                        except Exception as e:
                            logger.debug("dottle autogen tool span error: %s", e)
                    return result

                wrapped._dottle_wrapped = True
                return wrapped

            setattr(agent, method_name, make_tool_wrapper(original, method_name))

    logger.debug("Dottle instrumented AutoGen agent '%s'", agent_name)
    return agent


def instrument_group_chat(group_chat_manager: Any, **kwargs) -> Any:
    """
    Instrument all agents in a GroupChatManager's group chat.

    Usage:
        from dottle.integrations.autogen import instrument_group_chat
        manager = GroupChatManager(groupchat=gc, llm_config=llm_config)
        instrument_group_chat(manager)
    """
    if not _AUTOGEN_AVAILABLE:
        return group_chat_manager

    gc = getattr(group_chat_manager, "groupchat", None)
    agents = getattr(gc, "agents", []) if gc else []
    for agent in agents:
        instrument_agent(agent, **kwargs)
    instrument_agent(group_chat_manager, **kwargs)
    return group_chat_manager


# ── Helpers ───────────────────────────────────────────────────────────────────

def _now_iso() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


def _ts(t: float) -> str:
    from datetime import datetime, timezone
    return datetime.fromtimestamp(t, tz=timezone.utc).isoformat()
