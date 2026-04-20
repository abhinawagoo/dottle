# Add Dottle Monitoring to Your AI Agent

This guide is everything an AI coder needs to wire production monitoring into any Python AI agent using [Dottle](https://dottle.dev).

No new framework. No SDK install required. Just a single Python file and a few lines in your agent.

---

## What you need

| Thing | Where to get it |
|---|---|
| Dottle account | [app.dottle.dev](https://app.dottle.dev) |
| API key (`dtl_live_...`) | Dashboard → Settings → your project card |
| Backend URL | `https://dottle-production.up.railway.app` |

---

## Step 1 — Add `dottle.py` to your project

Create this file alongside your agent code. It is self-contained — no pip install needed beyond the standard library.

```python
# dottle.py
"""
Dottle monitoring — fire-and-forget, zero latency impact.
All HTTP calls run in background threads.
If Dottle is unreachable, your agent keeps running normally.
"""
import uuid
import threading
import requests
from datetime import datetime, timezone

DOTTLE_API_URL = "https://dottle-production.up.railway.app/api/v1"
DOTTLE_API_KEY  = "dtl_live_YOUR_KEY_HERE"   # ← paste your key

_HEADERS = {
    "X-API-Key": DOTTLE_API_KEY,
    "Content-Type": "application/json",
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _post(path: str, body: dict) -> None:
    """Non-blocking HTTP post — never raises, never blocks your agent."""
    def _send():
        try:
            requests.post(
                f"{DOTTLE_API_URL}{path}",
                headers=_HEADERS,
                json=body,
                timeout=5,
            )
        except Exception:
            pass  # monitoring must never affect agent execution

    threading.Thread(target=_send, daemon=True).start()


class Session:
    """
    One Session = one agent run (a conversation turn, a task, a pipeline execution).

    Usage:
        session = dottle.Session("my-agent", user_email="user@example.com")
        session.llm(...)
        session.tool(...)
        session.finish()
    """

    def __init__(
        self,
        agent_name: str,
        user_id: str | None = None,
        user_email: str | None = None,
        tags: list[str] | None = None,
        agent_version: str | None = None,
    ):
        self.session_id = str(uuid.uuid4())
        self.agent_name = agent_name
        _post("/ingest/session/start", {
            "session_id":    self.session_id,
            "agent_name":    agent_name,
            "started_at":    _now(),
            "user_id":       user_id,
            "user_email":    user_email,
            "tags":          tags or [],
            "agent_version": agent_version,
        })

    # ── Span helpers ─────────────────────────────────────────────────────────

    def llm(
        self,
        name: str,                          # e.g. "plan_step", "final_response"
        model: str,                         # e.g. "claude-sonnet-4-6", "gpt-4o"
        input_tokens: int,
        output_tokens: int,
        input_text: str | None = None,      # the prompt sent
        output_text: str | None = None,     # the completion received
        duration_ms: int | None = None,
        parent_span_id: str | None = None,
    ) -> str:
        """Record an LLM call. Returns the span_id."""
        span_id = str(uuid.uuid4())
        _post("/ingest/spans", {"session_id": self.session_id, "spans": [{
            "span_id":       span_id,
            "parent_span_id": parent_span_id,
            "span_type":     "llm",
            "name":          name,
            "status":        "ok",
            "started_at":    _now(),
            "model":         model,
            "input_tokens":  input_tokens,
            "output_tokens": output_tokens,
            "input_text":    input_text,
            "output_text":   output_text,
            "duration_ms":   duration_ms,
        }]})
        return span_id

    def tool(
        self,
        name: str,                          # e.g. "search_web", "lookup_crm"
        status: str = "ok",                 # "ok" | "error"
        error_message: str | None = None,
        error_type: str | None = None,
        duration_ms: int | None = None,
        attributes: dict | None = None,
        parent_span_id: str | None = None,
    ) -> str:
        """Record a tool call. Returns the span_id."""
        span_id = str(uuid.uuid4())
        _post("/ingest/spans", {"session_id": self.session_id, "spans": [{
            "span_id":        span_id,
            "parent_span_id": parent_span_id,
            "span_type":      "tool",
            "name":           name,
            "status":         status,
            "started_at":     _now(),
            "error_message":  error_message,
            "error_type":     error_type,
            "duration_ms":    duration_ms,
            "attributes":     attributes or {},
        }]})
        return span_id

    def retrieval(
        self,
        name: str,                          # e.g. "pinecone_query", "rag_fetch"
        status: str = "ok",
        duration_ms: int | None = None,
        attributes: dict | None = None,
    ) -> str:
        """Record a vector DB / retrieval call. Returns the span_id."""
        span_id = str(uuid.uuid4())
        _post("/ingest/spans", {"session_id": self.session_id, "spans": [{
            "span_id":    span_id,
            "span_type":  "retrieval",
            "name":       name,
            "status":     status,
            "started_at": _now(),
            "duration_ms": duration_ms,
            "attributes": attributes or {},
        }]})
        return span_id

    def finish(
        self,
        status: str = "completed",          # "completed" | "failed"
        error_message: str | None = None,
        error_type: str | None = None,
    ) -> None:
        """Call this when the agent run is done (success or failure)."""
        _post("/ingest/session/end", {
            "session_id":    self.session_id,
            "status":        status,
            "ended_at":      _now(),
            "error_message": error_message,
            "error_type":    error_type,
        })
```

---

## Step 2 — Instrument your agent

### Anthropic (Claude)

```python
import time
import anthropic
from dottle import Session

client = anthropic.Anthropic()

def run_agent(user_message: str, user_email: str = None):
    session = Session("salesmemoryagent", user_email=user_email)

    try:
        t0 = time.time()
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            messages=[{"role": "user", "content": user_message}],
        )
        duration_ms = int((time.time() - t0) * 1000)

        session.llm(
            name="main_response",
            model="claude-sonnet-4-6",
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
            input_text=user_message,
            output_text=response.content[0].text,
            duration_ms=duration_ms,
        )

        session.finish("completed")
        return response.content[0].text

    except Exception as e:
        session.finish("failed", error_message=str(e), error_type=type(e).__name__)
        raise
```

### OpenAI (GPT)

```python
import time
import openai
from dottle import Session

client = openai.OpenAI()

def run_agent(user_message: str, user_email: str = None):
    session = Session("my-gpt-agent", user_email=user_email)

    try:
        t0 = time.time()
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": user_message}],
        )
        duration_ms = int((time.time() - t0) * 1000)

        session.llm(
            name="main_response",
            model="gpt-4o",
            input_tokens=response.usage.prompt_tokens,
            output_tokens=response.usage.completion_tokens,
            input_text=user_message,
            output_text=response.choices[0].message.content,
            duration_ms=duration_ms,
        )

        session.finish("completed")
        return response.choices[0].message.content

    except Exception as e:
        session.finish("failed", error_message=str(e), error_type=type(e).__name__)
        raise
```

### Agent with tool calls

```python
import time
from dottle import Session

def run_sales_agent(user_query: str, user_email: str = None):
    session = Session(
        agent_name="salesmemoryagent",
        user_email=user_email,
        tags=["sales", "production"],
    )

    try:
        # Step 1 — retrieve context from CRM
        t0 = time.time()
        crm_data = lookup_crm(user_query)
        session.tool("lookup_crm", status="ok", duration_ms=int((time.time() - t0) * 1000))

        # Step 2 — LLM call with context
        t0 = time.time()
        response = call_llm(user_query, crm_data)
        session.llm(
            name="generate_reply",
            model="claude-sonnet-4-6",
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
            duration_ms=int((time.time() - t0) * 1000),
        )

        # Step 3 — save to memory
        t0 = time.time()
        try:
            save_to_memory(user_query, response.text)
            session.tool("save_memory", status="ok", duration_ms=int((time.time() - t0) * 1000))
        except Exception as e:
            session.tool("save_memory", status="error",
                         error_message=str(e), error_type=type(e).__name__)

        session.finish("completed")
        return response.text

    except Exception as e:
        session.finish("failed", error_message=str(e), error_type=type(e).__name__)
        raise
```

### Async agents

Everything works with `async def` too — the background threads are fully compatible:

```python
import asyncio
import time
from dottle import Session

async def run_async_agent(query: str):
    session = Session("async-agent")

    try:
        t0 = time.time()
        response = await async_llm_call(query)
        session.llm(
            name="async_call",
            model="claude-sonnet-4-6",
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
            duration_ms=int((time.time() - t0) * 1000),
        )
        session.finish("completed")
        return response
    except Exception as e:
        session.finish("failed", error_message=str(e))
        raise
```

---

## Step 3 — Verify it's working

Run your agent once, then open the Dottle dashboard:

| Page | URL | What you should see |
|---|---|---|
| Sessions | [app.dottle.dev/sessions](https://app.dottle.dev/sessions) | Your agent run as a row |
| Session detail | Click the row | Trace timeline with colored span bars |
| Dashboard | [app.dottle.dev](https://app.dottle.dev) | Session count, cost, latency metrics |

Sessions appear within a few seconds of `session.finish()` being called.

---

## API reference

### `Session(agent_name, ...)`

| Param | Type | Description |
|---|---|---|
| `agent_name` | `str` | Name shown in the dashboard (e.g. `"salesmemoryagent"`) |
| `user_id` | `str \| None` | Your internal user ID — for per-user filtering |
| `user_email` | `str \| None` | User's email — shown in session detail |
| `tags` | `list[str] \| None` | Free-form tags (e.g. `["prod", "sales"]`) |
| `agent_version` | `str \| None` | Your agent version string (e.g. `"v1.2.3"`) |

### `session.llm(name, model, input_tokens, output_tokens, ...)`

| Param | Type | Description |
|---|---|---|
| `name` | `str` | Step label shown in trace (e.g. `"plan_step"`) |
| `model` | `str` | Model ID (e.g. `"claude-sonnet-4-6"`, `"gpt-4o"`) |
| `input_tokens` | `int` | Prompt tokens — used for cost calculation |
| `output_tokens` | `int` | Completion tokens — used for cost calculation |
| `input_text` | `str \| None` | The prompt (stored for inspection in UI) |
| `output_text` | `str \| None` | The completion (stored for inspection in UI) |
| `duration_ms` | `int \| None` | Latency in milliseconds |

### `session.tool(name, status, ...)`

| Param | Type | Description |
|---|---|---|
| `name` | `str` | Tool name (e.g. `"search_web"`, `"lookup_crm"`) |
| `status` | `"ok" \| "error"` | Whether the tool succeeded |
| `error_message` | `str \| None` | Exception message if status is `"error"` |
| `error_type` | `str \| None` | Exception class name (e.g. `"TimeoutError"`) |
| `duration_ms` | `int \| None` | Latency in milliseconds |

### `session.finish(status, ...)`

| Param | Type | Description |
|---|---|---|
| `status` | `"completed" \| "failed"` | Final status of the agent run |
| `error_message` | `str \| None` | Top-level error if the whole session failed |
| `error_type` | `str \| None` | Exception class name |

---

## What Dottle detects automatically

Once spans are flowing, Dottle runs these detections on every session:

| Issue | How it's detected |
|---|---|
| **Infinite loops** | Same tool called 3+ times with identical inputs |
| **Task failures** | Session ended with `status="failed"` |
| **High latency** | Session duration exceeds thresholds |
| **Token overuse** | Unusually high token counts per session |
| **Tool errors** | Tool spans with `status="error"` |

Detected issues appear in the **Issues** tab and can trigger alerts.

---

## Troubleshooting

**Sessions not showing up in dashboard**
- Confirm `DOTTLE_API_KEY` in `dottle.py` matches the key in your project settings
- Make sure `session.finish()` is always called — data is flushed on session end
- Check the project selected in the dashboard matches your API key's project

**401 Unauthorized**
- Re-copy the key from Settings — it starts with `dtl_live_`
- Each key is scoped to one project — don't mix keys across projects

**Agent is slower after adding monitoring**
- All HTTP calls in `dottle.py` run in background daemon threads — they should not add latency
- If you see blocking, check that you haven't accidentally replaced `_post()` with a synchronous version

**Want to disable monitoring in tests**
- Set `DOTTLE_API_KEY = ""` or add `if testing: return` at the top of `_post()`
