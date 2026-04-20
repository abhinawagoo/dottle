# Dottle — AI Agent Observability Platform

> **The fastest way to see exactly what your AI agent is doing in production — every LLM call, every tool, every failure, every dollar.**

Live platform: [app.dottle.dev](https://app.dottle.dev) · Docs: [dottle.dev/docs](https://dottle.dev/docs)

---

## The Problem

You've shipped an AI agent. It's live. Users are using it.

And you have **no idea what it's actually doing.**

- A user complains "the agent gave a wrong answer" — which LLM call? Which prompt? Which tool failed?
- Your AWS bill has a surprise $400 charge this month — which session caused it?
- Someone reports "the agent just keeps looping" — nobody knows until the user gives up
- You pushed a new prompt last Tuesday — did it make things better or worse?
- Your voice AI is handling 300 calls a day — you're literally listening to random recordings hoping to catch problems

**This is the exact problem Sentry solved for normal software in 2010. Dottle solves it for AI agents today.**

---

## What Dottle Does

Dottle instruments your AI agent with 3 lines of code and gives you a complete picture of every agent run in production — real time.

```
Your agent runs  →  Dottle captures every step  →  You see it on the dashboard
```

**Four layers:**

| Layer | What it does |
|---|---|
| **Observe** | Real-time trace of every LLM call, tool execution, retrieval, and sub-agent call |
| **Detect** | Automatic detection of 10+ behavioral issues — loops, failures, cost spikes, tool storms |
| **Diagnose** | AI-powered session analysis — ask Claude "why did this session fail?" with full context |
| **Fix** | AI code fix generation + GitHub PR creation directly from any detected issue |

---

## What You Get

### Real-time Session Tracing

Every agent run becomes a session. Every step inside it becomes a span. You see:

- The full waterfall timeline — which step ran, when, and how long it took
- Every LLM call with the exact prompt sent and response received
- Every tool call, its arguments, its result, and whether it succeeded or errored
- Every retrieval (RAG, vector DB) with latency
- Token counts and cost calculated automatically for 20+ models

### Automatic Issue Detection

Dottle runs 10 behavioral detectors on every session end — no configuration needed:

| Issue | What it means |
|---|---|
| **Loop detected** | Agent called the same tool 3+ times with identical inputs |
| **Task failure** | Session ended in error |
| **High cost** | Session cost more than expected |
| **Excessive tokens** | Unusually high token count — likely prompt bloat |
| **Tool error storm** | Multiple tool failures in one session |
| **Repeated tool failure** | Same tool failing across multiple sessions |
| **Slow response** | Session latency above threshold |
| **No LLM output** | LLM returned empty or refused |
| **User frustration signals** | Patterns indicating the user is not getting what they need |
| **Refusals** | LLM refused to complete the task |

All issues aggregate into an **Issues Board** — grouped by type, sorted by severity, linked to every affected session.

### Cost Tracking

Every LLM call's cost is computed automatically from token counts:

- Cost per session, per agent, per model, per time period
- Cost-over-time chart (hourly / daily / weekly)
- Alert when a single session exceeds a cost threshold
- Regression detection — compare this week vs last week or prompt v1 vs v2

**Supported models:** GPT-4o, GPT-4o mini, GPT-4 Turbo, GPT-3.5, Claude Sonnet, Claude Haiku, Claude Opus, Gemini Pro, Gemini Flash, Llama 3, Mistral, and 15+ more. Costs stay current.

### Regression Detection

Push a new prompt, change a model, update agent logic — and know immediately whether it made things better or worse:

- Compare **version A vs version B** on failure rate, loop rate, cost, and latency
- Compare **this week vs last week** automatically
- Catches silent regressions before your users do

### AI Diagnosis Chat

Open any session — especially one that failed — and ask Claude about it. Claude reads every span, prompt, response, and error and gives you a specific answer:

> "Why did this session fail?"  
> "What caused the loop?"  
> "Which tool is responsible for the high latency?"  
> "What did the agent say that frustrated the user?"

No log diving. No guessing. 30 seconds from incident to root cause.

### AI Code Fix + GitHub PR

When an issue is detected, click "Fix with AI." Dottle:

1. Reads the relevant source files from your connected GitHub repo
2. Generates a code patch targeting the specific bug
3. Shows you a diff to review
4. Creates a GitHub PR — one click

### Alerts

Set rules that fire when something goes wrong — before a user reports it:

- Loop detected in any session → Slack message in 60 seconds
- Session cost > $0.50 → email alert
- Tool failure rate > 10% in last hour → Slack
- Session duration > 2 minutes → email

Channels: **Slack** and **email**. Alert history is stored for review.

### Session Fixtures (Reproduce Any Failure)

AI agents are non-deterministic — you can't just re-run them to reproduce a bug. Dottle solves this:

- Click any session → "Generate Test Fixture"
- Dottle creates a Python `pytest` or TypeScript `vitest` file that mocks all LLM calls with the exact recorded outputs
- The session is now fully reproducible, deterministic, and testable

### PII Redaction

Enable `redact_pii=True` and Dottle automatically strips emails, phone numbers, credit cards, SSNs, IP addresses, and API keys from all recorded prompts and responses before they reach the server.

---

## What You Save

### Time

| Without Dottle | With Dottle |
|---|---|
| Hours debugging why a session failed | 30 seconds with AI Diagnosis Chat |
| Searching logs to find the expensive session | Sessions list sorted by cost, instant |
| Listening to random call recordings | Filter sessions by issue type, see exact transcript |
| Manually writing regression tests | One-click test fixture generation |
| Writing a GitHub PR to fix the bug | AI code fix + PR in one click |

### Money

A typical team running production AI agents without observability experiences:

- **15–30% of sessions failing silently** — costing tokens and user trust
- **Loops running to max iteration** — 5–10x the expected cost per session
- **Undetected prompt regressions** running for days — degraded experience for all users

**Conservative estimate:** Catching 2 looping sessions per day that each burn 5x expected tokens saves $30–$150/month at current model prices — more than the cost of Dottle's Pro plan.

---

## Performance

Dottle is built to be invisible to your agent:

- **Zero latency impact** — all instrumentation calls are fire-and-forget, running in background threads (Python) or async background intervals (JavaScript). Your agent does not wait for Dottle.
- **Fault-tolerant** — if Dottle's backend is unreachable, your agent keeps running. Monitoring failures are silently swallowed.
- **Batch ingestion** — spans are batched and sent every 2 seconds (configurable), not on every call.
- **5ms overhead** per session to start/end — measured on a cold Python process.
- **No proxy** — unlike some competitors, Dottle does not sit in the middle of your LLM calls. You call OpenAI/Anthropic directly. Dottle just observes.

---

## Integration — 5 Minutes to Your First Trace

### Step 1 — Get your API key

Sign up at [app.dottle.dev](https://app.dottle.dev) → create an organization → create a project → copy your `dtl_live_...` API key from the project settings.

### Step 2 — Add `dottle.py` to your project

No pip install required. Copy this file into your agent's codebase:

```python
# dottle.py
import uuid, threading, requests
from datetime import datetime, timezone

DOTTLE_API_URL = "https://dottle-production.up.railway.app/api/v1"
DOTTLE_API_KEY  = "dtl_live_YOUR_KEY_HERE"

_HEADERS = {"X-API-Key": DOTTLE_API_KEY, "Content-Type": "application/json"}

def _now(): return datetime.now(timezone.utc).isoformat()

def _post(path, body):
    def _send():
        try: requests.post(f"{DOTTLE_API_URL}{path}", headers=_HEADERS, json=body, timeout=5)
        except: pass
    threading.Thread(target=_send, daemon=True).start()

class Session:
    def __init__(self, agent_name, user_id=None, user_email=None, tags=None, agent_version=None):
        self.session_id = str(uuid.uuid4())
        _post("/ingest/session/start", {
            "session_id": self.session_id, "agent_name": agent_name,
            "started_at": _now(), "user_id": user_id, "user_email": user_email,
            "tags": tags or [], "agent_version": agent_version,
        })

    def llm(self, name, model, input_tokens, output_tokens,
            input_text=None, output_text=None, duration_ms=None):
        _post("/ingest/spans", {"session_id": self.session_id, "spans": [{
            "span_id": str(uuid.uuid4()), "span_type": "llm", "name": name,
            "status": "ok", "started_at": _now(), "model": model,
            "input_tokens": input_tokens, "output_tokens": output_tokens,
            "input_text": input_text, "output_text": output_text, "duration_ms": duration_ms,
        }]})

    def tool(self, name, status="ok", error_message=None, error_type=None, duration_ms=None):
        _post("/ingest/spans", {"session_id": self.session_id, "spans": [{
            "span_id": str(uuid.uuid4()), "span_type": "tool", "name": name,
            "status": status, "started_at": _now(),
            "error_message": error_message, "error_type": error_type, "duration_ms": duration_ms,
        }]})

    def retrieval(self, name, status="ok", duration_ms=None):
        _post("/ingest/spans", {"session_id": self.session_id, "spans": [{
            "span_id": str(uuid.uuid4()), "span_type": "retrieval",
            "name": name, "status": status, "started_at": _now(), "duration_ms": duration_ms,
        }]})

    def finish(self, status="completed", error_message=None, error_type=None):
        _post("/ingest/session/end", {
            "session_id": self.session_id, "status": status,
            "ended_at": _now(), "error_message": error_message, "error_type": error_type,
        })
```

### Step 3 — Wrap your agent

**Anthropic (Claude):**
```python
import time, anthropic
from dottle import Session

client = anthropic.Anthropic()

def run_agent(user_message: str, user_email: str = None):
    session = Session("my-agent", user_email=user_email)
    try:
        t0 = time.time()
        response = client.messages.create(
            model="claude-sonnet-4-6", max_tokens=1024,
            messages=[{"role": "user", "content": user_message}],
        )
        session.llm(
            name="main_response", model="claude-sonnet-4-6",
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
            input_text=user_message,
            output_text=response.content[0].text,
            duration_ms=int((time.time() - t0) * 1000),
        )
        session.finish("completed")
        return response.content[0].text
    except Exception as e:
        session.finish("failed", error_message=str(e), error_type=type(e).__name__)
        raise
```

**OpenAI (GPT):**
```python
import time, openai
from dottle import Session

client = openai.OpenAI()

def run_agent(user_message: str, user_email: str = None):
    session = Session("my-agent", user_email=user_email)
    try:
        t0 = time.time()
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": user_message}],
        )
        session.llm(
            name="main_response", model="gpt-4o",
            input_tokens=response.usage.prompt_tokens,
            output_tokens=response.usage.completion_tokens,
            input_text=user_message,
            output_text=response.choices[0].message.content,
            duration_ms=int((time.time() - t0) * 1000),
        )
        session.finish("completed")
        return response.choices[0].message.content
    except Exception as e:
        session.finish("failed", error_message=str(e), error_type=type(e).__name__)
        raise
```

**Multi-step agent with tools:**
```python
import time
from dottle import Session

def run_agent(query: str, user_email: str = None):
    session = Session("sales-agent", user_email=user_email, tags=["production"])
    try:
        # Tool call
        t0 = time.time()
        try:
            data = lookup_crm(query)
            session.tool("lookup_crm", status="ok", duration_ms=int((time.time()-t0)*1000))
        except Exception as e:
            session.tool("lookup_crm", status="error",
                         error_message=str(e), error_type=type(e).__name__)

        # LLM call
        t0 = time.time()
        response = call_llm(query, data)
        session.llm(
            name="generate_response", model="claude-sonnet-4-6",
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
            duration_ms=int((time.time()-t0)*1000),
        )

        session.finish("completed")
        return response.text
    except Exception as e:
        session.finish("failed", error_message=str(e), error_type=type(e).__name__)
        raise
```

**Async agent:**
```python
import asyncio, time
from dottle import Session

async def run_agent(query: str):
    session = Session("async-agent")
    try:
        t0 = time.time()
        response = await async_llm_call(query)
        session.llm("response", "gpt-4o",
                    input_tokens=response.usage.prompt_tokens,
                    output_tokens=response.usage.completion_tokens,
                    duration_ms=int((time.time()-t0)*1000))
        session.finish("completed")
        return response
    except Exception as e:
        session.finish("failed", error_message=str(e))
        raise
```

### Step 4 — Verify

Run your agent once. Within seconds, open [app.dottle.dev/sessions](https://app.dottle.dev/sessions) — your session will appear as a row. Click it to see the full trace timeline.

---

## JavaScript / TypeScript Integration

```bash
npm install dottle
```

```ts
import dottle from "dottle";

dottle.configure({
  apiKey: "dtl_live_YOUR_KEY_HERE",
  apiUrl: "https://dottle-production.up.railway.app/api/v1",
});

// Wrap your agent entry point in session()
const result = await dottle.session("my-agent", async () => {

  // Track an LLM call
  const answer = await dottle.span("llm", "gpt-4o call", async (s) => {
    const res = await openai.chat.completions.create({ model: "gpt-4o", messages: [...] });
    s.recordTokens(res.usage.prompt_tokens, res.usage.completion_tokens, "gpt-4o");
    return res.choices[0].message.content;
  });

  // Track a tool call
  const data = await dottle.span("tool", "lookup_crm", async () => {
    return crm.find(userId);
  });

  return answer;
});
```

Works in **Node.js**, **Next.js**, **Express**, **Remix**, **Bun** — zero npm dependencies, uses native fetch.

---

## What Framework / Stack You're Using — What Code to Use

| Your stack | What to use |
|---|---|
| Raw Anthropic Python SDK | `Session` class from `dottle.py` — `session.llm()` after each `client.messages.create()` |
| Raw OpenAI Python SDK | Same — map `response.usage.prompt_tokens` → `input_tokens` |
| LangChain (Python) | Wrap individual chain steps in `session.llm()` / `session.tool()` |
| CrewAI | One `Session` per crew run. Each `Task` maps to a span |
| AutoGen / multi-agent | One `Session` per top-level task. Each sub-agent conversation is a child `span_type="agent"` |
| Voice AI (Bland, Vapi, Retell) | One `Session` per call. `user_id` = caller phone number. `tags` = call type |
| Next.js API route | JS SDK — configure in `lib/dottle.ts`, import in route handlers |
| Express / Fastify | JS SDK — configure at app startup |
| Async Python (FastAPI, etc.) | `Session` class works fine — all `_post()` calls are non-blocking threads |

---

## API Reference

Base URL: `https://dottle-production.up.railway.app/api/v1`

Authentication: `X-API-Key: dtl_live_your_key`

### Start a session
```
POST /ingest/session/start
```
```json
{
  "session_id": "uuid",         // optional — server generates if absent
  "agent_name": "my-agent",     // required
  "started_at": "2026-04-20T10:00:00Z",
  "user_id": "usr_123",
  "user_email": "user@example.com",
  "tags": ["production", "sales"],
  "agent_version": "v2.1.0"
}
// Response 201
{ "session_id": "uuid" }
```

### Send spans (LLM calls, tool calls, retrievals)
```
POST /ingest/spans
```
```json
{
  "session_id": "uuid",
  "spans": [
    {
      "span_id": "uuid",
      "span_type": "llm",           // llm | tool | retrieval | agent | custom
      "name": "plan_step",
      "status": "ok",               // ok | error | timeout
      "started_at": "2026-04-20T10:00:01Z",
      "model": "claude-sonnet-4-6",
      "input_tokens": 512,
      "output_tokens": 128,
      "input_text": "...",
      "output_text": "...",
      "duration_ms": 1840
    }
  ]
}
// Response 202
{ "accepted": 1 }
```

### End a session
```
POST /ingest/session/end
```
```json
{
  "session_id": "uuid",
  "status": "completed",        // completed | failed
  "ended_at": "2026-04-20T10:02:30Z",
  "error_message": null,
  "error_type": null
}
// Response 200
{ "ok": true, "issues_detected": 0 }
```

`issues_detected` is the number of behavioral issues Dottle automatically found in this session.

---

## Pricing

| Plan | Price | Sessions / month | Retention | Features |
|---|---|---|---|---|
| **Hobby** | Free | 10,000 | 7 days | 1 project, basic dashboard |
| **Pro** | $29/mo | 100,000 | 90 days | 3 projects, email alerts, export |
| **Team** | $99/mo | 1,000,000 | 1 year | 10 projects, Slack alerts, AI Diagnosis, Code Fixes, regression detection |
| **Enterprise** | Custom | Unlimited | Custom | Self-host, SSO, SLA, dedicated support |

All plans include: automatic issue detection, cost tracking, trace timeline, session filtering.

---

## Coming Soon

These are in active development, in order of priority:

| Feature | What it does | ETA |
|---|---|---|
| **Live calls feed** | Dedicated "Active Now" dashboard view — all in-progress sessions in real time, with span count and duration updating live | Q2 2026 |
| **Mid-session alerts** | Fire a Slack alert while the session is still running — before the user hangs up | Q2 2026 |
| **Monthly budget caps** | Set a monthly spend limit — get an alert (or auto-pause) when you hit it | Q2 2026 |
| **Conversation transcript view** | Show LLM input/output as a readable conversation thread, not raw spans — easier for non-engineers | Q2 2026 |
| **Eval runs** | Define a test set of inputs, run them against two agent versions, compare outputs side by side | Q3 2026 |
| **Output quality scoring** | Attach a numeric eval score to any session — filter and sort by quality | Q3 2026 |
| **Remote session termination** | Kill a looping session from the dashboard — sends a signal your agent SDK can listen to | Q3 2026 |
| **Webhook push** | Push session-end events to your own systems (SIEM, S3, Datadog) | Q3 2026 |
| **Python SDK on PyPI** | `pip install dottle` — no need to copy the file | Q2 2026 |
| **npm package** | `npm install dottle` (public release) | Q2 2026 |

---

## How We Compare

| Feature | Dottle | LangSmith | Langfuse | Helicone |
|---|---|---|---|---|
| Framework-agnostic | ✅ | ❌ LangChain only | ✅ | ✅ |
| Python SDK | ✅ | ✅ | ✅ | ✅ |
| JavaScript SDK | ✅ | ❌ | ✅ | ❌ |
| Loop detection | ✅ automatic | ❌ | ❌ | ❌ |
| 10+ behavioral detectors | ✅ | ❌ | ❌ | ❌ |
| AI Diagnosis Chat | ✅ | ❌ | ❌ | ❌ |
| AI Code Fix + GitHub PR | ✅ | ❌ | ❌ | ❌ |
| Regression detection | ✅ | ⚠️ manual | ⚠️ manual | ❌ |
| Self-hostable | ✅ | ❌ | ✅ | ❌ |
| Voice AI ready | ✅ | ❌ | ❌ | ❌ |
| Zero proxy / no added latency | ✅ | ✅ | ✅ | ❌ proxy |
| Free plan | ✅ | ✅ | ✅ | ✅ |
| Starts at | $0 | $0 | $0 | $0 |
| Pro plan | $29/mo | $39/mo | $49/mo | $50/mo |

---

## Questions

**Does adding Dottle slow down my agent?**  
No. All HTTP calls run in background threads (Python) or async intervals (JavaScript). Your agent does not wait for Dottle. We've measured <5ms overhead per session.

**What if Dottle goes down?**  
Your agent keeps running normally. All `_post()` calls catch exceptions silently. Dottle never affects your agent's execution path.

**Do you store my prompts?**  
Only if you pass `input_text` / `output_text` in your spans. If you don't send them, they're not stored. You can also enable `redact_pii=True` to strip sensitive data before it leaves your system.

**Can I self-host?**  
Yes. Full Docker Compose deployment. Everything — backend, database, frontend — runs on your own infrastructure. Your data never leaves your network. Enterprise plan includes self-host support.

**Which LLM providers are supported?**  
All of them — Dottle works at the span level, not the provider level. You call OpenAI, Anthropic, Gemini, Mistral, or any local model directly. Dottle just observes. Cost calculation is supported for 20+ models; for others, you can pass cost manually.

**Do I need to install anything?**  
For Python: just copy `dottle.py` into your project — no pip install needed (requires only `requests`, which is almost always already present). For JavaScript: `npm install dottle`.

---

## Get Started

1. Sign up at [app.dottle.dev](https://app.dottle.dev)
2. Create an organization and a project
3. Copy your `dtl_live_...` API key from Settings
4. Add `dottle.py` to your agent (see integration section above)
5. Run your agent — see the trace appear in [Sessions](https://app.dottle.dev/sessions)

**Questions?** Email [support@dottle.dev](mailto:support@dottle.dev)
