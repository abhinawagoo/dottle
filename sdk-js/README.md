# Dottle SDK for JavaScript / TypeScript

**Monitor your AI agents in minutes.** See every LLM call, tool use, cost, latency, and failure — in real time.

[dottle.dev](https://dottle.dev) · [Dashboard](https://app.dottle.dev) · [Docs](https://dottle.dev/docs)

---

## Install

```bash
npm install dottle-sdk
```

## Quickstart

```typescript
import dottle from "dottle-sdk";

// 1. Configure once at startup
dottle.configure({ apiKey: "dtl_live_..." });

// 2. Wrap your agent run in a session
await dottle.session("my-agent", async (sessionId) => {

  // 3. Track each LLM call as a span
  await dottle.span("llm", "gpt-4o reply", async (s) => {
    const res = await openai.chat.completions.create({ model: "gpt-4o", messages });
    s.recordTokens(res.usage.prompt_tokens, res.usage.completion_tokens, "gpt-4o");
  });

}, { userEmail: "alice@example.com", tags: ["prod"] });
```

Open [app.dottle.dev](https://app.dottle.dev) to see sessions, costs, and errors live.

---

## Get your API key

1. Sign up at [app.dottle.dev](https://app.dottle.dev)
2. Create an organization → create a project
3. Copy the `dtl_live_...` key from Project Settings

---

## Zero-friction — auto-instrument OpenAI or Anthropic

Wrap your client once and every call inside a `dottle.session()` is automatically traced:

```typescript
import OpenAI from "openai";
import dottle, { wrapOpenAI } from "dottle-sdk";

dottle.configure({ apiKey: "dtl_live_..." });

const openai = wrapOpenAI(new OpenAI({ apiKey: process.env.OPENAI_API_KEY }));

await dottle.session("support-agent", async () => {
  // All calls below are automatically traced — no span() needed
  const res = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: "Hello!" }],
  });
});
```

Works the same with Anthropic:

```typescript
import Anthropic from "@anthropic-ai/sdk";
import dottle, { wrapAnthropic } from "dottle-sdk";

dottle.configure({ apiKey: "dtl_live_..." });

const anthropic = wrapAnthropic(new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }));

await dottle.session("my-agent", async () => {
  const msg = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 1024,
    messages: [{ role: "user", content: "Hello!" }],
  });
});
```

---

## Prompt management

Version-control your prompts in the Dottle dashboard and fetch them at runtime — changes in the UI are live immediately (after the cache TTL).

```typescript
import dottle from "dottle-sdk";

dottle.configure({
  apiKey: process.env.DOTTLE_API_KEY!,
  projectId: process.env.DOTTLE_PROJECT_ID,  // or pass per-call
});

// Fetch active version (cached 60 s by default)
const prompt = await dottle.getPrompt("summarize-article");

// Compile {{variable}} placeholders → messages array
const messages = prompt.compile({ article: text, language: "English" });
// → [{ role: "system", content: "..." }, { role: "user", content: "..." }]

// Pass to any LLM client
const res = await openai.chat.completions.create({
  model: prompt.model,
  messages,
  ...prompt.parameters,   // temperature, max_tokens, etc.
});

// Or let Dottle call the model directly (auto-tracked as a span inside a session)
const result = await prompt.invoke({ article: text, language: "English" });
```

### Version pinning

```typescript
// Pin to a specific version
const v3 = await dottle.getPrompt("summarize-article", { version: 3 });

// Pin to a named label
const prod = await dottle.getPrompt("summarize-article", { label: "production" });
```

### Cache control

```typescript
// Custom TTL (default 60 s)
const prompt = await dottle.getPrompt("summarize-article", { ttl: 300 });

// Bypass cache
const fresh = await dottle.getPrompt("summarize-article", { ttl: 0 });

// Clear cache (useful in tests)
dottle.clearPromptCache();
```

### Auto-tracking inside a session

When `.invoke()` is called inside a `dottle.session()`, it automatically creates an LLM span with prompt name, version, token counts, and cost:

```typescript
await dottle.session("my-agent", async () => {
  const result = await prompt.invoke({ article: text });
  // Dashboard shows span "summarize-article v3" with tokens + cost
});
```

---

## What gets tracked

| Signal | How |
|---|---|
| LLM calls | `dottle.span("llm", ...)` + `s.recordTokens(...)` |
| Tool calls | `dottle.span("tool", ...)` |
| Errors | `s.setError(message)` or automatic on exception |
| Cost | Calculated from token counts + model |
| Latency | Automatic (start/end of each span) |
| User | Pass `userId` / `userEmail` to `dottle.session()` |

---

## Track tool calls

```typescript
await dottle.session("research-agent", async () => {
  await dottle.span("tool", "web_search", async (s) => {
    const results = await searchWeb("latest AI news");
    s.setAttribute("result_count", results.length);
    return results;
  });
});
```

---

## Configuration options

```typescript
dottle.configure({
  apiKey: "dtl_live_...",          // required
  projectId: "<uuid>",             // required for prompt management
  apiUrl: "https://...",           // optional — defaults to production
  debug: true,                     // log flush events to console
  disabled: false,                 // set true in tests to suppress all HTTP
  flushIntervalMs: 2000,           // how often to batch-send spans
  redactPii: true,                 // scrub emails, phones, cards from prompts
});
```

---

## Zero performance impact

All calls are fire-and-forget (batched every 2s, background timer). Your agent never waits for Dottle. If Dottle is unreachable, your agent keeps running.

---

## License

MIT
