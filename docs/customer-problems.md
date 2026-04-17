# Real Customer Problems — Agentloop

> This file tracks actual problems real people are facing with AI agents in production.
> Use it to guide product decisions, marketing copy, and what to build next.
> Format: problem as the customer said it → can we solve it → how → what's missing.

---

## How to read this file

| Tag | Meaning |
|---|---|
| ✅ Solved | We handle this today, end to end |
| ⚠️ Partial | We partially address it — something is still missing |
| ❌ Not solved | We cannot address this today |

---

## Problem #1 — Voice AI operator, pest control + property management

> *"Running voice AI for pest control and property management and honestly flying blind right now. We're handling real customer calls but I have no idea what's actually happening unless someone complains."*

**Who:** Small business operator running AI voice agents to handle inbound customer calls. Not an engineer — or has a small team. Volume: hundreds of calls per day.

**Specific pains they described:**

### 1a. "See calls as they're happening (not reviewing recordings later)"
- ⚠️ **Partial.** Sessions list shows every active call with `running` status and a live badge. Session detail polls every 2s while the call is live — you can watch spans come in as they happen. **What's missing:** no dedicated "Live Now" view on the dashboard. You have to know to go look. There's no screen that shows you all currently active calls at once.

### 1b. "Know when the AI is struggling before the customer hangs up"
- ❌ **Not solved.** We detect issues *after* the call ends — loops, failures, high latency, tool errors. Alerts fire within 60 seconds of call end. But if a customer is about to hang up because the AI can't understand them, we have no way to surface that in real time while the call is still active. **What's needed:** mid-session issue detection (live span analysis), real-time alert push (WebSocket or push notification), not just post-session.

### 1c. "Track which prompts/scenarios are causing problems"
- ✅ **Solved** — with setup. Tag sessions with scenario type (`tags=["pest_identification", "scheduling", "billing"]`). Filter Sessions list by tag + status = failed. Issues Board shows which issue types are most common across all calls. AI Chat on any session shows exact prompt/response for each LLM turn. **Friction:** the operator has to add tags in their SDK integration — it's not automatic.

### 1d. "Spot patterns across hundreds of calls"
- ✅ **Solved.** Issues Board aggregates behavioral signals across all sessions — shows `session_failed: 47 occurrences, 31 sessions, last seen 2h ago`. Metrics page shows failure rate and latency trends over time. Regression detection compares this week vs last week automatically.

### 1e. "Listening to random call recordings hoping to catch issues"
- ✅ **Solved.** AI Diagnosis Chat — open any session, click "Ask AI", ask "why did this call fail?" Claude reads every span, tool call, and prompt/response and gives a specific answer. No recording review needed.

**Overall verdict for this customer:** We solve the after-the-fact analysis problem well. The real-time "call is going badly right now" problem is unsolved. That's the highest-stakes gap for this persona.

---

## Problem #2 — "My agent cost $400 this month and I don't know why"

> Actual complaint pattern seen across AI developers on Twitter/X and Reddit. Happens when agents run at scale without cost visibility.

**Who:** Developer or small startup, agents running in production with real traffic.

**Specific pains:**
- No breakdown of which agent, which session, which model consumed what
- No alerts when a single session costs an unusually high amount
- No monthly budget cap — the bill just arrives

### 2a. "Which session cost the most?"
- ✅ **Solved.** Sessions list shows cost per session, sortable. Session detail shows cost per span and per model.

### 2b. "Which model is responsible?"
- ✅ **Solved.** Session detail shows model per LLM span. Metrics → Tool Breakdown shows cost aggregated. AI Issues detects `high_cost` sessions automatically (> $1 per session).

### 2c. "Alert me before I hit $X this month"
- ⚠️ **Partial.** Alert rules exist for cost per session (trigger when `cost_per_session > $0.50`). **What's missing:** monthly budget cap with automatic disable or alert. No cumulative spend tracking — only per-session thresholds.

### 2d. "Which agent version made costs go up?"
- ✅ **Solved.** Regression detection compares version A vs B on avg cost per session. Tag sessions with `agent_version` and run a comparison.

---

## Problem #3 — "Users are complaining the agent loops forever"

> Classic agent reliability problem. Agent gets stuck, calls the same tool repeatedly, user is waiting.

**Who:** Any developer with an autonomous tool-using agent in production.

**Specific pains:**
- Loop isn't discovered until user complains or abandons
- Can't tell which tool or prompt causes the loop
- No way to force-stop a looping session from outside

### 3a. "I didn't know it was looping until the user complained"
- ✅ **Solved.** Loop is detected server-side (repeated tool call with same args, or iteration count exceeded). Session is marked `looping`. Issues Board shows all loop occurrences. Alert rule can fire on `loop_detected` metric.

### 3b. "Why did it loop? Which tool? Which prompt?"
- ✅ **Solved.** Session detail shows full span trace — you can see the repeated tool calls. AI Diagnosis Chat: ask "what caused the loop?" Claude identifies the pattern.

### 3c. "I want to kill the looping session from the dashboard"
- ❌ **Not solved.** No way to remotely terminate a running session from the UI. The agent keeps running on the user's infrastructure. **What's needed:** a session termination signal (webhook/flag the SDK polls).

---

## Problem #4 — "I have no idea what prompt caused that bad output"

> The prompt debugging problem. Agent said something wrong or unhelpful — developer needs to trace it back to the exact LLM call and prompt.

**Who:** Any developer where AI output quality matters (customer-facing agents, content generation, code generation).

**Specific pains:**
- LLM call happened and was logged somewhere but prompt isn't stored
- Can't reproduce the bad output without knowing the exact input
- No link from user complaint → session → span → prompt

### 4a. "What prompt did the agent use for this call?"
- ✅ **Solved.** Session detail shows every LLM span with full prompt (input_text) and response (output_text) visible inline. SDK's `wrapOpenAI()` and `wrapAnthropic()` capture this automatically.

### 4b. "Reproduce the exact session deterministically for testing"
- ✅ **Solved.** Session Fixtures — one click generates a Python pytest or TypeScript vitest file that mocks all LLM calls with the recorded outputs from that session.

### 4c. "Which of my 10,000 sessions had bad output?"
- ⚠️ **Partial.** You can filter sessions by status = failed. AI Issues flags sessions with `no_llm_output`. **What's missing:** no output quality scoring. Can't filter sessions by "LLM gave a bad answer" without an external eval score. **What's needed:** eval score attachment (custom numeric score per session), filterable.

---

## Problem #5 — "My agent worked fine last week, something broke after my prompt change"

> Regression detection. Developer updates a prompt, deploys, and performance silently degrades.

**Who:** Developer iterating on agent prompts or model versions.

**Specific pains:**
- No baseline to compare against
- Would take days of session review to notice a regression
- Can't A/B test prompts systematically

### 5a. "Compare this week vs last week automatically"
- ✅ **Solved.** Regression detection (time window mode) runs on the Metrics page — compares last 7 days vs prior 7 days on failure rate, loop rate, cost, and latency automatically.

### 5b. "Compare prompt v1 vs prompt v2"
- ✅ **Solved.** Tag sessions with `agent_version`. Regression detection (version mode) compares version A vs B on all core metrics.

### 5c. "Run a test set against both versions before deploying"
- ❌ **Not solved.** No evaluation run feature — no way to define a test set of inputs and run both versions against them in batch. **What's needed:** Eval Runs feature (define prompts, run against agent, compare outputs).

---

## Problem #6 — "We need logs of what the AI did for compliance / audit"

> Enterprise compliance use case. Legal, healthcare, financial services.

**Who:** Enterprise team deploying AI in regulated industries (HIPAA, SOC2, GDPR).

**Specific pains:**
- Need immutable record of every AI decision and what data it touched
- Need to prove the AI didn't expose PII
- Need to export logs to their own systems

### 6a. "Store a complete record of every agent run"
- ✅ **Solved.** Every session, span, prompt, and response is stored in the database. Session export downloads everything as CSV or JSON.

### 6b. "Make sure PII is not stored in our logs"
- ✅ **Solved.** PII redaction is built into both SDKs — `configure(redact_pii=True)` automatically strips emails, phone numbers, credit cards, SSNs, IPs, and API keys from all recorded prompts and responses.

### 6c. "Push our agent logs to our own SIEM or data warehouse"
- ⚠️ **Partial.** CSV/JSON export exists. **What's missing:** webhook push for each session end event, native integrations with Splunk/Datadog/S3.

### 6d. "Self-host for data residency"
- ✅ **Solved.** Full Docker Compose deployment. Everything runs on the customer's own infrastructure. No data leaves their network.

---

## Problem #7 — "Building a coding agent / research agent and can't reproduce failures"

> Non-determinism problem. Agent produced a wrong answer or took a wrong action — can't reproduce it to fix it.

**Who:** Developer building autonomous agents (research, coding, data analysis).

### 7a. "Reproduce the exact session that failed"
- ✅ **Solved.** Session Fixtures generate a deterministic test file that replays all LLM calls with recorded outputs. The session becomes reproducible even though the underlying LLM is non-deterministic.

### 7b. "Understand why the agent took a wrong action"
- ✅ **Solved.** AI Diagnosis Chat — open the session, ask "why did the agent do X?" Claude reads every span and explains the decision chain.

### 7c. "Generate a fix for the bad behavior automatically"
- ✅ **Solved.** Code Fix feature — loads relevant source files from the connected GitHub repo, generates a code patch with Claude claude-sonnet-4-6, shows a diff, creates a PR.

---

## What we cannot solve today (honest gaps)

| Gap | Who it matters to | Effort to build |
|---|---|---|
| Real-time mid-session alerts (while call is active) | Voice AI operators | High — needs WebSocket push |
| Dedicated live calls feed on dashboard | Voice AI operators | Low |
| Remote session termination (kill a looping agent) | Any agent developer | Medium |
| Monthly budget caps with auto-disable | Cost-conscious developers | Medium |
| Eval runs (batch test prompts against agent versions) | Developers iterating on prompts | High |
| Output quality scoring (attach eval score to session) | Developers needing quality tracking | Medium |
| Webhook push per session event | Enterprise, compliance teams | Medium |
| Native SIEM/Datadog/S3 integration | Enterprise | Medium |
| Voice transcript view (conversation format) | Voice AI operators | Low |
| Scenario auto-detection from transcript (no manual tags) | Voice AI operators | High — needs LLM classification |

---

## What new customer problems to add here

If you hear a customer say something like:
- "I have no idea why..." → add it here
- "I wish I could see..." → add it here
- "We had an incident and couldn't figure out..." → add it here
- "We switched from X to Y because..." → add it here

Keep the customer's exact words. The raw quote is more valuable than a paraphrase.
