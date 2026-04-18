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
"""

from dottle.config import configure, get_config, AgentLoopConfig
from dottle.context import session, span
from dottle.decorators import task, tool_call, llm_call
from dottle.client import get_client, reset_client
from dottle.wrappers import wrap_openai, wrap_anthropic

__version__ = "0.1.1"
__all__ = [
    "configure",
    "get_config",
    "AgentLoopConfig",
    "session",
    "span",
    "task",
    "tool_call",
    "llm_call",
    "get_client",
    "reset_client",
    "wrap_openai",
    "wrap_anthropic",
]
