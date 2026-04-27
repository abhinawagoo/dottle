"""
Dottle SDK — Instrument your AI agents in 3 lines of code.

Quick start:
    import dottle

    dottle.configure(api_key="dtl_live_...")

    with dottle.session("my_agent") as sid:
        with dottle.span("llm", "gpt-4o call") as s:
            result = llm.complete(prompt)
            s.record_tokens(input=512, output=128, model="gpt-4o")

        with dottle.span("tool", "search_web") as s:
            data = search(query)

Async agents:
    async with dottle.async_session("my_agent") as sid:
        async with dottle.async_span("llm", "gpt-4o call") as s:
            result = await llm.complete(prompt)
            s.record_tokens(input=512, output=128, model="gpt-4o")

Framework integrations:
    from dottle.integrations.crewai import instrument_crew
    from dottle.integrations.autogen import instrument_agent
    from dottle.integrations.agno import instrument_agno_agent
"""

from dottle.config import configure, get_config, AgentLoopConfig
from dottle.context import session, span, async_session, async_span
from dottle.decorators import task, tool_call, llm_call
from dottle.client import get_client, reset_client
from dottle.wrappers import wrap_openai, wrap_anthropic

__version__ = "0.1.3"
__all__ = [
    # Config
    "configure",
    "get_config",
    "AgentLoopConfig",
    # Sync context managers
    "session",
    "span",
    # Async context managers
    "async_session",
    "async_span",
    # Decorators
    "task",
    "tool_call",
    "llm_call",
    # Client
    "get_client",
    "reset_client",
    # Auto-wrappers
    "wrap_openai",
    "wrap_anthropic",
]
