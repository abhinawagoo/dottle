# JavaScript / TypeScript SDK

Works in **Node.js**, **Next.js**, **Express**, **Remix**, or any JS runtime with `fetch` (Node 18+).

> The Python SDK and JavaScript SDK send data to the **same backend and dashboard** —
> you see all your agents together regardless of which language they're written in.

---

## Install

```bash
# From the dottle repo
npm install ../sdk-js        # local

# Once published to npm:
npm install dottle
```

---

## Setup — configure once at startup

```ts
import dottle from "dottle";

dottle.configure({
  apiKey:  "dtl_live_xxxxxxxx",              // from Settings → your project
  apiUrl:  "http://localhost:8000/api/v1",   // your Dottle backend URL
  debug:   false,                            // true → logs every flush
});
```

In **Next.js** put this in a file that runs once (e.g. `lib/dottle.ts`) and import it in your API route / server action.

---

## Usage

### Pattern 1 — `session` + `span` callbacks (recommended)

Mirrors the Python context-manager style. Wrap your agent entry point in `session()`, and each operation in `span()`.

```ts
import dottle from "dottle";

const answer = await dottle.session("research-agent", async () => {

  // Track an LLM call
  const plan = await dottle.span("llm", "gpt-4o plan step", async (s) => {
    const res = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Plan a research task" }],
    });
    s.recordTokens(
      res.usage.prompt_tokens,
      res.usage.completion_tokens,
      "gpt-4o"
    );
    return res.choices[0].message.content;
  });

  // Track a tool call
  const results = await dottle.span("tool", "search_web", async (s) => {
    const data = await searchWeb(plan);
    s.setAttribute("result_count", data.length);
    return data;
  });

  // Track a retrieval (RAG, vector DB)
  const docs = await dottle.span("retrieval", "pinecone_query", async () => {
    return vectordb.query(embedding);
  });

  return synthesize(results, docs);
});
```

### Pattern 2 — `wrapLlm` / `wrapTool` helpers (zero boilerplate)

Wrap your existing functions once — they track automatically on every call.

```ts
import dottle from "dottle";

// Define your tracked functions
const callGPT = dottle.wrapLlm("gpt-4o", async (prompt: string) => {
  const res = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
  });
  return {
    content:      res.choices[0].message.content,
    inputTokens:  res.usage.prompt_tokens,      // required
    outputTokens: res.usage.completion_tokens,  // required
  };
});

const searchWeb = dottle.wrapTool("search_web", async (query: string) => {
  return fetch(`https://api.search.com?q=${query}`).then(r => r.json());
});

// Use them normally — tracking is automatic
await dottle.session("my-agent", async () => {
  const plan   = await callGPT("Plan a research task");
  const data   = await searchWeb(plan.content);
  const answer = await callGPT(`Synthesize: ${JSON.stringify(data)}`);
  return answer.content;
});
```

### Pattern 3 — Nested spans (sub-agents)

Spans can be nested — they automatically build a parent–child tree in the trace timeline.

```ts
await dottle.session("orchestrator", async () => {

  await dottle.span("agent", "research-sub-agent", async () => {
    // nested spans become children of "research-sub-agent"
    await dottle.span("llm",  "search query generation", async (s) => { ... });
    await dottle.span("tool", "web_search",              async (s) => { ... });
  });

  await dottle.span("agent", "writer-sub-agent", async () => {
    await dottle.span("llm", "draft generation", async (s) => { ... });
  });

});
```

---

## Next.js — API route example

```ts
// app/api/chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import dottle from "dottle";
import OpenAI from "openai";

// Configure once (module-level, runs on first import)
dottle.configure({
  apiKey:  process.env.AGENTLOOP_API_KEY!,
  apiUrl:  process.env.AGENTLOOP_API_URL ?? "http://localhost:8000/api/v1",
});

const openai = new OpenAI();

export async function POST(req: NextRequest) {
  const { message } = await req.json();

  const answer = await dottle.session("chat-agent", async () => {
    return dottle.span("llm", "gpt-4o response", async (s) => {
      const res = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: message }],
      });
      s.recordTokens(
        res.usage!.prompt_tokens,
        res.usage!.completion_tokens,
        "gpt-4o"
      );
      return res.choices[0].message.content;
    });
  });

  return NextResponse.json({ answer });
}
```

Add to `.env.local`:
```
AGENTLOOP_API_KEY=dtl_live_xxxxxxxx
AGENTLOOP_API_URL=http://localhost:8000/api/v1
```

---

## Express — middleware example

```ts
// src/dottle.ts — configure once
import dottle from "dottle";
dottle.configure({
  apiKey:  process.env.AGENTLOOP_API_KEY!,
  apiUrl:  process.env.AGENTLOOP_API_URL!,
});
export default dottle;

// src/routes/agent.ts
import express from "express";
import dottle from "../dottle";

const router = express.Router();

router.post("/run", async (req, res) => {
  const { query } = req.body;

  const result = await dottle.session("express-agent", async () => {
    return dottle.span("llm", "claude call", async (s) => {
      const response = await anthropic.messages.create({ ... });
      s.recordTokens(response.usage.input_tokens, response.usage.output_tokens, "claude-3-5-sonnet");
      return response.content[0].text;
    });
  });

  res.json({ result });
});
```

---

## Recording errors

Any uncaught exception inside `session()` or `span()` is **automatically** recorded as an error. To record errors manually:

```ts
await dottle.span("tool", "send_email", async (s) => {
  try {
    await sendEmail(to, body);
  } catch (err) {
    s.setError((err as Error).message, (err as Error).constructor.name);
    throw err;  // re-throw so the session also marks as failed
  }
});
```

---

## SDK reference

```ts
dottle.configure(config)

// config shape:
{
  apiKey:          string   // required — from Settings page
  apiUrl:          string   // required — your backend URL
  debug?:          boolean  // default false — log flushes to console
  disabled?:       boolean  // default false — set true to silence in tests
  flushIntervalMs?: number  // default 2000ms
  maxBatchSize?:   number   // default 100 spans per request
  timeoutMs?:      number   // default 5000ms HTTP timeout
}

// Span types
"llm"        → green  in trace timeline
"tool"       → amber
"retrieval"  → teal
"agent"      → blue  (sub-agent calls)
"custom"     → purple

// SpanContext methods (inside span callback)
s.recordTokens(inputTokens, outputTokens, model)
s.setError(message, errorType?)
s.setAttribute(key, value)

// Graceful shutdown — call before process.exit() if needed
await dottle.shutdown()
```

---

## Smoke test

No real LLM needed — paste and run:

```ts
import dottle from "dottle";

dottle.configure({
  apiKey:  "dtl_live_xxxxxxxx",
  apiUrl:  "http://localhost:8000/api/v1",
  debug:   true,
});

await dottle.session("js-smoke-test", async () => {

  await dottle.span("llm", "fake-gpt-call", async (s) => {
    await new Promise(r => setTimeout(r, 100));
    s.recordTokens(200, 80, "gpt-4o");
  });

  await dottle.span("tool", "fake-search", async () => {
    await new Promise(r => setTimeout(r, 50));
  });

});

console.log("Done — check http://localhost:3000/sessions");
await dottle.shutdown();
```

---

## Works locally, no deployment needed

Your agent code and the Dottle stack are both on the same machine:

```
Your machine
├── Dottle stack  (Docker → localhost:8000)
└── Your Node.js app (calls localhost:8000)  ✓
```

When you're ready to go live, change `apiUrl` to your deployed backend URL — nothing else changes.
