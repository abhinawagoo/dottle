"""
Decorator API for agentloop.
Wraps functions/methods without requiring context managers.

Usage:
    @agentloop.task("research_agent")
    def run_agent(query: str) -> str:
        ...

    @agentloop.tool_call("search_web")
    def search(query: str) -> list:
        ...

    @agentloop.llm_call(model="gpt-4o")
    def call_llm(prompt: str) -> dict:
        # Must return dict with keys: content, input_tokens, output_tokens
        ...
"""
from __future__ import annotations
import functools
import inspect
from typing import Any, Callable, TypeVar

from agentloop.context import session, span

F = TypeVar("F", bound=Callable[..., Any])


def task(agent_name: str, metadata: dict | None = None):
    """
    Decorator that wraps the entire function in an agentloop session.
    """
    def decorator(func: F) -> F:
        if inspect.iscoroutinefunction(func):
            @functools.wraps(func)
            async def async_wrapper(*args, **kwargs):
                with session(agent_name, metadata=metadata):
                    return await func(*args, **kwargs)
            return async_wrapper  # type: ignore
        else:
            @functools.wraps(func)
            def sync_wrapper(*args, **kwargs):
                with session(agent_name, metadata=metadata):
                    return func(*args, **kwargs)
            return sync_wrapper  # type: ignore
    return decorator


def tool_call(tool_name: str):
    """
    Decorator that wraps a function as a tool span.
    Automatically hashes kwargs as input_hash for loop detection.
    """
    def decorator(func: F) -> F:
        if inspect.iscoroutinefunction(func):
            @functools.wraps(func)
            async def async_wrapper(*args, **kwargs):
                with span("tool", tool_name, input_args=kwargs) as s:
                    try:
                        result = await func(*args, **kwargs)
                        return result
                    except Exception as exc:
                        s.set_error(str(exc), type(exc).__name__)
                        raise
            return async_wrapper  # type: ignore
        else:
            @functools.wraps(func)
            def sync_wrapper(*args, **kwargs):
                with span("tool", tool_name, input_args=kwargs) as s:
                    try:
                        result = func(*args, **kwargs)
                        return result
                    except Exception as exc:
                        s.set_error(str(exc), type(exc).__name__)
                        raise
            return sync_wrapper  # type: ignore
    return decorator


def llm_call(model: str):
    """
    Decorator for LLM call functions.
    The wrapped function must return a dict with:
      - content: str
      - input_tokens: int
      - output_tokens: int
    """
    def decorator(func: F) -> F:
        if inspect.iscoroutinefunction(func):
            @functools.wraps(func)
            async def async_wrapper(*args, **kwargs):
                with span("llm", f"{model} call") as s:
                    try:
                        result = await func(*args, **kwargs)
                        if isinstance(result, dict):
                            s.record_tokens(
                                input=result.get("input_tokens", 0),
                                output=result.get("output_tokens", 0),
                                model=model,
                            )
                        return result
                    except Exception as exc:
                        s.set_error(str(exc), type(exc).__name__)
                        raise
            return async_wrapper  # type: ignore
        else:
            @functools.wraps(func)
            def sync_wrapper(*args, **kwargs):
                with span("llm", f"{model} call") as s:
                    try:
                        result = func(*args, **kwargs)
                        if isinstance(result, dict):
                            s.record_tokens(
                                input=result.get("input_tokens", 0),
                                output=result.get("output_tokens", 0),
                                model=model,
                            )
                        return result
                    except Exception as exc:
                        s.set_error(str(exc), type(exc).__name__)
                        raise
            return sync_wrapper  # type: ignore
    return decorator
