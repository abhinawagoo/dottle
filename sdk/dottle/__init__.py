"""
Dottle SDK — Instrument your AI agents in 3 lines of code.

Quick start (observability):
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

Prompt management (Braintrust-style):
    import dottle

    dottle.configure(api_key="dtl_live_...", project_id="<uuid>")

    # Always fetches the active version — changes in the dashboard are live instantly
    prompt = dottle.get_prompt("summarize-article")

    # Compile {{variable}} placeholders
    messages = prompt.compile(article=text, language="English")

    # Or call the AI provider directly (routes by model name)
    result = prompt.invoke(article=text, language="English")

    # Pin to a version or label
    prompt = dottle.get_prompt("summarize-article", version=3)
    prompt = dottle.get_prompt("summarize-article", label="production")

Framework integrations:
    from dottle.integrations.langchain import DottleCallbackHandler
    from dottle.integrations.crewai import DottleCrewCallback
    from dottle.integrations.autogen import instrument_agent
    from dottle.integrations.agno import instrument_agno_agent
"""

from dottle.config import configure, get_config, AgentLoopConfig
from dottle.context import session, span, async_session, async_span
from dottle.decorators import task, tool_call, llm_call
from dottle.client import get_client, reset_client
from dottle.wrappers import wrap_openai, wrap_anthropic
from dottle.prompts import get_prompt, PromptHandle

__version__ = "0.1.4"
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
    # Prompt management
    "get_prompt",
    "PromptHandle",
]
