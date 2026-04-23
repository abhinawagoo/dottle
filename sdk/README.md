# Dottle SDK

**Monitor your AI agents in minutes.** See every LLM call, tool use, cost, latency, and failure — in real time.

[dottle.dev](https://dottle.dev) · [Dashboard](https://app.dottle.dev) · [Docs](https://dottle.dev/docs)

---

## Install

```bash
pip install dottle-sdk
```

## Quickstart

```python
import dottle

# 1. Configure once at startup
dottle.configure(api_key="dtl_live_...")

# 2. Wrap your agent run in a session
with dottle.session("my-agent", user_id="user_123") as sid:

    # 3. Track each LLM call as a span
    with dottle.span("llm", "gpt-4o reply") as s:
        response = openai_client.chat.completions.create(...)
        s.record_tokens(
            prompt_tokens=response.usage.prompt_tokens,
            completion_tokens=response.usage.completion_tokens,
            model="gpt-4o",
        )
```

That's it. Open [app.dottle.dev](https://app.dottle.dev) to see your agent's sessions, costs, and errors live.

---

## Get your API key

1. Sign up at [app.dottle.dev](https://app.dottle.dev)
2. Create an organization → create a project
3. Copy the `dtl_live_...` key from Project Settings

---

## What gets tracked

| Signal | How |
|---|---|
| LLM calls | `dottle.span("llm", ...)` + `s.record_tokens(...)` |
| Tool calls | `dottle.span("tool", ...)` |
| Errors | `s.record_error(exc)` or automatic on exception |
| Cost | Calculated from token counts + model |
| Latency | Automatic (start/end of each span) |
| User | Pass `user_id` / `user_email` to `dottle.session()` |

---

## Full example with Anthropic

```python
import anthropic
import dottle

dottle.configure(api_key="dtl_live_...")
client = anthropic.Anthropic()

def run_agent(user_message: str, user_email: str):
    with dottle.session("support-agent", user_email=user_email) as sid:
        with dottle.span("llm", "claude-3-5-sonnet") as s:
            response = client.messages.create(
                model="claude-3-5-sonnet-20241022",
                max_tokens=1024,
                messages=[{"role": "user", "content": user_message}],
            )
            s.record_tokens(
                prompt_tokens=response.usage.input_tokens,
                completion_tokens=response.usage.output_tokens,
                model="claude-3-5-sonnet-20241022",
            )
        return response.content[0].text
```

---

## LangChain integration

Zero-code-change tracking for LangChain chains, agents, and LangGraph — attach one callback handler and every LLM call and tool use is automatically recorded.

```python
from langchain_openai import ChatOpenAI
from langchain.agents import AgentExecutor
from dottle.integrations.langchain import DottleCallbackHandler
import dottle

dottle.configure(api_key="dtl_live_...")
handler = DottleCallbackHandler()

llm = ChatOpenAI(model="gpt-4o", callbacks=[handler])
agent_executor = AgentExecutor(agent=agent, tools=tools, callbacks=[handler])

with dottle.session("my-langchain-agent", user_id="user_123") as sid:
    result = agent_executor.invoke({"input": "What is the weather in Tokyo?"})
```

**What gets tracked automatically:** model name, input/output text, token counts, cost, latency, tool call inputs/outputs, errors, and loop detection.

Works with: ChatOpenAI, ChatAnthropic, ChatGoogleGenerativeAI, all LangChain tools, LCEL chains, LangGraph nodes.

→ [Full LangChain integration guide](https://dottle.dev/docs/langchain)

---

## Zero performance impact

All calls are fire-and-forget (background thread). Your agent never waits for Dottle. If Dottle is unreachable, your agent keeps running — monitoring failures are silently swallowed.

---

## License

MIT
