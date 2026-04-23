"""
Onboarding router
=================
Generates AI-powered Dottle SDK instrumentation guides from wizard answers.
Uses Claude to produce framework-specific, context-aware instructions.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import httpx
import structlog

from app.config import get_settings

router = APIRouter(tags=["onboarding"])
logger = structlog.get_logger()
settings = get_settings()


class WizardAnswers(BaseModel):
    language: str                        # python / typescript / javascript / go / rust / custom
    custom_language: str = ""            # filled when language == "custom"
    framework: str                       # langchain / crewai / agno / etc.
    custom_framework: str = ""           # filled when framework == "other"
    llm_providers: list[str] = []        # multi-select
    custom_llm: str = ""                 # additional free-text LLM/model
    agent_type: str                      # single / multi / rag / workflow / chatbot / voice / code / custom
    custom_agent_type: str = ""          # filled when agent_type == "custom"
    tool_types: list[str] = []           # multi-select
    custom_tools: str = ""               # additional free-text tools
    codebase_context: str = ""           # freeform paste


class GeneratePromptRequest(BaseModel):
    answers: WizardAnswers
    api_key: str


SYSTEM_PROMPT = """You are an expert AI agent observability engineer specializing in the Dottle SDK.
Your task: generate a precise, ready-to-paste instrumentation guide for the user's specific AI agent codebase.

## Dottle Python SDK

```python
import os
import dottle

# Configure once at startup
dottle.configure(api_key=os.environ["DOTTLE_API_KEY"])

# Wrap every agent run in a session
with dottle.session("agent-name", user_id="optional-user-id", metadata={}) as sid:

    # Track every LLM call
    with dottle.span("llm", "model-name") as s:
        response = client.chat.completions.create(...)
        s.record_tokens(
            response.usage.prompt_tokens,
            response.usage.completion_tokens,
            "model-name",
        )

    # Track every tool / function call
    with dottle.span("tool", "tool-name") as s:
        result = my_tool(args)

    # Track retrieval / vector DB calls
    with dottle.span("retrieval", "vector-search") as s:
        docs = vectordb.query(embedding)
        s.set_attribute("num_docs", len(docs))

    # Track sub-agents (multi-agent systems)
    with dottle.span("agent", "sub-agent-name") as s:
        result = sub_agent.run(task)
```

## LangChain — use the built-in callback handler (zero manual spans needed)

```python
from dottle.integrations.langchain import DottleCallbackHandler
handler = DottleCallbackHandler()

llm = ChatOpenAI(model="gpt-4o", callbacks=[handler])
agent = AgentExecutor(agent=..., tools=..., callbacks=[handler])

with dottle.session("langchain-agent") as sid:
    result = agent.invoke({"input": query})

# LangGraph: pass config
app.invoke(input, config={"callbacks": [handler]})
```

## Dottle JS / TypeScript SDK

```typescript
import dottle from "dottle-js-sdk";
dottle.configure({ apiKey: process.env.DOTTLE_API_KEY });

const sessionId = await dottle.startSession("agent-name", { userId: "optional" });
try {
  const span = await dottle.startSpan(sessionId, "llm", "gpt-4o");
  const response = await openai.chat.completions.create({ model: "gpt-4o", messages });
  await dottle.endSpan(span.id, {
    inputTokens: response.usage.prompt_tokens,
    outputTokens: response.usage.completion_tokens,
    model: "gpt-4o",
  });
} finally {
  await dottle.endSession(sessionId, { status: "completed" });
}
```

## Rules
- Generate a **complete, copy-ready** guide tailored to the user's EXACT stack
- If the framework has no built-in Dottle integration, show how to wrap its LLM/tool calls manually
- Adapt code examples to their specific framework's API (method names, import paths, patterns)
- For async frameworks, note that all context managers work with `async with`
- Keep changes minimal — don't restructure existing code, only add Dottle wrapping
- Include verification step: `dottle.configure(debug=True)` shows flush logs in terminal
- Format as clear markdown with numbered steps and code blocks"""


def _build_user_message(answers: WizardAnswers, api_key: str) -> str:
    lang = answers.custom_language if answers.language == "custom" else answers.language
    framework = answers.custom_framework if answers.framework == "other" else answers.framework

    llm_parts = list(answers.llm_providers)
    if answers.custom_llm.strip():
        llm_parts.append(answers.custom_llm.strip())
    llms = ", ".join(llm_parts) if llm_parts else "not specified"

    agent_type = (
        answers.custom_agent_type if answers.agent_type == "custom" else answers.agent_type
    )

    tool_parts = list(answers.tool_types)
    if answers.custom_tools.strip():
        tool_parts.append(answers.custom_tools.strip())
    tools = ", ".join(tool_parts) if tool_parts else "none specified"

    context_section = (
        f"\n**Codebase / Agent Details (provided by the developer):**\n{answers.codebase_context.strip()}"
        if answers.codebase_context.strip()
        else ""
    )

    return f"""Generate a Dottle SDK instrumentation guide for this exact setup:

**Language:** {lang}
**AI Framework:** {framework}
**LLM Provider(s):** {llms}
**Agent Type:** {agent_type}
**Tools Used:** {tools}
**Dottle API Key:** {api_key}
{context_section}

Requirements:
1. Install command for their language
2. Configure step with their exact API key above
3. Framework-specific code — if it's an uncommon or custom framework, explain how to manually wrap their LLM calls and tool calls
4. Patterns specific to their agent type (multi-agent nesting, RAG retrieval tracking, voice turn tracking, etc.)
5. Tool tracking for their specific tools
6. Async patterns if relevant
7. Verification steps

Make all code examples specific to their stack. If they describe a custom or uncommon framework/model (like Hermes, OpenClaw, Agno, Vercel AI, Pydantic AI, etc.), generate accurate instrumentation for it."""


@router.post("/onboarding/generate-prompt")
async def generate_instrumentation_prompt(body: GeneratePromptRequest):
    """Call Claude to generate a tailored, AI-powered instrumentation guide."""
    user_message = _build_user_message(body.answers, body.api_key)

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": settings.anthropic_api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": "claude-sonnet-4-6",
                    "max_tokens": 4000,
                    "system": SYSTEM_PROMPT,
                    "messages": [{"role": "user", "content": user_message}],
                },
            )
    except Exception as e:
        logger.error("AI generation request failed", error=str(e))
        raise HTTPException(status_code=503, detail="AI service unavailable")

    if resp.status_code != 200:
        logger.error("AI generation non-200", status=resp.status_code)
        raise HTTPException(status_code=500, detail="AI generation failed")

    content = resp.json()["content"][0]["text"]
    return {"prompt": content}
