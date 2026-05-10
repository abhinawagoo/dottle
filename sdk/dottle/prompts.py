"""
Prompt management — fetch and use prompts from the Dottle dashboard.

Changes made in the UI take effect immediately in production — no redeploy needed.

Usage:
    import dottle

    dottle.configure(api_key="dtl_live_...", project_id="<your-project-id>")

    # Fetch active version (cached for 60 s by default)
    prompt = dottle.get_prompt("summarizer")

    # Compile variables → ready-to-use messages list
    messages = prompt.compile(article=text, language="English")

    # Pass to any LLM client
    response = openai_client.chat.completions.create(
        model=prompt.model,
        messages=messages,
        **prompt.parameters,
    )

    # Or let Dottle call the model for you (auto-tracked as a span if inside a session)
    result = prompt.invoke(article=text, language="English")

    # Pin to a specific version or label
    prompt = dottle.get_prompt("summarizer", version=3)
    prompt = dottle.get_prompt("summarizer", label="production")

    # Control cache TTL
    prompt = dottle.get_prompt("summarizer", ttl=300)   # 5-minute cache
    prompt = dottle.get_prompt("summarizer", ttl=0)     # bypass cache
"""
from __future__ import annotations

import re
import time
import threading
from typing import Any, Optional, Tuple

import httpx

from dottle.config import get_config, AgentLoopConfig

VARIABLE_RE = re.compile(r"\{\{(\w+)\}\}")

# ── In-process prompt cache ───────────────────────────────────────────────────
# Keyed by (project_id, name) → (fetched_at_unix, PromptHandle)
# Only active-version fetches are cached (pinned version/label fetches are not).

_cache: dict[str, Tuple[float, "PromptHandle"]] = {}
_cache_lock = threading.Lock()


def _cache_get(key: str, ttl: float) -> Optional["PromptHandle"]:
    with _cache_lock:
        entry = _cache.get(key)
    if entry is None:
        return None
    fetched_at, handle = entry
    if time.monotonic() - fetched_at > ttl:
        return None
    return handle


def _cache_set(key: str, handle: "PromptHandle") -> None:
    with _cache_lock:
        _cache[key] = (time.monotonic(), handle)


def clear_prompt_cache() -> None:
    """Remove all cached prompts. Useful in tests."""
    with _cache_lock:
        _cache.clear()


# ── PromptHandle ──────────────────────────────────────────────────────────────

class PromptHandle:
    """
    A fetched prompt with compiled messages and model config.

    Attributes:
        name:        Prompt slug
        version:     Version number
        label:       Optional label (e.g. "production", "staging")
        model:       Model to use (e.g. "gpt-4o", "claude-sonnet-4-6")
        parameters:  LLM parameters dict (temperature, max_tokens, …)
        tools:       OpenAI-format tool definitions list
        variables:   List of {{variable}} names detected in the prompt
        messages:    Uncompiled messages list (system + user) — use .compile() to fill variables
    """

    def __init__(self, data: dict, config: Optional[AgentLoopConfig] = None):
        self._config = config or get_config()
        self.id: str = data["id"]
        self.name: str = data["name"]
        self.version: int = data["version"]
        self.label: Optional[str] = data.get("label")
        self.model: str = data.get("model") or "gpt-4o"
        self.parameters: dict = data.get("parameters") or {}
        self.tools: list[dict] = data.get("tools") or []
        self.variables: list[str] = data.get("variables") or []
        # Raw uncompiled messages (system template + user template)
        self._messages: list[dict] = data.get("messages") or []

    # ── Compile ───────────────────────────────────────────────────────────────

    def compile(self, **variables: Any) -> list[dict]:
        """
        Substitute {{variables}} and return messages ready for any LLM API.

        Example:
            messages = prompt.compile(article=text, language="English")
            # → [{"role": "system", "content": "..."}, {"role": "user", "content": "..."}]

            response = openai_client.chat.completions.create(
                model=prompt.model,
                messages=messages,
                **prompt.parameters,
            )
        """
        def _sub(text: str) -> str:
            return VARIABLE_RE.sub(
                lambda m: str(variables.get(m.group(1), m.group(0))), text
            )

        return [{"role": m["role"], "content": _sub(m["content"])} for m in self._messages]

    # ── Invoke ────────────────────────────────────────────────────────────────

    def invoke(self, **variables: Any) -> str:
        """
        Compile variables and call the configured model. Returns the response text.

        Automatically routes to the right provider based on the model name.
        Requires the provider's Python package to be installed.

        If called inside a dottle.session(), the call is automatically recorded
        as an LLM span with prompt name, version, token counts, and cost.

        Example:
            result = prompt.invoke(article=text, language="English")

        Providers:
            gpt-*/o1/o3/o4 → openai          (pip install openai)
            claude-*        → anthropic        (pip install anthropic)
            gemini-*        → google-generativeai (pip install google-generativeai)
        """
        messages = self.compile(**variables)
        model = self.model
        tools = self.tools or None
        params = dict(self.parameters)  # copy — we may pop from it

        # Determine if we're inside a Dottle session so we can auto-span
        try:
            from dottle.context import _current_session_id
            inside_session = _current_session_id.get() is not None
        except Exception:
            inside_session = False

        if inside_session:
            return self._invoke_with_span(model, messages, tools, params)

        return self._call_provider(model, messages, tools, params)

    def _invoke_with_span(
        self,
        model: str,
        messages: list[dict],
        tools: Optional[list[dict]],
        params: dict,
    ) -> str:
        """Call the provider and record a Dottle LLM span for it."""
        from dottle.context import span as dottle_span

        span_name = f"{self.name} v{self.version}"
        with dottle_span("llm", span_name) as s:
            s.set_attribute("prompt_name", self.name)
            s.set_attribute("prompt_version", self.version)
            if self.label:
                s.set_attribute("prompt_label", self.label)

            # Build a condensed input representation for the span
            user_msg = next((m["content"] for m in messages if m["role"] == "user"), "")
            sys_msg = next((m["content"] for m in messages if m["role"] == "system"), "")

            try:
                text, input_tokens, output_tokens = self._call_provider_with_usage(
                    model, messages, tools, params
                )
            except Exception as exc:
                s.set_error(str(exc), type(exc).__name__)
                raise

            s.record_tokens(input=input_tokens, output=output_tokens, model=model)
            s.record_prompt(
                input_text=sys_msg + "\n" + user_msg if sys_msg else user_msg,
                output_text=text,
            )
            return text

    def _call_provider(
        self,
        model: str,
        messages: list[dict],
        tools: Optional[list[dict]],
        params: dict,
    ) -> str:
        """Call the provider without span instrumentation."""
        text, _, _ = self._call_provider_with_usage(model, messages, tools, params)
        return text

    def _call_provider_with_usage(
        self,
        model: str,
        messages: list[dict],
        tools: Optional[list[dict]],
        params: dict,
    ) -> tuple[str, int, int]:
        """Returns (response_text, input_tokens, output_tokens)."""
        if model.startswith(("gpt-", "o1", "o3", "o4")):
            return self._invoke_openai(model, messages, tools, params)
        elif model.startswith("claude-"):
            return self._invoke_anthropic(model, messages, tools, params)
        elif model.startswith("gemini-"):
            return self._invoke_gemini(model, messages, tools, params)
        else:
            raise ValueError(
                f"Cannot auto-detect provider for model '{model}'. "
                "Use .compile() and call your LLM client directly."
            )

    def _invoke_openai(
        self,
        model: str,
        messages: list[dict],
        tools: Optional[list[dict]],
        params: dict,
    ) -> tuple[str, int, int]:
        try:
            from openai import OpenAI
        except ImportError:
            raise ImportError("pip install openai")

        client = OpenAI()
        kwargs: dict[str, Any] = {"model": model, "messages": messages, **params}
        if tools:
            kwargs["tools"] = tools
        resp = client.chat.completions.create(**kwargs)
        msg = resp.choices[0].message
        input_tokens = resp.usage.prompt_tokens if resp.usage else 0
        output_tokens = resp.usage.completion_tokens if resp.usage else 0
        if msg.content:
            return msg.content, input_tokens, output_tokens
        if msg.tool_calls:
            raise ValueError(
                "The model responded with a tool call instead of text. "
                "Use .compile() and call the LLM directly to handle tool call loops."
            )
        return "", input_tokens, output_tokens

    def _invoke_anthropic(
        self,
        model: str,
        messages: list[dict],
        tools: Optional[list[dict]],
        params: dict,
    ) -> tuple[str, int, int]:
        try:
            import anthropic
        except ImportError:
            raise ImportError("pip install anthropic")

        client = anthropic.Anthropic()
        system = next((m["content"] for m in messages if m["role"] == "system"), None)
        user_msgs = [m for m in messages if m["role"] != "system"]
        max_tokens = params.pop("max_tokens", 1024)

        kwargs: dict[str, Any] = {
            "model": model,
            "messages": user_msgs,
            "max_tokens": max_tokens,
            **params,
        }
        if system:
            kwargs["system"] = system
        if tools:
            # Convert OpenAI tool format → Anthropic format
            kwargs["tools"] = [
                {
                    "name": t["function"]["name"],
                    "description": t["function"].get("description", ""),
                    "input_schema": t["function"].get("parameters", {}),
                }
                for t in tools
            ]
        resp = client.messages.create(**kwargs)
        input_tokens = resp.usage.input_tokens if resp.usage else 0
        output_tokens = resp.usage.output_tokens if resp.usage else 0
        block = resp.content[0]
        if block.type == "text":
            return block.text, input_tokens, output_tokens
        raise ValueError(
            f"The model responded with a '{block.type}' block instead of text. "
            "Use .compile() and call the LLM directly to handle tool call loops."
        )

    def _invoke_gemini(
        self,
        model: str,
        messages: list[dict],
        tools: Optional[list[dict]],
        params: dict,
    ) -> tuple[str, int, int]:
        try:
            import google.generativeai as genai
        except ImportError:
            raise ImportError("pip install google-generativeai")

        system = next((m["content"] for m in messages if m["role"] == "system"), None)
        user_msgs = [m for m in messages if m["role"] != "system"]

        g_model = genai.GenerativeModel(model, system_instruction=system)
        history = [
            {"role": "user" if m["role"] == "user" else "model", "parts": [m["content"]]}
            for m in user_msgs[:-1]
        ]
        chat = g_model.start_chat(history=history)
        resp = chat.send_message(user_msgs[-1]["content"] if user_msgs else "")
        # Gemini usage metadata
        input_tokens = getattr(getattr(resp, "usage_metadata", None), "prompt_token_count", 0) or 0
        output_tokens = getattr(getattr(resp, "usage_metadata", None), "candidates_token_count", 0) or 0
        return resp.text, input_tokens, output_tokens

    def __repr__(self) -> str:
        return f"<PromptHandle name={self.name!r} v{self.version} model={self.model!r}>"


# ── Public API ────────────────────────────────────────────────────────────────

def get_prompt(
    name: str,
    project_id: Optional[str] = None,
    version: Optional[int] = None,
    label: Optional[str] = None,
    ttl: float = 60.0,
) -> PromptHandle:
    """
    Fetch a prompt from Dottle by name.

    Returns the active version by default.  Changes made in the UI are
    reflected after the cache TTL (default 60 s).

    Args:
        name:       Prompt slug as shown in the Dottle dashboard
        project_id: Project ID. Defaults to DOTTLE_PROJECT_ID env var or
                    the value passed to dottle.configure(project_id=...).
        version:    Pin to a specific version number (e.g. version=3).
                    Pinned fetches are never cached.
        label:      Pin to a labeled version (e.g. label="production").
                    Pinned fetches are never cached.
        ttl:        Cache TTL in seconds (default 60). Pass 0 to bypass cache.

    Returns:
        PromptHandle with .compile(), .invoke(), .model, .parameters, .tools

    Example:
        import dottle

        dottle.configure(api_key="dtl_live_...", project_id="<uuid>")

        prompt = dottle.get_prompt("summarizer")
        messages = prompt.compile(article=article_text, language="English")

        # Use with OpenAI
        import openai
        client = openai.OpenAI()
        response = client.chat.completions.create(
            model=prompt.model,
            messages=messages,
            **prompt.parameters,
        )

        # Or with tools
        if prompt.tools:
            response = client.chat.completions.create(
                model=prompt.model,
                messages=messages,
                tools=prompt.tools,
            )
    """
    config = get_config()
    pid = project_id or getattr(config, "project_id", None)
    if not pid:
        raise ValueError(
            "project_id is required. Pass it to get_prompt() or set DOTTLE_PROJECT_ID env var "
            "or call dottle.configure(project_id='...')"
        )

    # Cache only active-version fetches (unpinned)
    use_cache = ttl > 0 and version is None and label is None
    cache_key = f"{pid}:{name}"

    if use_cache:
        cached = _cache_get(cache_key, ttl)
        if cached is not None:
            return cached

    params: dict[str, Any] = {"project_id": pid}
    if version is not None:
        params["version"] = version
    if label is not None:
        params["label"] = label

    url = config.api_url.rstrip("/") + f"/prompts/{name}"
    headers = {"X-API-Key": config.api_key}

    try:
        with httpx.Client(timeout=10) as client:
            resp = client.get(url, params=params, headers=headers)
            resp.raise_for_status()
    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code
        if status == 404:
            raise ValueError(f"Prompt '{name}' not found in project {pid}") from exc
        if status == 401:
            raise ValueError("Invalid API key — check DOTTLE_API_KEY") from exc
        raise RuntimeError(f"Dottle API error {status}: {exc.response.text}") from exc
    except httpx.ConnectError as exc:
        raise RuntimeError(f"Could not connect to Dottle API at {url}") from exc

    handle = PromptHandle(resp.json(), config)

    if use_cache:
        _cache_set(cache_key, handle)

    return handle
