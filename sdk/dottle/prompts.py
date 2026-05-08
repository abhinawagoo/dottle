"""
Prompt management — fetch and use prompts from the Dottle dashboard.

Changes made in the UI take effect immediately in production — no redeploy needed.

Usage:
    import dottle

    dottle.configure(api_key="dtl_live_...", project_id="<your-project-id>")

    # Fetch active version
    prompt = dottle.get_prompt("summarizer")

    # Compile variables → ready-to-use messages list
    messages = prompt.compile(article=text, language="English")

    # Pass to any LLM client
    response = openai_client.chat.completions.create(
        model=prompt.model,
        messages=messages,
        **prompt.parameters,
    )

    # Or let Dottle call the model for you
    result = prompt.invoke(article=text, language="English")

    # Pin to a specific version or label
    prompt = dottle.get_prompt("summarizer", version=3)
    prompt = dottle.get_prompt("summarizer", label="production")
"""
from __future__ import annotations

import re
from typing import Any, Optional

import httpx

from dottle.config import get_config, AgentLoopConfig

VARIABLE_RE = re.compile(r"\{\{(\w+)\}\}")


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

        Example:
            result = prompt.invoke(article=text, language="English")

        Providers:
            gpt-*/o1/o3   → openai   (pip install openai)
            claude-*      → anthropic (pip install anthropic)
            gemini-*      → google-generativeai (pip install google-generativeai)
        """
        messages = self.compile(**variables)
        model = self.model
        tools = self.tools or None
        params = dict(self.parameters)  # copy — we may pop from it

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
    ) -> str:
        try:
            from openai import OpenAI
        except ImportError:
            raise ImportError("pip install openai")

        client = OpenAI()
        kwargs: dict[str, Any] = {"model": model, "messages": messages, **params}
        if tools:
            kwargs["tools"] = tools
        resp = client.chat.completions.create(**kwargs)
        return resp.choices[0].message.content or ""

    def _invoke_anthropic(
        self,
        model: str,
        messages: list[dict],
        tools: Optional[list[dict]],
        params: dict,
    ) -> str:
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
        return resp.content[0].text

    def _invoke_gemini(
        self,
        model: str,
        messages: list[dict],
        tools: Optional[list[dict]],
        params: dict,
    ) -> str:
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
        return resp.text

    def __repr__(self) -> str:
        return f"<PromptHandle name={self.name!r} v{self.version} model={self.model!r}>"


# ── Public API ────────────────────────────────────────────────────────────────

def get_prompt(
    name: str,
    project_id: Optional[str] = None,
    version: Optional[int] = None,
    label: Optional[str] = None,
) -> PromptHandle:
    """
    Fetch a prompt from Dottle by name.

    Returns the active version by default.  Changes made in the UI are
    immediately reflected — no redeploy needed.

    Args:
        name:       Prompt slug as shown in the Dottle dashboard
        project_id: Project ID. Defaults to DOTTLE_PROJECT_ID env var or
                    the value passed to dottle.configure(project_id=...).
        version:    Pin to a specific version number (e.g. version=3).
        label:      Pin to a labeled version (e.g. label="production").

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

    return PromptHandle(resp.json(), config)
