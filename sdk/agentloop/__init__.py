"""
Agentloop SDK — Instrument your AI agents in 3 lines of code.

Quick start:
    import agentloop

    agentloop.configure(api_key="alp_live_...")

    with agentloop.session("my_agent") as sid:
        with agentloop.span("llm", "gpt-4o call") as s:
            result = llm.complete(prompt)
            s.record_tokens(input=512, output=128, model="gpt-4o")

        with agentloop.span("tool", "search_web") as s:
            data = search(query)
"""

from agentloop.config import configure, get_config, AgentLoopConfig
from agentloop.context import session, span
from agentloop.decorators import task, tool_call, llm_call
from agentloop.client import get_client, reset_client
from agentloop.wrappers import wrap_openai, wrap_anthropic

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
