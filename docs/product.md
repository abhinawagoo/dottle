# Agentloop — Product & Business Document

> Last updated: April 2026
> Use this document for: marketing copy, sales decks, investor conversations, landing pages, cold outreach, pricing decisions.

---

## One-line pitch

**Agentloop is Sentry for AI agents — instrument in 3 lines of code, see every LLM call, tool execution, cost, and failure in real time, and get AI-powered code fixes when things break.**

---

## The problem we solve

AI agents are being deployed into production at scale. But unlike normal software, when an AI agent breaks or misbehaves, there's no stack trace. You get:

- "The agent gave a wrong answer" — but which LLM call? Which prompt? Which tool failed?
- "It's costing too much" — but which session? Which model? Which scenario?
- "It's stuck in a loop" — nobody knows until a user complains or hangs up
- "It was slow today" — but you have no latency data to compare
- "My voice AI is struggling on calls" — but you only find out reviewing recordings hours later

**Real example:** A team running voice AI for pest control and property management is handling hundreds of customer calls per day with zero visibility. They're literally listening to random call recordings hoping to catch problems. A frustrated customer hangs up before help arrives. There was no way to know the AI was struggling until it was too late.

**This is the exact problem Sentry solved for normal software in 2010. Agentloop solves it for AI agents in 2026.**

---

## What we built

Agentloop is an AI agent observability and debugging platform with four layers:

**1. Observe** — Real-time tracing of every LLM call, tool execution, retrieval, and custom span  
**2. Detect** — Automatic detection of 10+ behavioral issues (loops, failures, high cost, tool storms, etc.)  
**3. Diagnose** — AI-powered session analysis — ask Claude why a session failed, with full span context  
**4. Fix** — AI code fix generation + GitHub PR creation for detected issues

---

## Current feature set (v0.2 — April 2026)

### Backend API
- [x] Project + organization management with role-based access (owner/admin/member)
- [x] Session ingest (start, end, status, user attribution, tags, agent versioning)
- [x] Span ingest (LLM, tool, retrieval, agent, custom) with prompt/response logging
- [x] Automatic cost calculation (GPT-4o, Claude, Gemini, 20+ models)
- [x] Server-side loop detection (input hashing, repeated tool call detection)
- [x] **10 behavioral issue detectors** running automatically on every session end
- [x] Metrics API (summary, cost-over-time, tool failure rates, latency percentiles P50/P75/P95/P99)
- [x] **Regression detection** — compare version A vs B or time window A vs B
- [x] Alerts system (CRUD rules + worker, Slack + email delivery)
- [x] Sessions query API (list, filter by status/agent/user/tag/version, detail with full spans)
- [x] Session export (CSV / JSON, up to 5000 rows)
- [x] Session fixtures — generate deterministic test files (Python pytest, TypeScript vitest) from recorded sessions
- [x] **Issues Board** — aggregate behavioral signals across all sessions, grouped by type + severity
- [x] **Code Integration** — GitHub repo connect, AI code fix generation (Claude claude-sonnet-4-6), PR creation
- [x] **AI Session Diagnosis** — streaming Claude chat with full span context on every session

### SDK — Python
- [x] `agentloop.configure()` with `redact_pii=True` option
- [x] `agentloop.session()` — context manager with user attribution, tags, agent versioning
- [x] `agentloop.span()` — track any operation with prompt/response logging
- [x] `@agentloop.task`, `@agentloop.llm_call`, `@agentloop.tool_call` decorators
- [x] Background flush thread (non-blocking)
- [x] Client-side loop detection
- [x] Async agent support
- [x] PII redaction (email, phone, credit card, SSN, IP, API keys, Bearer tokens)

### SDK — JavaScript / TypeScript
- [x] `agentloop.configure()` — one-time setup
- [x] `agentloop.session()` — async callback with full session options
- [x] `agentloop.span()` with prompt/response recording
- [x] `wrapOpenAI(client)` — zero-friction OpenAI wrapper, auto-captures model/tokens/cost/prompts
- [x] `wrapAnthropic(client)` — zero-friction Anthropic wrapper
- [x] `@agentloop.tool_call` decorator — auto-track tool errors
- [x] **Concurrent session isolation** via AsyncLocalStorage (multiple parallel agent calls safe)
- [x] Background flush interval
- [x] PII redaction
- [x] Zero npm dependencies (native fetch + AsyncLocalStorage)
- [x] Works in Node.js, Next.js, Express, Remix, Bun

### Dashboard (Next.js)
- [x] **Dashboard** — cost, latency, error rate, loop rate + recent sessions table
- [x] **Sessions list** — full filter panel (status, agent, user, tag, version, date range), export CSV/JSON
- [x] **Session detail** — waterfall trace timeline + expandable span rows with prompt/response viewer
- [x] **AI Diagnosis chat** — ask Claude about any session, streaming response with full span context
- [x] **Metrics** — cost-over-time chart, tool failure rates chart, latency percentiles chart, regression detection table
- [x] **Alerts** — create/manage rules, view fired alert history
- [x] **Issues Board** — aggregated behavioral signals, severity-filtered cards, drill-down to affected sessions
- [x] **Code Fix** — AI-powered code fix with diff viewer + GitHub PR creation
- [x] **Settings** — org management, team invites, project CRUD, GitHub integration, API keys

---

## Voice AI use case (high-priority vertical)

> "Running voice AI for pest control and property management — handling real customer calls but flying blind. Need to know when the AI is struggling before the customer hangs up."

### How Agentloop solves this today

Each phone call maps perfectly to an Agentloop session:

```python
import agentloop

agentloop.configure(api_key="alp_live_...")

# Each call = one session
with agentloop.session(
    "pest-control-voice-agent",
    user_id=caller_phone_number,          # track by caller
    tags=["inbound", "pest_control"],     # scenario tagging
    agent_version="v2.1.0",              # track prompt versions
) as sid:

    with agentloop.span("tool", "speech_to_text") as s:
        transcript = transcribe(audio_chunk)
        s.record_output(transcript)

    with agentloop.span("llm", "response_generation") as s:
        response = llm.chat(transcript)
        s.record_tokens(usage.input, usage.output, "gpt-4o")
        s.record_prompt(transcript, response.text)

    with agentloop.span("tool", "lookup_customer") as s:
        customer = crm.find(caller_phone_number)

    with agentloop.span("tool", "schedule_appointment") as s:
        booking = calendar.book(customer, slot)
```

### What you get immediately

| Pain point | How Agentloop solves it |
|---|---|
| "Flying blind on live calls" | Sessions list shows every call in real-time as it happens. Session detail has live span polling (2s refresh) while the call is active |
| "AI struggling before hangup" | Auto-detected issues: `high_latency` (slow responses), `repeated_tool_error` (tool failing repeatedly), `session_failed` (call crashed). Alerts fire within 60s |
| "Which prompts cause problems" | Filter Sessions by `tag=pest_control` + `status=failed`. View exact prompt/response for each failed LLM call. Issues Board shows which issue types are most common |
| "Spot patterns across hundreds of calls" | Issues Board aggregates all signals. Metrics page shows failure rate, latency trends. Regression detection compares this week vs last week |
| "Random recording review" | AI Diagnosis Chat — open any call session, ask "Why did this call fail?" Claude reads all spans and gives a specific answer |

### What's being added for voice AI specifically
- [ ] **Live calls dashboard widget** — dedicated "Active Now" view showing in-progress sessions with real-time span count, duration, and alert status
- [ ] **Voice-specific issue detectors** — "call abandoned early" (< 30s duration, non-completed), "repeated clarification" (AI said "I don't understand" 3+ times), "escalation pattern" (tool called `transfer_to_human`)
- [ ] **Conversation transcript view** — show LLM input/output as a proper conversation thread (not raw spans), easier to read for non-engineers reviewing calls

---

## Who we sell to

### Ideal Customer Profile (ICP)

**Primary — AI developers and small teams (2–15 engineers)**
- Building AI agents, voice bots, chatbots, or LLM-powered automations
- Currently have zero visibility into what their agents do in production
- First signal: "why did the agent do that?" support tickets or customer complaints
- Budget: $20–$100/month

**High-value vertical: Voice AI operators**
- Running AI voice agents for customer calls (support, sales, scheduling, triage)
- Need real-time visibility, not post-hoc recording review
- Stakes are high: a struggling AI on a live call costs a customer, not just a ticket
- Exact example: pest control, property management, healthcare scheduling, legal intake, home services
- Budget: $99–$499/month (calls are revenue, monitoring ROI is immediate)

**Secondary — AI-first startups**
- 1+ agents in production with real users
- Cost and reliability are business-critical
- Budget: $100–$500/month

**Tertiary — Enterprise teams adopting AI**
- Internal AI tools (document Q&A, code assistants, data analysis agents)
- Compliance and audit requirements
- Budget: $500–$5,000/month

### Where they are
- Twitter/X (AI developer community)
- Hacker News (Show HN launches are huge for dev tools)
- Reddit: r/MachineLearning, r/LocalLLaMA, r/artificial
- Discord: LangChain, Anthropic, OpenAI developer communities
- Voice AI specific: Bland.ai, Vapi, Retell AI communities
- LinkedIn (B2B voice AI operators)
- AI newsletters: The Rundown AI, TLDR AI

---

## Market size

### Total Addressable Market (TAM)
**AI application development market: ~$150 billion by 2030**

- 4.4 million developers globally building with LLM APIs (2025)
- Every Fortune 500 company building internal AI tools
- Voice AI market alone: $50B+ by 2030 (Gartner)

### Serviceable Addressable Market (SAM)
**Developers + operators running production AI agents who need observability: ~500,000**

### Serviceable Obtainable Market (SOM) — Year 1
**5,000 paying customers × $50/month average = $3M ARR**

---

## Competitive landscape

| Product | What they do | Weakness vs us |
|---|---|---|
| **LangSmith** | LLM observability by LangChain | LangChain-only. No JS SDK. No code fixes |
| **Langfuse** | Open source LLM tracing | No agent-specific features, no loop detection, no code fixes |
| **Helicone** | Proxy-based LLM logging | Proxy adds latency. No timeline view. Python-only |
| **Traceloop** | OpenTelemetry-based tracing | Complex setup. Not AI-specific |
| **HoneyHive** | LLM evaluation | Eval-focused, not real-time monitoring |
| **Arize AI** | ML observability | $500+/month enterprise-only |

### Our differentiation

**1. Framework-agnostic** — Works with raw OpenAI/Anthropic API, LangChain, CrewAI, AutoGen, voice frameworks  
**2. Multi-language** — Python + JavaScript/TypeScript. Most competitors are Python-only  
**3. Automatic issue detection** — 10 behavioral detectors (loops, tool storms, excessive tokens, etc.) run automatically  
**4. AI-powered debugging** — Chat with Claude about any failing session. No other tool does this  
**5. AI code fixes** — Generate a code patch + open a GitHub PR from any detected issue. Unique in the market  
**6. Voice AI ready** — Session model maps perfectly to phone calls. User attribution by phone number. Real-time call monitoring  
**7. Self-hostable** — Full Docker Compose. Compliance-friendly  
**8. Regression detection** — Auto-compare version A vs B or week-over-week. Catches prompt regressions before users do  

---

## Pricing strategy

| Plan | Price | For | Limits |
|---|---|---|---|
| **Hobby** | Free | Solo developers, side projects | 1 project, 10K sessions/month, 7-day retention |
| **Pro** | $29/month | Developers and small startups | 3 projects, 100K sessions/month, 90-day retention, email alerts |
| **Team** | $99/month | Teams of 2–10, voice AI operators | 10 projects, 1M sessions/month, 1-year retention, Slack alerts, AI diagnosis, code fixes |
| **Enterprise** | Custom | Large teams, compliance needs, high-volume voice | Unlimited, self-host support, SSO, SLA, dedicated support |

---

## Go-to-market

### Phase 1 — Community (now)
1. Open source the SDK — MIT license, GitHub stars drive discovery
2. Show HN — "Show HN: I built Sentry for AI agents"
3. Twitter/X demos — show real session traces, real cost savings
4. Voice AI communities — Bland.ai, Vapi, Retell users are exactly our ICP

### Phase 2 — Growth (first customers)
1. Cold outreach to voice AI operators (pest control, property management, healthcare)
2. "How to monitor your Bland.ai agent" tutorials
3. "Agentloop vs LangSmith" comparison content (high-intent SEO)
4. Framework integrations: LangChain, CrewAI, AutoGen official guides

### Phase 3 — Scale (after $10K MRR)
1. Product-led growth — free tier users share traces → teammates sign up
2. Session sharing links — "here's what my agent did" drives organic discovery
3. Enterprise sales — inbound from compliance teams
4. Partnerships — Bland.ai, Vapi, Retell AI official integrations

---

## The vision

**Short term (year 1):** The go-to observability tool for AI agent and voice AI developers. Known for being the only tool that not only shows you what broke but helps you fix it.

**Medium term (year 2–3):** The Datadog of AI — the platform every AI team runs in production. Eval scoring, A/B agent testing, automatic regression alerting, team-level analytics.

**Long term:** As AI agents become the primary way software gets written and run, Agentloop becomes infrastructure — as essential as logs, metrics, and traces are for traditional software today. Every agent deployment in every language runs through Agentloop.

---

## Key metrics to track

| Metric | Target (Month 6) | Target (Month 12) |
|---|---|---|
| GitHub stars | 500 | 2,000 |
| Registered projects | 200 | 1,000 |
| Active monthly projects | 50 | 300 |
| Paying customers | 10 | 100 |
| MRR | $290 | $5,000 |
| Sessions ingested/day | 10K | 500K |
