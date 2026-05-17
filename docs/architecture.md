# Dottle Architecture

## System Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          Your AI Agent                                   │
│                                                                          │
│   dottle SDK (pip install dottle)                                        │
│   ├── dottle.session()       — context manager, auto start/end           │
│   ├── dottle.span()          — typed spans (llm, tool, retrieval, agent) │
│   ├── dottle.wrap_openai()   — auto-capture all OpenAI LLM calls         │
│   ├── dottle.wrap_anthropic()— auto-capture all Anthropic LLM calls      │
│   ├── LoopDetector           — client-side loop detection                │
│   └── AgentLoopClient                                                    │
│       ├── in-memory span buffer (deque, max 500)                         │
│       └── background flush thread (every 2s, timeout=30s)               │
└──────────────────────────────┬───────────────────────────────────────────┘
                               │ HTTP POST /api/v1/ingest/*
                               │ (X-API-Key: project api key)
                               ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    FastAPI Backend (api.dottle.dev)                      │
│                                                                          │
│   Ingest Layer  (/ingest)                                                │
│   ├── POST /session/start   — create session, return session_id          │
│   ├── POST /session/end     — finalize session, trigger all analysis     │
│   └── POST /spans           — ingest span batch, compute cost + loops    │
│                                                                          │
│   On session/end (fire-and-forget via asyncio.ensure_future):            │
│   ├── Issue detection       — server-side pattern analysis               │
│   ├── Auto quality scoring  — LLM rates 4 dimensions (0.0–1.0)          │
│   ├── LLM evaluator trigger — runs all active eval configs               │
│   └── Cache invalidation    — clears sessions_list + metrics caches      │
│                                                                          │
│   Query Layer                                                            │
│   ├── /sessions    — list (cached 15s) + detail + export (CSV/JSON)     │
│   ├── /metrics     — summary (cached 60s), cost/latency/quality charts   │
│   ├── /evals       — LLM-as-judge eval configs + results                 │
│   ├── /experiments — A/B prompt+model testing                            │
│   ├── /datasets    — test datasets, items, evaluation runs               │
│   ├── /monitors    — semantic behavior monitors + session flags           │
│   ├── /playground  — interactive multi-model chat                        │
│   ├── /prompts     — prompt version management                           │
│   ├── /projects    — project + API key management                        │
│   ├── /orgs        — org management + AI provider key storage            │
│   └── /auth        — JWT auth (login, register, me)                      │
│                                                                          │
│   Background Workers (APScheduler, runs in web process)                  │
│   ├── semantic_monitor_worker — every 300s, LLM-evaluates sessions       │
│   └── stale_session_reaper   — marks timed-out running sessions          │
│                                                                          │
│   Services                                                               │
│   ├── auto_quality.py    — 4-dim LLM quality scoring (0–1 each)         │
│   ├── loop_detector.py   — server-side loop analysis on span batches     │
│   ├── issue_detector.py  — heuristic issue detection (15+ patterns)      │
│   ├── cost.py            — token→USD for 40+ models                      │
│   └── cache.py           — Redis async wrapper (lazy singleton)          │
└──────────┬──────────────────────────────┬───────────────────────────────┘
           │ async SQLAlchemy             │ redis.asyncio
           ▼                             ▼
┌─────────────────────────┐   ┌──────────────────────────────────────────┐
│   PostgreSQL (Railway)  │   │   Redis Cache                            │
│                         │   │                                          │
│   Core tables:          │   │   Cache keys + TTLs:                     │
│   ├── agent_sessions    │   │   ├── sessions_list:{pid}:{hash}  15s    │
│   ├── spans             │   │   ├── metrics:{pid}:summary:…     60s    │
│   ├── tool_calls        │   │   ├── eval_configs:{pid}          60s    │
│   ├── scores            │   │   └── ai_provider:{oid}:{prov}   300s   │
│   ├── session_issues    │   │                                          │
│   │                     │   │   Invalidation:                          │
│   AI observability:     │   │   ├── on session/end → sessions_list +  │
│   ├── eval_configs      │   │   │   metrics (cache_delete_pattern)     │
│   ├── eval_results      │   │   └── on eval config CRUD → eval_configs │
│   ├── experiments       │   └──────────────────────────────────────────┘
│   ├── experiment_runs   │
│   ├── datasets          │
│   ├── dataset_items     │
│   ├── dataset_runs      │
│   ├── semantic_monitors │
│   ├── monitor_session_flags
│   │                     │
│   Auth + config:        │
│   ├── users             │
│   ├── orgs              │
│   ├── org_members       │
│   ├── projects          │
│   ├── org_ai_providers  │
│   └── prompts           │
└─────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────────────────┐
│              Next.js Dashboard (app.dottle.dev / Vercel)                 │
│                                                                          │
│   Pages                                                                  │
│   ├── /               — dashboard: summary stats + recent sessions       │
│   ├── /sessions        — filterable list, brain badges, monitor filter   │
│   ├── /sessions/:id    — trace waterfall + spans + scores + flags        │
│   ├── /metrics         — cost, quality, token, latency, regression       │
│   ├── /evals           — LLM evaluator configs + result history          │
│   ├── /experiments     — A/B experiment builder + results                │
│   ├── /datasets        — test dataset CRUD + CSV/JSON import + runs      │
│   ├── /monitors        — semantic monitor CRUD                           │
│   ├── /playground      — multi-model interactive chat                    │
│   ├── /prompts         — prompt version history                          │
│   └── /settings        — org API keys + project management               │
│                                                                          │
│   Key Components                                                         │
│   ├── ModelPicker      — provider-logo grouped model selector           │
│   ├── TraceTimeline    — CSS waterfall (no D3 required)                  │
│   ├── SessionDetailPanel — drawer panel with full session context        │
│   └── ECharts          — cost, quality trend, token distribution        │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Feature Deep Dives

### 1. Data Ingestion Pipeline

The SDK writes to three endpoints, in order:

```
POST /ingest/session/start  → creates AgentSession (status=running)
POST /ingest/spans          → creates Spans, ToolCalls; updates session aggregates
POST /ingest/session/end    → finalizes session; fires all analysis
```

**On `/session/end`** (synchronous, before response):
- Runs `detect_all(snapshot)` — 15+ heuristic issue detectors (high cost, slow tool, loop, error cascade, etc.)
- Inserts `SessionIssue` rows for all detected issues

**After response (fire-and-forget)**:
```python
asyncio.ensure_future(_bg_score_session(...))      # auto quality scoring
asyncio.ensure_future(_bg_trigger_evals(...))      # LLM evaluator configs
asyncio.ensure_future(cache_delete_pattern(...))   # sessions_list cache
asyncio.ensure_future(cache_delete_pattern(...))   # metrics cache
```

This pattern means ingest latency is never blocked by downstream AI calls.

---

### 2. Auto Quality Scoring

Every session that ends triggers `score_session()` in a background task. The scorer calls an LLM (Anthropic Claude by default) with session context and gets four 0–1 scores:

| Dimension | What it measures |
|---|---|
| `task_completion` | Did the agent finish the job? |
| `coherence` | Were the reasoning steps logical? |
| `efficiency` | Was cost/iteration count reasonable? |
| `overall_quality` | Holistic session quality |

Scores are stored in the `scores` table (`source=model`, `name=auto_quality`).

**Provider selection**: Uses org's configured Anthropic API key (cached 300s in Redis), falls back to `settings.anthropic_api_key`. The frontend's re-score button lets users select any configured provider's model via `ModelPicker`.

---

### 3. LLM Evaluator Configs (Evals)

User-defined LLM-as-judge evaluators that auto-run on completed sessions.

**Configuration fields:**
- `evaluator_model` — any model in `ModelPicker` (Anthropic, OpenAI, Gemini, etc.)
- `criteria` — free-text evaluation criteria
- `score_name` — name of the score (e.g., `helpfulness`, `accuracy`)
- `score_range_min/max` — output range (default 0.0–1.0)
- `run_on` — `"all"` or `"sample"`
- `sample_rate` — 0.0–1.0 when `run_on=sample`

**Auto-trigger flow:**
```
session/end
  → _bg_trigger_evals()
    → _run_evals_for_session()   # checks Redis cache for eval_configs:{project_id}
      → for each active config: _run_eval_for_session()
        → build context from session spans (up to 30 spans)
        → call evaluator_model with criteria prompt
        → parse {"score": N, "reasoning": "..."}
        → write EvalResult + Score rows
```

Eval config list is cached in Redis (TTL=60s, invalidated on any config CRUD) so repeated session ends don't hit the DB for config lookup.

---

### 4. A/B Experiments

Experiments compare two `VariantConfig` (model + system_prompt pairs) against a dataset.

**Run flow:**
1. `POST /experiments/{id}/run` → sets status=running, kicks off `_run_experiment` as background task
2. For each dataset item (up to 50):
   - Send `item.input` to both variant A and B models
   - Score each response 0–100 using `_score_response()` (Claude Haiku as judge)
3. Compute summary: avg scores, win counts, winner

**API key resolution**: Uses `get_ai_provider_key(org_id, provider)` (Redis-cached 300s), falls back to `settings.anthropic_api_key`. This means experiments work with any org-configured provider key.

**Multi-provider support**: `MODEL_TO_PROVIDER` map in `playground.py` routes each model ID to its API endpoint. Supported: Anthropic, OpenAI, Groq, Together, Mistral, Gemini.

---

### 5. Datasets

Datasets are collections of `DatasetItem` rows (input + expected_output) that can be:
- Created manually via the UI
- Populated from completed sessions (auto-extracts agent metadata as input)
- Bulk-imported from CSV or JSON files

**Dataset Runs** evaluate every item using LLM-as-judge:
- Uses org's Anthropic API key (via `get_ai_provider_key` cache)
- Configurable model (default: `claude-haiku-4-5-20251001`)
- Custom eval criteria or default quality criteria
- Results stored as JSON array on `DatasetRun.results`
- `avg_score` (0–1) summarized on the run

---

### 6. Semantic Monitors

Semantic monitors detect behavioral patterns across sessions using LLM pattern-matching.

**Configuration:**
- `pattern_prompt` — describes the behavior to detect (e.g., "Agent is hallucinating facts")
- `model_provider` + `model_id` — judge model (selected via ModelPicker)
- `active` — enable/disable

**Worker**: APScheduler runs every 300 seconds, evaluates recent sessions that haven't been checked against each active monitor. Results stored in `monitor_session_flags` (matched=True/False + reason).

**Frontend integration:**
- Brain badge (🧠) on sessions list rows with any matched flags
- Filter sessions list by monitor via dropdown
- Behavioral flags card on session detail page with deep-link to monitor

---

### 7. Redis Cache Layer

`backend/app/services/cache.py` provides a lazy-singleton async Redis client with four helpers:

| Function | Purpose |
|---|---|
| `cache_get(key)` | JSON deserialize; returns None on miss/error |
| `cache_set(key, value, ttl)` | JSON serialize with `default=str` |
| `cache_delete(key)` | Single key delete (best-effort) |
| `cache_delete_pattern(pattern)` | KEYS + DELETE on glob pattern |
| `get_ai_provider_key(org_id, provider)` | DB lookup with 300s cache; empty string = not found sentinel |
| `invalidate_ai_provider_cache(org_id)` | Called on provider key update |

All operations are error-isolated — cache failures never propagate to the caller.

**Cache strategy:**

| Endpoint | Key Pattern | TTL | Invalidated by |
|---|---|---|---|
| `GET /sessions` | `sessions_list:{pid}:{filter_md5}` | 15s | `session/end` |
| `GET /metrics/summary` | `metrics:{pid}:summary:{from}:{to}` | 60s | `session/end` |
| Active eval configs | `eval_configs:{pid}` | 60s | eval config CRUD |
| Org AI provider keys | `ai_provider:{oid}:{provider}` | 300s | provider key update |

---

### 8. Issue Detection

`backend/app/services/issue_detector.py` runs synchronously on `session/end`. It analyzes the `SessionSnapshot` (status, durations, cost, tokens, spans) and emits typed issues:

| Issue Type | Severity | Trigger |
|---|---|---|
| `high_cost` | medium | session cost > $1.00 |
| `slow_tool` | low | any tool span > 10s |
| `error_cascade` | high | 3+ consecutive failed spans |
| `loop_detected` | high | `session.loop_detected == True` |
| `no_output` | medium | session completed with no output spans |
| `token_spike` | medium | total_tokens > 50k |
| ... (15+ total) | | |

Issues appear in the session detail page's Issues tab and are used in alert rule evaluation.

---

## Data Flow: Complete Session Lifecycle

```
Agent starts
  → SDK: POST /ingest/session/start
    → DB: INSERT agent_sessions (status=running)
    ← session_id

Agent runs (spans emitted)
  → SDK: POST /ingest/spans (batched every 2s)
    → DB: INSERT spans, tool_calls
    → DB: UPDATE agent_sessions (cost, tokens, iterations)
    → server-side loop detection → if loop: UPDATE status=looping

Agent ends
  → SDK: POST /ingest/session/end
    → DB: UPDATE agent_sessions (status, duration, error)
    → detect_all() → INSERT session_issues
    → fire-and-forget:
        _bg_score_session()        → LLM → INSERT scores (auto_quality)
        _bg_trigger_evals()        → Redis cache → LLM → INSERT eval_results + scores
        cache_delete_pattern(sessions_list:*)
        cache_delete_pattern(metrics:*)
    ← {ok: true, issues_detected: N}

APScheduler (every 300s)
  → semantic_monitor_worker
    → for each active monitor: check unchecked sessions
    → LLM pattern match → UPSERT monitor_session_flags
```

---

## Database Schema Summary

### Core Observability
| Table | Key Columns |
|---|---|
| `agent_sessions` | id, project_id, agent_name, status, started_at, duration_ms, total_cost_usd, total_tokens, loop_detected, tags, user_id, user_email, agent_version |
| `spans` | id, session_id, project_id, span_type, name, status, duration_ms, model, input_tokens, output_tokens, cost_usd, input_text, output_text |
| `tool_calls` | id, span_id, session_id, project_id, tool_name, status, duration_ms, input_hash |
| `scores` | id, session_id, project_id, name, value (0–1), source (human/model), model_name |
| `session_issues` | id, session_id, project_id, issue_type, severity, title, description |

### AI Observability Features
| Table | Key Columns |
|---|---|
| `eval_configs` | id, project_id, name, evaluator_model, criteria, score_name, score_range_min/max, run_on, sample_rate, active |
| `eval_results` | id, eval_config_id, session_id, project_id, score_value, reasoning, status |
| `experiments` | id, project_id, name, dataset_id, variant_a/b (JSON), status, result_summary |
| `experiment_runs` | id, experiment_id, variant, item_index, input_text, response_text, score, reasoning |
| `datasets` | id, project_id, name, description |
| `dataset_items` | id, dataset_id, session_id, input (JSON), expected_output |
| `dataset_runs` | id, dataset_id, project_id, model, status, results (JSON), avg_score |
| `semantic_monitors` | id, project_id, name, pattern_prompt, model_provider, model_id, active |
| `monitor_session_flags` | id, monitor_id, session_id, matched, reason |

### Auth + Config
| Table | Key Columns |
|---|---|
| `users` | id, email, hashed_password, org_id |
| `orgs` | id, name, slug |
| `projects` | id, org_id, name, api_key |
| `org_ai_providers` | id, org_id, provider, api_key_enc |
| `prompts` | id, project_id, name, content, version |

---

## SDK Design

### Transport
- **Buffer**: `collections.deque(maxlen=500)` — newest spans drop oldest if agent is very fast
- **Flush thread**: daemon thread, flushes every 2s, timeout 30s per HTTP call
- **Auto-wrapping**: `wrap_openai(client)` / `wrap_anthropic(client)` patches the client's completion methods to emit `llm` spans automatically

### Providers auto-detected by model prefix
| Prefix | Provider |
|---|---|
| `claude-*` | Anthropic |
| `gpt-*`, `o1-*`, `o3-*`, `o4-*` | OpenAI |
| `gemini-*`, `gemma-*` | Google Gemini |
| `mistral-*`, `mixtral-*` | Mistral |
| `llama-*`, `llama3-*` | Groq / Together |

---

## Scaling Considerations

### Current constraints
- **Scheduler in web process**: `APScheduler` runs inside FastAPI. Cannot run >1 web replica without duplicate monitor evaluations. See `docs/scalability.md` SCALE-02.
- **Redis KEYS pattern**: `cache_delete_pattern` uses `KEYS` (not `SCAN`). Fine for <10k keys; replace with `SCAN` before scaling beyond single Redis node.
- **Dataset run limit**: Capped at 50 items per experiment run, no cap on dataset runs. Background tasks run inline — consider Celery/ARQ for long-running jobs at scale.

### Horizontal scaling path
1. Move scheduler → dedicated worker container
2. Replace `asyncio.ensure_future` background tasks → task queue (ARQ + Redis)
3. Enable TimescaleDB hypertables on `agent_sessions` + `spans`
4. Replace `KEYS` with `SCAN` in `cache_delete_pattern`
