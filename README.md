# Dottle

> AI Agent Observability Platform — Like Sentry, but for AI agents.

Catch agent drift before your users do. Detect silent regressions across every session, tool call, and LLM interaction.

---

## What It Does

Dottle instruments your AI agents and gives you:

- **Session Timeline** — visualize every LLM call, tool call, and retrieval in a Jaeger-style waterfall
- **Loop Detection** — automatically detect when agents get stuck repeating the same actions
- **Cost & Token Tracking** — per-session USD cost for GPT-4o, Claude, Gemini, and 15+ models
- **Tool Failure Rates** — see which tools are failing and how often
- **Latency Percentiles** — P50/P75/P95/P99 across all your agent runs
- **Alerts** — Slack or email when loops spike, costs exceed threshold, or tools fail too often

---

## Documentation

| Doc | Description |
|---|---|
| [docs/quickstart.md](docs/quickstart.md) | **Start here** — create a project, get your API key, instrument your first agent, smoke test |
| [docs/sdk-javascript.md](docs/sdk-javascript.md) | JavaScript / TypeScript SDK — Node.js, Next.js, Express, React server actions |
| [docs/api-reference.md](docs/api-reference.md) | REST API reference for all endpoints |
| [docs/deployment.md](docs/deployment.md) | Local Docker setup and production VPS deployment |
| [docs/architecture.md](docs/architecture.md) | System design and component overview |

---

## Quick Start (5 minutes)

### 1. Start infrastructure

```bash
cp .env.example .env
docker compose up -d
```

Wait for all services to be healthy:
```bash
docker compose ps
```

### 2. Run database migrations

```bash
cd backend
pip install poetry && poetry install
poetry run alembic upgrade head
```

### 3. Install the SDK

```bash
pip install dottle-sdk
# or from local source:
pip install -e ./sdk
```

### 4. Instrument your agent

```python
import dottle

dottle.configure(
    api_key="dtl_live_...",   # from the Settings page
    api_url="http://localhost:8000/api/v1"
)

with dottle.session("research_agent") as session_id:

    with dottle.span("llm", "plan step") as s:
        response = openai.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": "Plan a research task"}]
        )
        s.record_tokens(
            input=response.usage.prompt_tokens,
            output=response.usage.completion_tokens,
            model="gpt-4o"
        )

    with dottle.span("tool", "search_web") as s:
        results = search_the_web(query)
```

### 5. Open the dashboard

```
http://localhost:3000
```

---

## Architecture

```
┌─────────────────┐    HTTP (batched)    ┌──────────────────┐
│   Your Agent    │ ──────────────────▶  │  FastAPI Backend  │
│  + dottle SDK│                      │   (port 8000)     │
└─────────────────┘                      └────────┬─────────┘
                                                  │
                                         ┌────────▼─────────┐
                                         │  TimescaleDB     │
                                         │  (hypertables)   │
                                         └────────┬─────────┘
                                                  │
                                         ┌────────▼─────────┐
                                         │  Next.js Dashboard│
                                         │   (port 3000)     │
                                         └──────────────────┘
```

**Stack:**
- **Backend**: Python 3.11 + FastAPI + SQLAlchemy (async)
- **Database**: TimescaleDB (PostgreSQL 15 + time-series extension)
- **Cache/State**: Redis 7
- **Frontend**: Next.js 14 + TypeScript + TailwindCSS + Apache ECharts
- **SDK**: Pure Python 3.10+, zero required dependencies beyond httpx

---

## SDK Reference

### `dottle.configure()`
```python
dottle.configure(
    api_key="dtl_live_...",
    api_url="http://localhost:8000/api/v1",
    flush_interval_ms=2000,   # how often spans are flushed (default: 2s)
    disabled=False,           # set True in tests
    debug=False,              # log span events to stdout
)
```

### `dottle.session()` — context manager
```python
with dottle.session(
    agent_name="my_agent",
    external_id="job-123",        # optional: your own ID for correlation
    metadata={"user_id": "u1"},
) as session_id:
    ...
```

### `dottle.span()` — context manager
```python
with dottle.span("llm", "gpt-4o call") as s:
    s.record_tokens(input=512, output=128, model="gpt-4o")
    s.set_attribute("temperature", 0.7)

with dottle.span("tool", "search_web", input_args={"query": q}) as s:
    # input_args are hashed for loop detection
    pass
```

Span types: `llm` | `tool` | `retrieval` | `agent` | `custom`

### `@dottle.task()` — decorator
```python
@dottle.task("research_agent", metadata={"env": "prod"})
def run_agent(query: str) -> str:
    ...
```

### `@dottle.tool_call()` — decorator
```python
@dottle.tool_call("search_web")
def search(query: str) -> list:
    ...   # automatically records span + input hash
```

### `@dottle.llm_call()` — decorator
```python
@dottle.llm_call(model="gpt-4o")
def call_llm(prompt: str) -> dict:
    resp = openai.chat.completions.create(...)
    return {
        "content": resp.choices[0].message.content,
        "input_tokens": resp.usage.prompt_tokens,
        "output_tokens": resp.usage.completion_tokens,
    }
```

---

## Loop Detection

Dottle detects loops automatically — both client-side (in your agent process) and server-side (on ingest). A loop is detected when:

| Signal | Default Threshold |
|--------|-------------------|
| LLM iteration count exceeds | 25 |
| Same tool called N times in a row | 5 |
| Same tool + identical inputs N times | 3 |

When a loop is detected, the session is marked `looping` and the dashboard shows a warning badge.

---

## Alert Rules

Supported metrics:

| Metric | Description |
|--------|-------------|
| `loop_detected` | Count of looping sessions in the window |
| `tool_failure_rate` | % of tool calls that errored |
| `cost_per_session` | Average USD cost per session |
| `session_duration_ms` | P95 session duration |
| `iteration_count` | Max LLM iterations |
| `error_rate` | % of sessions that failed |

Operators: `gt` `gte` `lt` `lte` `eq`

Channels: `slack` (webhook URL) | `email` (SMTP)

Alert cooldown: 30 minutes between re-fires of the same rule.

---

## Development

### Backend

```bash
cd backend
poetry install
cp ../.env.example ../.env
uvicorn app.main:app --reload
# → http://localhost:8000
# → http://localhost:8000/docs  (Swagger UI)
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# → http://localhost:3000
```

### Run migrations

```bash
cd backend
poetry run alembic upgrade head

# Create new migration:
poetry run alembic revision --autogenerate -m "description"
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (asyncpg) |
| `REDIS_URL` | Redis connection string |
| `SECRET_KEY` | 32-char random string for JWT (future use) |
| `CORS_ORIGINS` | Comma-separated allowed origins |
| `SMTP_HOST/PORT/USER/PASSWORD` | Email alert config |
| `SLACK_DEFAULT_WEBHOOK` | Default Slack webhook |
| `AGENTLOOP_API_KEY` | SDK auth key (set in agent's environment) |
| `AGENTLOOP_API_URL` | Backend URL for SDK |
| `NEXT_PUBLIC_DEFAULT_PROJECT_ID` | Default project shown in dashboard |

---

## Roadmap

### Level 1 (current) — Basic Agent Monitor
- [x] SDK with spans, sessions, decorators
- [x] Loop detection
- [x] Tool failure tracking
- [x] Cost & latency per session
- [x] Trace timeline dashboard
- [x] Slack / email alerts

### Level 2 — Production Platform
- [ ] Streaming ingestion (Kafka)
- [ ] Multi-tenant with billing
- [ ] JS/Go SDKs
- [ ] Root cause diagnosis
- [ ] Eval framework (replay, shadow mode)

---

## License

MIT
