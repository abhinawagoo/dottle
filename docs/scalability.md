# Scalability Guide

This document describes the current scalability posture of the Dottle backend, known bottlenecks with exact code pointers, and a prioritized roadmap for each optimization. Each item is named and numbered so it can be referenced in issues, PRs, and commits.

---

## Current Capacity Estimates

| Daily load | Status | Notes |
|---|---|---|
| < 1 K sessions/day | ✅ Comfortable | Any single Railway instance |
| 1 K – 10 K sessions/day | ✅ Fine | DB auth queries appear in slow-query log |
| 10 K – 50 K sessions/day | ⚠️ Watch | Single process CPU-bound; scheduler conflicts if you scale horizontally |
| 50 K – 500 K sessions/day | 🔴 Needs work | Spans table needs partitioning; Redis queue for ingest; separate worker process |
| 500 K+ sessions/day | 🔴 Major changes | Read replicas, queue-based ingest, multi-region |

---

## What Is Already Solid

- **Async I/O end-to-end** — FastAPI + asyncpg + SQLAlchemy async. I/O never blocks a thread.
- **Pagination on all list endpoints** — `LIMIT/OFFSET` with configurable `page_size` (default 50).
- **Basic indexes** — `project_id`, `started_at`, `status`, `agent_name` indexed on `agent_sessions` and `spans`.
- **TimescaleDB in the stack** — Docker image is `timescale/timescaledb:latest-pg15`. Time-series partitioning is one migration away (see SCALE-04).
- **Connection pool** — `pool_size=10, max_overflow=20` = 30 max Postgres connections. Correct for single-instance.

---

## Known Bottlenecks — Prioritized

### SCALE-01 · API Key Cache Miss on Every Ingest Request

**Priority:** High  
**Effort:** Small (1–2 hours)  
**Breaks at:** ~1 K ingest requests/minute

**Where:**
```
backend/app/routers/ingest.py
function: get_project_from_api_key (line ~25)
```

**Problem:**  
Every SDK call to `/ingest/spans` or `/ingest/session/start` runs a full Postgres SELECT to validate the API key:
```python
result = await db.execute(select(Project).where(Project.api_key == x_api_key))
```
At 100 agents sending spans every second = 100 uncached Postgres queries/sec just for authentication. Redis is already in the stack and configured — it just isn't used.

**Fix — SCALE-01-FIX:**
```python
# backend/app/routers/ingest.py
import json
from app.redis_client import get_redis   # see SCALE-05

async def get_project_from_api_key(x_api_key: str = Header(...), db: AsyncSession = Depends(get_db)):
    redis = await get_redis()
    cache_key = f"apikey:{x_api_key}"

    cached = await redis.get(cache_key)
    if cached:
        return Project(**json.loads(cached))

    result = await db.execute(select(Project).where(Project.api_key == x_api_key))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=401, detail="Invalid API key")

    await redis.setex(cache_key, 300, json.dumps({"id": str(project.id), "name": project.name, ...}))
    return project
```
TTL of 300 seconds means key rotation takes effect within 5 minutes without a deploy.

---

### SCALE-02 · Scheduler Runs Inside the Web Process

**Priority:** High  
**Effort:** Medium (half day)  
**Breaks at:** First attempt to run more than 1 web replica

**Where:**
```
backend/app/workers/alert_worker.py
backend/app/workers/stale_session_reaper.py
backend/app/main.py — lifespan()
```

**Problem:**  
`APScheduler` is started inside FastAPI's `lifespan()`. If you run 2 web replicas (e.g. Railway horizontal scaling), you get 2 alert workers and 2 reapers both firing every 60 seconds. This causes:
- Duplicate Slack/email alerts
- Race conditions on stale session reaping (two workers update the same rows simultaneously)
- Double charges for LLM-as-judge evals

**Fix — SCALE-02-FIX:**

Step 1 — Remove scheduler from web process:
```python
# backend/app/main.py
@asynccontextmanager
async def lifespan(app: FastAPI):
    # DO NOT start alert worker here
    yield

# Add env var guard so scheduler only starts in worker process:
# DOTTLE_ROLE=worker → start scheduler
# DOTTLE_ROLE=web (default) → skip
```

Step 2 — Add a dedicated worker entry point:
```python
# backend/app/workers/runner.py  (new file)
import asyncio
from app.workers.alert_worker import start_alert_worker, stop_alert_worker

if __name__ == "__main__":
    start_alert_worker()
    try:
        asyncio.get_event_loop().run_forever()
    except KeyboardInterrupt:
        stop_alert_worker()
```

Step 3 — Update Procfile:
```
web:    uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 4
worker: python -m app.workers.runner
```

Now web can scale to N replicas; only one `worker` dyno runs. On Railway, deploy as two separate services from the same repo.

---

### SCALE-03 · Issue Detection Runs Synchronously in the Request Path

**Priority:** Medium  
**Effort:** Medium (half day)  
**Breaks at:** When AI-powered issue detection or cross-session analysis is added

**Where:**
```
backend/app/routers/ingest.py
function: end_session (~line 90)
```

**Problem:**  
`detect_all(snapshot)` runs inline before the HTTP response is returned. Currently it's fast (pure Python pattern matching). But as issue detection becomes smarter — LLM calls, cross-session lookups — this will add 1–5 seconds of latency to every `session.end()` SDK call.

**Fix — SCALE-03-FIX:**

Move issue detection to a background task (short term) or queue (long term):

```python
# Short term — FastAPI BackgroundTasks (already used for evals)
@router.post("/session/end")
async def end_session(body, background_tasks: BackgroundTasks, ...):
    # Save session state
    await db.commit()
    # Return immediately, detect issues async
    background_tasks.add_task(_detect_issues_bg, str(session.id), str(project.id))
    return {"ok": True}

async def _detect_issues_bg(session_id: str, project_id: str):
    async with AsyncSessionLocal() as db:
        # ... load session + spans, run detect_all, save issues
```

Long term (see SCALE-06): push `session_id` to a Redis queue, worker pops and processes. This survives process restarts.

---

### SCALE-04 · TimescaleDB Hypertables Not Enabled

**Priority:** Medium  
**Effort:** Small (one migration, 30 min)  
**Breaks at:** ~10 M rows in `spans` or `agent_sessions`

**Where:**
```
backend/alembic/versions/001_initial_schema.py (comment: "Hypertables can be added in migration 002")
```

**Problem:**  
The architecture says TimescaleDB is used for time-series partitioning, but hypertables were never actually created. Plain PostgreSQL indexes are in use. Range queries like `WHERE started_at >= now() - interval '7 days'` will eventually do full-index scans instead of partition-pruned chunk scans.

**Fix — SCALE-04-FIX:**

Create migration `016_timescaledb_hypertables.py`:
```python
def upgrade():
    # Requires TimescaleDB extension (already on the Docker image)
    op.execute("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE")

    # Convert to hypertables — partitioned by time, 1-week chunks
    op.execute("""
        SELECT create_hypertable(
            'agent_sessions', 'started_at',
            migrate_data => TRUE,
            chunk_time_interval => INTERVAL '7 days'
        )
    """)
    op.execute("""
        SELECT create_hypertable(
            'spans', 'started_at',
            migrate_data => TRUE,
            chunk_time_interval => INTERVAL '1 day'
        )
    """)
    op.execute("""
        SELECT create_hypertable(
            'tool_calls', 'called_at',
            migrate_data => TRUE,
            chunk_time_interval => INTERVAL '1 day'
        )
    """)

    # Enable compression on chunks older than 30 days
    op.execute("SELECT add_compression_policy('spans', INTERVAL '30 days')")
    op.execute("SELECT add_compression_policy('tool_calls', INTERVAL '30 days')")

    # Automatic data retention — drop chunks older than 1 year
    # op.execute("SELECT add_retention_policy('spans', INTERVAL '1 year')")
```

> ⚠️ **Important:** This migration requires `migrate_data => TRUE` on an existing table. Run it during a maintenance window on production. Test on a staging DB with production row counts first. The `agent_sessions` table primary key must include `started_at` for TimescaleDB — check if the PK needs updating.

---

### SCALE-05 · Redis Client Not Wired Up

**Priority:** Medium  
**Effort:** Small (1 hour)  
**Blocks:** SCALE-01, SCALE-06

**Where:**
```
backend/app/config.py — redis_url setting exists but nothing imports it
docker-compose.yml — Redis service defined and healthy-checked
```

**Problem:**  
`redis_url` is in `Settings` and Redis runs in docker-compose and on production, but no code actually connects to it. It's wired but unplugged.

**Fix — SCALE-05-FIX:**

Create `backend/app/redis_client.py`:
```python
from redis.asyncio import Redis, from_url
from app.config import get_settings
from functools import lru_cache

_redis: Redis | None = None

async def get_redis() -> Redis:
    global _redis
    if _redis is None:
        _redis = from_url(get_settings().redis_url, decode_responses=True)
    return _redis

async def close_redis():
    global _redis
    if _redis:
        await _redis.aclose()
        _redis = None
```

Wire into lifespan:
```python
# backend/app/main.py
from app.redis_client import close_redis

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await close_redis()
```

Add `redis[asyncio]` to `pyproject.toml` dependencies.

---

### SCALE-06 · Background Jobs Lost on Process Restart

**Priority:** Medium  
**Effort:** Large (1–2 days)  
**Breaks at:** Any time the process restarts mid-eval (deploys, crashes)

**Where:**
```
backend/app/routers/evals.py — _run_eval_for_session() via BackgroundTasks
backend/app/routers/datasets.py — _execute_dataset_run() via BackgroundTasks
```

**Problem:**  
LLM evals and dataset runs use FastAPI's `BackgroundTasks`. These run in-process after the HTTP response is sent. If the process restarts (deploy, crash, OOM) while a run is in progress, it vanishes — the `eval_results` or `dataset_runs` row stays in `pending` forever with no retry.

**Fix — SCALE-06-FIX:**

Replace `BackgroundTasks` with a Redis-backed job queue using `arq` (async Redis Queue):

```python
# backend/app/workers/queues.py
from arq import create_pool
from arq.connections import RedisSettings
from app.config import get_settings

async def get_arq_pool():
    return await create_pool(RedisSettings.from_dsn(get_settings().redis_url))

# Job functions (same logic as current background tasks, just different entrypoint)
async def run_eval_job(ctx, config_id: str, session_id: str):
    from app.routers.evals import _run_eval_for_session
    await _run_eval_for_session(config_id, session_id)

async def run_dataset_job(ctx, run_id: str, eval_criteria: str | None):
    from app.routers.datasets import _execute_dataset_run
    await _execute_dataset_run(run_id, eval_criteria)

class WorkerSettings:
    functions = [run_eval_job, run_dataset_job]
    redis_settings = RedisSettings.from_dsn(get_settings().redis_url)
    max_jobs = 10
    job_timeout = 300
```

Enqueue instead of BackgroundTasks:
```python
pool = await get_arq_pool()
await pool.enqueue_job("run_eval_job", config_id, session_id)
```

Add to Procfile:
```
worker: python -m arq app.workers.queues.WorkerSettings
```

---

### SCALE-07 · Single Postgres Connection Pool Across All Requests

**Priority:** Low  
**Effort:** Small (config change)  
**Breaks at:** >30 concurrent slow queries

**Where:**
```
backend/app/database.py
engine = create_async_engine(..., pool_size=10, max_overflow=20)
```

**Problem:**  
30 total Postgres connections is shared across all routes — ingest, analytics, dashboard reads, background tasks. A slow metrics query (aggregating 30 days of spans) can consume 5–10 connections and starve the ingest path.

**Fix — SCALE-07-FIX:**

Use separate connection pools for the ingest (write) path and the read (analytics) path:

```python
# backend/app/database.py
ingest_engine = create_async_engine(
    settings.database_url, pool_size=15, max_overflow=10
)
read_engine = create_async_engine(
    settings.database_url_readonly or settings.database_url,  # point to read replica when available
    pool_size=10, max_overflow=20
)
```

Long term: provision a Postgres read replica (Railway supports this) and point `database_url_readonly` at it. All `SELECT`-only routes (sessions list, metrics, issues) use the read replica, freeing the primary for writes.

---

### SCALE-08 · Missing Composite Indexes for Common Filter Patterns

**Priority:** Low  
**Effort:** Small (one migration)  
**Breaks at:** ~1 M rows in `agent_sessions`

**Where:**
```
backend/alembic/versions/001_initial_schema.py
backend/app/routers/sessions.py — list_sessions filter patterns
```

**Problem:**  
The sessions list accepts many filter combinations. The most common production query is:
```sql
WHERE project_id = ? AND status = ? AND started_at > ?
```
This currently uses three separate single-column indexes. Postgres picks one and filters the rest in memory.

**Fix — SCALE-08-FIX:**

Migration `017_composite_indexes.py`:
```python
def upgrade():
    # Most common dashboard query pattern
    op.create_index(
        "idx_sessions_project_status_time",
        "agent_sessions",
        ["project_id", "status", "started_at"]
    )
    # Agent name filter (used in per-agent analytics)
    op.create_index(
        "idx_sessions_project_agent_time",
        "agent_sessions",
        ["project_id", "agent_name", "started_at"]
    )
    # Span lookup for session detail
    op.create_index(
        "idx_spans_session_type",
        "spans",
        ["session_id", "span_type"]
    )
    # Scores lookup
    op.create_index(
        "idx_scores_session_name",
        "scores",
        ["session_id", "name"]
    )
```

---

## Optimization Roadmap — Summary Table

| ID | Name | Priority | Effort | Dependency | Status |
|---|---|---|---|---|---|
| SCALE-01 | API key Redis cache | High | Small | SCALE-05 | ⏳ Planned |
| SCALE-02 | Separate scheduler process | High | Medium | — | ⏳ Planned |
| SCALE-03 | Issue detection off request path | Medium | Medium | SCALE-05 | ⏳ Planned |
| SCALE-04 | TimescaleDB hypertables | Medium | Small | — | ⏳ Planned |
| SCALE-05 | Wire up Redis client | Medium | Small | — | ⏳ Planned |
| SCALE-06 | Durable job queue (arq) | Medium | Large | SCALE-05 | ⏳ Planned |
| SCALE-07 | Separate read/write pools | Low | Small | — | ⏳ Planned |
| SCALE-08 | Composite DB indexes | Low | Small | — | ⏳ Planned |

**Suggested order of implementation:**
1. SCALE-05 (Redis client — unblocks 01, 03, 06)
2. SCALE-01 (API key cache — immediate ingest throughput gain)
3. SCALE-02 (Scheduler isolation — required before any horizontal scaling)
4. SCALE-04 (Hypertables — do before data grows large)
5. SCALE-08 (Composite indexes — cheap, do alongside 04)
6. SCALE-03 (Issue detection async — when issue detection gets smarter)
7. SCALE-06 (arq queue — when jobs need durability guarantees)
8. SCALE-07 (Read replica — when analytics queries slow down dashboard)

---

## What Stays Simple by Design

The following are **not** on the roadmap because the added complexity isn't worth it at current scale:

- **Kafka / Kinesis for ingest** — Redis queue (SCALE-06) is sufficient up to ~10 M spans/day. Kafka adds operational complexity for marginal gain.
- **Elasticsearch for session search** — PostgreSQL full-text search with `tsvector` handles the current search needs. Re-evaluate at 100 M+ sessions.
- **GraphQL** — REST is simpler to cache, document, and debug. The current API surface doesn't need graph traversal.
- **Multi-region** — Single-region is appropriate until there are paying customers in multiple regions with latency complaints.
- **CDN for API** — Ingest endpoints accept writes; CDN caching doesn't apply. Dashboard assets are served by the Next.js host (Vercel/Railway), which handles this automatically.
