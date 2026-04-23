# LangChain Integration

Auto-instrument any LangChain chain or agent with **zero code changes** to your existing logic. Every LLM call and tool invocation is automatically recorded as a Dottle span.

---

## Install

```bash
pip install dottle-sdk langchain-core
```

Works with LangChain 0.2+, LangChain 0.3+, and LangGraph.

---

## Basic setup

```python
import dottle
from dottle.integrations.langchain import DottleCallbackHandler

dottle.configure(api_key="dtl_live_...")

# Create one handler — pass it to your LLM and/or agent
handler = DottleCallbackHandler()
```

The handler must be used inside an active `dottle.session()` block. Outside a session it is a silent no-op, so it is safe to leave attached in production even if monitoring is disabled.

---

## Examples

### ChatOpenAI + AgentExecutor

```python
from langchain_openai import ChatOpenAI
from langchain.agents import AgentExecutor, create_openai_tools_agent
from langchain_core.prompts import ChatPromptTemplate
from dottle.integrations.langchain import DottleCallbackHandler
import dottle

dottle.configure(api_key="dtl_live_...")
handler = DottleCallbackHandler()

llm = ChatOpenAI(model="gpt-4o", callbacks=[handler])
prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a helpful assistant."),
    ("human", "{input}"),
    ("placeholder", "{agent_scratchpad}"),
])

agent = create_openai_tools_agent(llm, tools, prompt)
agent_executor = AgentExecutor(agent=agent, tools=tools, callbacks=[handler])

with dottle.session("research-agent", user_id="user_123") as sid:
    result = agent_executor.invoke({"input": "What is the weather in Tokyo?"})
```

Every LLM call, tool invocation, and error inside the `with` block is automatically recorded. Open the Dottle dashboard to see the full trace.

---

### Anthropic / Claude

```python
from langchain_anthropic import ChatAnthropic
from dottle.integrations.langchain import DottleCallbackHandler
import dottle

dottle.configure(api_key="dtl_live_...")
handler = DottleCallbackHandler()

llm = ChatAnthropic(model="claude-3-5-sonnet-20241022", callbacks=[handler])

with dottle.session("claude-agent") as sid:
    response = llm.invoke("Summarise the latest AI research.")
```

---

### Simple chain (LCEL)

```python
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from dottle.integrations.langchain import DottleCallbackHandler
import dottle

dottle.configure(api_key="dtl_live_...")
handler = DottleCallbackHandler()

chain = (
    ChatPromptTemplate.from_template("Answer this question: {question}")
    | ChatOpenAI(model="gpt-4o-mini", callbacks=[handler])
    | StrOutputParser()
)

with dottle.session("qa-chain") as sid:
    answer = chain.invoke({"question": "What is LangChain?"})
```

---

### LangGraph

Pass the handler in the `config` dict. Each node's LLM calls and tool calls are recorded as nested spans.

```python
from langgraph.graph import StateGraph, END
from langchain_openai import ChatOpenAI
from dottle.integrations.langchain import DottleCallbackHandler
import dottle

dottle.configure(api_key="dtl_live_...")
handler = DottleCallbackHandler()

llm = ChatOpenAI(model="gpt-4o", callbacks=[handler])

def research_node(state):
    response = llm.invoke(state["messages"])
    return {"messages": state["messages"] + [response]}

graph = StateGraph(...)
graph.add_node("research", research_node)
# ... build graph

app = graph.compile()

with dottle.session("langgraph-agent") as sid:
    result = app.invoke(
        {"messages": [("user", "Research climate change solutions")]},
        config={"callbacks": [handler]},  # also pass at invoke time for nodes
    )
```

---

### Async agents

The handler works identically in async contexts:

```python
with dottle.session("async-agent") as sid:
    result = await agent_executor.ainvoke({"input": "..."})
```

---

## What gets tracked automatically

| Signal | Detail |
|--------|--------|
| LLM calls | Model name, input prompt, output text, token counts, latency, cost |
| Tool calls | Tool name, input string, output, latency, errors |
| Errors | Error type and message on any LLM or tool failure |
| Loop detection | Repeated identical tool calls are flagged automatically |
| Span nesting | Tool calls inside an LLM turn appear as child spans in the trace |

Token counts and cost are extracted from the LLM response metadata — no extra configuration needed for OpenAI, Anthropic, or Google models.

---

## Attach session metadata

Pass any extra context when opening the session:

```python
with dottle.session(
    "support-agent",
    user_id="usr_42",
    user_email="alice@company.com",
    tags=["production", "tier:pro"],
    metadata={"ticket_id": "T-1234"},
) as sid:
    result = agent_executor.invoke({"input": user_message})
```

This metadata appears in the Sessions list and is searchable in the dashboard.

---

## Combining with manual spans

You can mix the callback handler with manual `dottle.span()` calls in the same session. For example, wrap a retrieval step that happens outside LangChain:

```python
with dottle.session("rag-agent") as sid:

    # Manual span for your vector DB query
    with dottle.span("retrieval", "pinecone_query") as s:
        docs = pinecone_index.query(embedding, top_k=5)

    # LangChain chain — handler auto-records the LLM call
    answer = chain.invoke({"context": docs, "question": query})
```

---

## Disable in tests

```python
dottle.configure(api_key="dtl_live_...", disabled=True)
```

When `disabled=True`, the SDK and the callback handler are full no-ops — no network calls, no overhead.

---

## Troubleshooting

**No spans appear in the dashboard**
- Make sure `DottleCallbackHandler()` is passed to **both** the LLM and the AgentExecutor (or just the AgentExecutor — it propagates to child runs).
- Confirm the handler is used inside an active `with dottle.session(...)` block. Callbacks outside a session are silently dropped.
- Run with `debug=True` in `dottle.configure()` to print flush confirmations.

**Token counts show as `—`**
- LangChain only returns token usage when `stream=False` (the default). Streaming calls don't include usage metadata from the model.

**Cost shows as `$0.0000`**
- Cost is calculated from token counts × model price. If the model name returned by LangChain doesn't match Dottle's pricing table (e.g. a fine-tuned model), cost defaults to zero but tokens are still recorded.
