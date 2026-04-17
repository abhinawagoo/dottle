# API Reference

Base URL: `http://localhost:8000/api/v1`

Interactive docs: `http://localhost:8000/docs` (Swagger UI)

---

## Authentication

SDK-facing ingest endpoints require `X-API-Key` header:
```
X-API-Key: alp_live_your_key_here
```

Dashboard endpoints (sessions, metrics, alerts) are unauthenticated in v1.

---

## Projects

### POST /projects
Create a new project and generate an API key.

```json
// Request
{ "name": "research-agent", "description": "Production research agent" }

// Response 201
{
  "id": "uuid",
  "name": "research-agent",
  "api_key": "alp_live_xxxxxxxxxxxx",
  "created_at": "2026-04-12T10:00:00Z"
}
```

### GET /projects
List all projects.

### DELETE /projects/{id}
Delete project and all associated data.

---

## Ingest (SDK → Backend)

### POST /ingest/session/start
```json
// Request
{
  "session_id": "uuid",          // optional; server generates if absent
  "agent_name": "research_agent",
  "external_id": "job-123",
  "started_at": "2026-04-12T10:00:00Z",
  "metadata": { "user_id": "u1" }
}
// Response 201
{ "session_id": "uuid" }
```

### POST /ingest/session/end
```json
// Request
{
  "session_id": "uuid",
  "status": "completed",         // completed | failed
  "ended_at": "2026-04-12T10:02:30Z",
  "error_message": null,
  "loop_detected": false,
  "loop_reason": null,
  "iteration_count": 4
}
// Response 200
{ "ok": true }
```

### POST /ingest/spans
Batch ingest (up to 200 spans per request).

```json
// Request
{
  "session_id": "uuid",
  "spans": [
    {
      "span_id": "uuid",
      "parent_span_id": null,
      "span_type": "llm",           // llm | tool | retrieval | agent | custom
      "name": "gpt-4o call",
      "status": "ok",               // ok | error | timeout
      "started_at": "2026-04-12T10:00:01Z",
      "ended_at": "2026-04-12T10:00:04Z",
      "model": "gpt-4o",
      "input_tokens": 512,
      "output_tokens": 128,
      "attributes": { "temperature": 0.7 }
    },
    {
      "span_id": "uuid2",
      "span_type": "tool",
      "name": "search_web",
      "status": "error",
      "started_at": "2026-04-12T10:00:05Z",
      "ended_at": "2026-04-12T10:00:06Z",
      "error_message": "HTTP 429: rate limited",
      "error_type": "HTTPError",
      "attributes": { "input_hash": "abc123" }
    }
  ]
}
// Response 202
{ "accepted": 2 }
```

---

## Sessions

### GET /sessions
```
GET /sessions?project_id=uuid&status=failed&loop_detected=true&page=1&page_size=50
```

Response:
```json
{
  "total": 142,
  "page": 1,
  "page_size": 50,
  "items": [
    {
      "id": "uuid",
      "agent_name": "research_agent",
      "status": "completed",
      "started_at": "...",
      "ended_at": "...",
      "duration_ms": 42300,
      "total_cost_usd": 0.0182,
      "total_tokens": 3200,
      "iteration_count": 4,
      "loop_detected": false
    }
  ]
}
```

Query params:
- `project_id` (required)
- `status` — filter by status
- `agent_name` — filter by agent
- `loop_detected` — true/false
- `from` / `to` — ISO datetime range
- `page`, `page_size`

### GET /sessions/{session_id}
Full session detail including all spans.

---

## Metrics

### GET /metrics/summary
```
GET /metrics/summary?project_id=uuid&from=2026-04-05T00:00:00Z
```

```json
{
  "total_sessions": 412,
  "total_cost_usd": 12.34,
  "avg_cost_per_session": 0.030,
  "avg_latency_ms": 18400,
  "p95_latency_ms": 62000,
  "loop_rate_pct": 4.2,
  "tool_failure_rate_pct": 8.7,
  "error_rate_pct": 6.8,
  "sessions_by_status": { "completed": 380, "failed": 28, "looping": 4 }
}
```

### GET /metrics/cost-over-time
```
GET /metrics/cost-over-time?project_id=uuid&granularity=day
```
granularity: `hour` | `day` | `week`

```json
{
  "granularity": "day",
  "series": [
    { "bucket": "2026-04-10", "cost_usd": 3.21, "session_count": 112, "token_count": 450000 }
  ]
}
```

### GET /metrics/tool-failure-rates
```json
{
  "tools": [
    { "tool_name": "search_web", "total": 540, "errors": 48, "failure_rate_pct": 8.9, "avg_duration_ms": 1200 }
  ]
}
```

### GET /metrics/latency
```json
{
  "percentiles": {
    "p50_ms": 12000,
    "p75_ms": 28000,
    "p95_ms": 61000,
    "p99_ms": 120000
  }
}
```

---

## Alerts

### POST /alerts/rules
```json
{
  "project_id": "uuid",
  "name": "High loop rate",
  "metric": "loop_detected",
  "operator": "gt",
  "threshold": 0,
  "window_minutes": 60,
  "channel": "slack",
  "destination": "https://hooks.slack.com/services/..."
}
```

Metrics: `loop_detected` | `tool_failure_rate` | `cost_per_session` | `session_duration_ms` | `iteration_count` | `error_rate`

Operators: `gt` | `gte` | `lt` | `lte` | `eq`

Channels: `slack` | `email`

### GET /alerts/rules?project_id=uuid
### PATCH /alerts/rules/{id} — partial update (enable/disable, change threshold)
### DELETE /alerts/rules/{id}
### GET /alerts/events?project_id=uuid — alert fire history
