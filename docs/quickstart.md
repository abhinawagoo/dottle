# Quickstart Guide

Get from zero to a live agent trace in under 5 minutes.

---

## Step 1 — Start the stack

Everything runs in Docker. From the project root:

```bash
docker compose up -d
```

Verify all 4 containers are running:

```bash
docker ps
# agentloop_frontend   → http://localhost:3000
# agentloop_backend    → http://localhost:8000
# agentloop_db         → TimescaleDB on :5432
# agentloop_redis      → Redis on :6379
```

---

## Step 2 — Create a project & get your API key

1. Open **http://localhost:3000/settings**
2. Enter a project name (e.g. `my-research-agent`) → click **Create Project**
3. Your project card appears with two values you need:

| Value | Where to use |
|---|---|
| `alp_live_xxxxxxxx` (API key) | `agentloop.configure(api_key=...)` in your agent code |
| `NEXT_PUBLIC_DEFAULT_PROJECT_ID=<uuid>` | Frontend env var so the dashboard shows your project's data |

**Connect the dashboard to your project:**

Open `docker-compose.yml`, find the `frontend` service, and add the env var:

```yaml
frontend:
  environment:
    NEXT_PUBLIC_API_URL: http://localhost:8000/api/v1
    NEXT_PUBLIC_DEFAULT_PROJECT_ID: <paste-your-project-uuid-here>   # ← add this
```

Then restart the frontend:

```bash
docker restart agentloop_frontend
```

---

## Step 3 — Install the SDK

```bash
# From the agentloop repo root
pip install -e ./sdk

# Required dependencies
pip install httpx pydantic
```

---

## Step 4 — Instrument your agent

Choose the style that fits your codebase.

### Option A — Decorators (recommended, least code)

```python
import agentloop

agentloop.configure(
    api_key="alp_live_xxxxxxxx",            # from Settings page
    api_url="http://localhost:8000/api/v1"  # your backend URL
)


@agentloop.task("research-agent")           # entire function becomes one session
def run_agent(query: str) -> str:
    result = call_llm(query)
    docs   = search_web(query=query)
    return result["content"]


@agentloop.llm_call(model="gpt-4o")        # records tokens automatically
def call_llm(prompt: str) -> dict:
    r = openai_client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}]
    )
    return {
        "content":       r.choices[0].message.content,
        "input_tokens":  r.usage.prompt_tokens,
        "output_tokens": r.usage.completion_tokens,
    }


@agentloop.tool_call("search_web")         # auto-hashes args for loop detection
def search_web(query: str) -> list:
    return requests.get(f"https://api.search.com?q={query}").json()


# Run your agent — data flows to Agentloop automatically
run_agent("What is the capital of France?")
```

### Option B — Context managers (explicit control)

```python
import agentloop

agentloop.configure(
    api_key="alp_live_xxxxxxxx",
    api_url="http://localhost:8000/api/v1"
)

with agentloop.session("research-agent") as session_id:

    # Track an LLM call
    with agentloop.span("llm", "gpt-4o plan step") as s:
        response = openai_client.chat.completions.create(...)
        s.record_tokens(
            input=response.usage.prompt_tokens,
            output=response.usage.completion_tokens,
            model="gpt-4o"
        )

    # Track a tool call
    with agentloop.span("tool", "search_web") as s:
        results = search(query)

    # Track a retrieval (RAG, vector DB, etc.)
    with agentloop.span("retrieval", "pinecone_query") as s:
        docs = vectordb.query(embedding)

    # Mark something as failed
    with agentloop.span("tool", "send_email") as s:
        try:
            send_email(to, body)
        except Exception as e:
            s.set_error(str(e), type(e).__name__)
            raise
```

### Option C — Async agents

Both APIs work unchanged with `async def`:

```python
@agentloop.task("async-agent")
async def run_async(query: str):
    with agentloop.span("llm", "claude-3 call") as s:
        response = await async_openai.chat.completions.create(...)
        s.record_tokens(
            input=response.usage.prompt_tokens,
            output=response.usage.completion_tokens,
            model="claude-3-5-sonnet"
        )
```

---

## Step 5 — Smoke test (no real LLM needed)

Run this to confirm the pipeline works before integrating your agent:

```python
import agentloop, time

agentloop.configure(
    api_key="alp_live_xxxxxxxx",
    api_url="http://localhost:8000/api/v1",
    debug=True   # prints flush confirmations to stdout
)

with agentloop.session("smoke-test") as sid:
    print(f"Session ID: {sid}")

    with agentloop.span("llm", "fake-gpt-call") as s:
        time.sleep(0.1)
        s.record_tokens(input=200, output=80, model="gpt-4o")

    with agentloop.span("tool", "fake-search") as s:
        time.sleep(0.05)

    with agentloop.span("retrieval", "fake-vector-db") as s:
        time.sleep(0.03)

print("Done — check http://localhost:3000/sessions")
```

---

## Step 6 — Verify in the dashboard

| Page | URL | What you should see |
|---|---|---|
| Dashboard | http://localhost:3000 | Session count, cost, latency stats |
| Sessions | http://localhost:3000/sessions | Your agent run as a row with status `completed` |
| Session detail | Click any row | Trace timeline with colored span bars |
| Metrics | http://localhost:3000/metrics | Cost-over-time chart, tool failure rates |

---

## Local vs. Live — which do you need?

### Works right now (local only)

The stack runs entirely on your machine. Your agent code also runs on the same machine — so `http://localhost:8000` is reachable.

```
Your machine
├── Agentloop stack  (Docker, localhost:8000, localhost:3000)
└── Your agent code  (Python script, Jupyter notebook, etc.)
        ↓ HTTP to localhost:8000 ✓
```

**This is the right setup for:** development, testing, personal use.

---

### You need a live deployment when...

| Situation | Why localhost won't work |
|---|---|
| Agent runs in the cloud (AWS Lambda, GCP Cloud Run, etc.) | Cloud functions can't reach your laptop's localhost |
| Agent runs in CI/CD (GitHub Actions, etc.) | CI runners are isolated machines |
| Multiple team members need access to the dashboard | Teammates can't open your localhost:3000 |
| Agent runs on a user's device | Their device has no route to your localhost |

**For a live deployment**, follow [deployment.md](deployment.md):

```
VPS / Cloud server (e.g. api.yourcompany.com)
├── Agentloop stack  (Docker)
└── Accessible via public IP/domain

Your agent code (anywhere)
        ↓ HTTP to https://api.yourcompany.com/api/v1 ✓
```

Just change `api_url` in your `configure()` call:

```python
agentloop.configure(
    api_key="alp_live_xxxxxxxx",
    api_url="https://api.yourcompany.com/api/v1"  # your live backend
)
```

---

## SDK reference

```python
# Configure once at startup — call before any session/span
agentloop.configure(
    api_key="alp_live_...",         # required
    api_url="http://...",           # required
    debug=False,                    # True → logs every flush to stdout
    disabled=False,                 # True → SDK is a no-op (useful in tests)
    flush_interval_ms=2000,         # how often buffered spans are sent
    max_batch_size=100,             # max spans per HTTP request
    timeout_s=5.0,                  # HTTP request timeout
)

# Span types
agentloop.span("llm", name)         # LLM call — blue in trace
agentloop.span("tool", name)        # Tool call — amber in trace
agentloop.span("retrieval", name)   # Vector DB / search — green in trace
agentloop.span("agent", name)       # Sub-agent call — indigo in trace
agentloop.span("custom", name)      # Anything else — purple in trace

# SpanContext methods (inside a `with span(...) as s:` block)
s.record_tokens(input=100, output=50, model="gpt-4o")
s.set_error("message", "ErrorType")
s.set_attribute("key", value)

# Decorators
@agentloop.task("agent-name")       # wraps function as a full session
@agentloop.llm_call(model="...")    # function must return {content, input_tokens, output_tokens}
@agentloop.tool_call("tool-name")   # auto-tracks errors and hashes args
```

---

## Troubleshooting

**Dashboard shows no data after running the agent**
- Check `NEXT_PUBLIC_DEFAULT_PROJECT_ID` is set and the frontend was restarted
- Confirm the API key in your agent matches the one in Settings
- Run with `debug=True` — you should see `Flushed N spans` in your terminal

**`Connection refused` when running the agent**
- Confirm the backend is running: `curl http://localhost:8000/api/v1/projects`
- If your agent runs outside Docker, use `localhost`. If it runs inside Docker, use the service name `backend` instead of `localhost`

**Sessions show status `failed`**
- Click the session row — the trace timeline will show which span errored
- The error message and type are recorded and shown in the detail view

**`alp_live_...` key rejected (401)**
- Re-copy the key from Settings — keys are per-project
- The key is sent as `X-API-Key` header — check no extra whitespace was copied
