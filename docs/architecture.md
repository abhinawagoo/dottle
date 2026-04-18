# Dottle Architecture

## System Overview

```
┌────────────────────────────────────────────────────────────────┐
│                        Your AI Agent                          │
│                                                                │
│   dottle SDK (Python)                                       │
│   ├── session() context manager                                │
│   ├── span() context manager                                   │
│   ├── LoopDetector (client-side)                               │
│   └── AgentLoopClient                                          │
│       ├── in-memory span buffer (deque)                        │
│       └── background flush thread (every 2s)                   │
└────────────────────────┬───────────────────────────────────────┘
                         │ HTTP POST /api/v1/ingest/spans
                         │ (batches of up to 50 spans)
                         ▼
┌────────────────────────────────────────────────────────────────┐
│                   FastAPI Backend (port 8000)                  │
│                                                                │
│   Routers                                                      │
│   ├── /ingest      — SDK data ingestion                        │
│   ├── /sessions    — query sessions + spans                    │
│   ├── /metrics     — aggregations (cost, latency, failures)    │
│   ├── /alerts      — CRUD alert rules + events                 │
│   └── /projects    — project management                        │
│                                                                │
│   Services                                                     │
│   ├── loop_detector.py  — server-side loop analysis            │
│   ├── cost.py           — token → USD mapping                  │
│   ├── alert_service.py  — rule evaluation engine               │
│   └── notifier.py       — Slack + SMTP dispatch                │
│                                                                │
│   Workers                                                      │
│   └── alert_worker.py   — APScheduler (60s interval)           │
└───────────────┬───────────────────────────┬────────────────────┘
                │ async SQLAlchemy           │ aioredis
                ▼                           ▼
┌───────────────────────┐     ┌─────────────────────┐
│     TimescaleDB       │     │       Redis          │
│     (PostgreSQL 15)   │     │       (cache)        │
│                       │     └─────────────────────┘
│  Hypertables:         │
│  ├── agent_sessions   │ ◀── partitioned by started_at
│  ├── spans            │ ◀── partitioned by started_at
│  └── tool_calls       │ ◀── partitioned by called_at
│                       │
│  Regular tables:      │
│  ├── projects         │
│  ├── alert_rules      │
│  └── alert_events     │
└───────────────────────┘
                │
                ▼
┌────────────────────────────────────────────────────────────────┐
│               Next.js Dashboard (port 3000)                    │
│                                                                │
│   Pages                                                        │
│   ├── / Dashboard       — summary stats + recent sessions      │
│   ├── /sessions         — filterable session list              │
│   ├── /sessions/:id     — trace timeline + span detail         │
│   ├── /metrics          — cost, tool failure, latency charts   │
│   ├── /alerts           — alert rules + event history          │
│   └── /settings         — project + API key management         │
│                                                                │
│   Key Components                                               │
│   ├── TraceTimeline     — CSS-based waterfall visualization    │
│   └── ECharts           — cost, failure rate, latency charts   │
└────────────────────────────────────────────────────────────────┘
```

## Database Design Decisions

### Why TimescaleDB?

Spans and sessions are time-series data. Every query has a time range filter:
```sql
WHERE started_at >= now() - interval '7 days'
```

TimescaleDB hypertables automatically partition data by time. This means:
- Queries that filter by time range only scan relevant partitions
- Old data can be compressed or dropped cheaply
- `time_bucket()` aggregation is built-in and fast
- It's still PostgreSQL — same driver, same ORM, same SQL

At 1M spans/day, plain PostgreSQL would need manual partitioning and struggle with range queries. TimescaleDB handles this transparently.

### Why denormalize tool_calls?

The #1 dashboard query is "what's the failure rate per tool across all sessions?". Without denormalization:
```sql
SELECT name, status FROM spans WHERE span_type = 'tool' AND project_id = ?
```
This requires scanning the full spans table with a partial index. At scale (millions of spans), this gets slow.

With the `tool_calls` table, that query becomes:
```sql
SELECT tool_name, status FROM tool_calls WHERE project_id = ?
```
A small, focused table with exactly the columns needed. One extra write per tool span on ingest is worth the read gain.

## SDK Design Decisions

### Background flush thread

The SDK never blocks the agent. Spans are buffered in a `deque` and a daemon thread flushes them every 2 seconds. If the backend is slow or down, the agent continues working — the SDK logs a warning and drops the batch (fire-and-forget).

This is the right default for production agents where observability must not affect agent reliability.

### Client-side + server-side loop detection

Loop detection runs twice:
1. **Client-side**: in the agent process, using `LoopDetector`. Can raise a warning or stop the agent early.
2. **Server-side**: on every `/ingest/spans` request, the backend re-validates using the same algorithm.

Why both? Client-side gives the agent real-time feedback. Server-side is authoritative for the database record and handles cases where the SDK is misconfigured or the agent crashes before the session ends cleanly.

## Alert Worker Design

`APScheduler`'s `AsyncIOScheduler` runs inside FastAPI's event loop. Every 60 seconds it:
1. Queries all enabled alert rules
2. Evaluates each rule against recent metrics
3. Fires notifications (Slack/email) for rules that cross threshold
4. Logs the event to `alert_events` for the audit trail

30-minute cooldown prevents alert storms. No external queue or worker process needed — this is appropriate for a self-hosted Level 1 tool.

## Trace Timeline Visualization

The trace waterfall uses pure CSS positioning. No D3, no canvas:

```
span.left_pct = (span.started_at - session.started_at) / session.duration_ms * 100
span.width_pct = span.duration_ms / session.duration_ms * 100
```

Each span is a `<div>` with `position: absolute; left: {left_pct}%; width: {width_pct}%`.

This renders instantly for sessions with hundreds of spans and requires zero JavaScript computation beyond simple arithmetic.
