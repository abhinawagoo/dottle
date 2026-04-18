"""
Scenario 4: wrap_openai + wrap_anthropic demo
----------------------------------------------
Shows how developers use dottle in 3 lines — wrap the client once,
then every LLM call is auto-tracked inside session() blocks.

Uses lightweight mock clients so no real API keys are needed.
The mock responses mirror the exact structure of real OpenAI / Anthropic responses.

What to look for in the dashboard:
- Sessions show LLM spans with model names auto-filled
- Tokens + cost tracked automatically (no s.record_tokens() calls)
- Prompt and response text captured without s.record_prompt()
- Tool spans still tracked manually (wrappers only cover the LLM client)
"""
import dottle
import time
from dataclasses import dataclass, field
from typing import Any

dottle.configure(
    api_key="dtl_live_Zyp15I6iw3i35nbtpf8RJCu04aKmBRT2RrDLi_zP6oA",
    api_url="http://localhost:8000/api/v1",
    debug=True,
)


# ── Minimal OpenAI response mock ──────────────────────────────────────────────

@dataclass
class MockUsage:
    prompt_tokens: int
    completion_tokens: int

@dataclass
class MockMessage:
    content: str
    role: str = "assistant"

@dataclass
class MockChoice:
    message: MockMessage
    finish_reason: str = "stop"

@dataclass
class MockOpenAIResponse:
    choices: list
    usage: MockUsage
    model: str = "gpt-4o"

class MockCompletions:
    def create(self, *, model="gpt-4o", messages=None, **kwargs):
        # Simulate a real model response
        last_user = next(
            (m["content"] for m in reversed(messages or []) if m["role"] == "user"),
            "Hello"
        )
        time.sleep(0.15)  # simulate network latency
        return MockOpenAIResponse(
            model=model,
            choices=[MockChoice(
                message=MockMessage(
                    content=f"[{model} response to]: {last_user[:80]}... (simulated)"
                )
            )],
            usage=MockUsage(prompt_tokens=len(last_user)//4 + 120, completion_tokens=85),
        )

class MockOpenAIChat:
    def __init__(self):
        self.completions = MockCompletions()

class MockOpenAIClient:
    """Mimics openai.OpenAI() structure."""
    def __init__(self):
        self.chat = MockOpenAIChat()


# ── Minimal Anthropic response mock ───────────────────────────────────────────

@dataclass
class MockAnthropicUsage:
    input_tokens: int
    output_tokens: int

@dataclass
class MockContentBlock:
    text: str
    type: str = "text"

@dataclass
class MockAnthropicResponse:
    content: list
    usage: MockAnthropicUsage
    stop_reason: str = "end_turn"
    model: str = "claude-opus-4-6"

class MockAnthropicMessages:
    def create(self, *, model="claude-opus-4-6", messages=None, system="", max_tokens=1024, **kwargs):
        last_user = next(
            (m["content"] for m in reversed(messages or []) if m["role"] == "user"),
            "Hello"
        )
        time.sleep(0.2)  # simulate latency
        return MockAnthropicResponse(
            model=model,
            content=[MockContentBlock(
                text=f"[{model} response]: Understood. {last_user[:60]}... Here is my analysis. (simulated)"
            )],
            usage=MockAnthropicUsage(
                input_tokens=len(last_user)//4 + 150,
                output_tokens=110,
            ),
        )

class MockAnthropicClient:
    """Mimics anthropic.Anthropic() structure."""
    def __init__(self):
        self.messages = MockAnthropicMessages()


# ── Test 1: wrap_openai ────────────────────────────────────────────────────────

print("=" * 60)
print("Test 1: wrap_openai — customer support agent")
print("=" * 60)

raw_openai = MockOpenAIClient()
client = dottle.wrap_openai(raw_openai)  # ONE LINE to instrument

with dottle.session("customer-support-agent", metadata={"channel": "web", "user_id": "usr_8821"}) as sid:
    print(f"  Session: {sid}")

    # These LLM calls are tracked AUTOMATICALLY — no span() needed
    resp1 = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "You are a helpful customer support agent for an e-commerce store."},
            {"role": "user", "content": "My order #48291 hasn't arrived yet, it's been 10 days."},
        ]
    )

    # Tool call — still manual
    with dottle.span("tool", "lookup_order", input_args={"order_id": "48291"}) as s:
        time.sleep(0.05)
        s.set_attribute("order_status", "in_transit")
        s.set_attribute("estimated_delivery", "2026-04-18")

    resp2 = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "You are a helpful customer support agent."},
            {"role": "user", "content": "My order #48291 hasn't arrived yet, it's been 10 days."},
            {"role": "assistant", "content": resp1.choices[0].message.content},
            {"role": "user", "content": "The order shows 'in transit'. What does that mean exactly?"},
        ]
    )

print(f"  Done. 2 LLM calls auto-tracked, 1 tool span manual.\n")


# ── Test 2: wrap_anthropic ─────────────────────────────────────────────────────

print("=" * 60)
print("Test 2: wrap_anthropic — code review agent")
print("=" * 60)

raw_anthropic = MockAnthropicClient()
client2 = dottle.wrap_anthropic(raw_anthropic)  # ONE LINE to instrument

with dottle.session("code-review-agent", metadata={"repo": "myapp/backend", "pr_number": 142}) as sid:
    print(f"  Session: {sid}")

    # Fetch PR diff — manual tool span
    with dottle.span("tool", "fetch_pr_diff", input_args={"pr": 142}) as s:
        time.sleep(0.04)
        s.set_attribute("files_changed", 7)
        s.set_attribute("lines_added", 234)
        s.set_attribute("lines_removed", 18)

    # First review pass — auto-tracked
    resp3 = client2.messages.create(
        model="claude-opus-4-6",
        system="You are an expert code reviewer. Be concise and constructive.",
        max_tokens=2048,
        messages=[{"role": "user", "content": "Review this PR diff for security vulnerabilities and performance issues. Focus on SQL queries and auth middleware changes."}]
    )

    # Static analysis — manual
    with dottle.span("tool", "run_static_analysis", input_args={"tool": "semgrep"}) as s:
        time.sleep(0.08)
        s.set_attribute("issues_found", 2)
        s.set_attribute("severity", "medium")

    # Final summary — auto-tracked
    resp4 = client2.messages.create(
        model="claude-opus-4-6",
        system="You are an expert code reviewer.",
        max_tokens=512,
        messages=[
            {"role": "user", "content": "Summarize the review findings in 3 bullet points. Include a recommendation: approve, request changes, or block."},
        ]
    )

print(f"  Done. 2 LLM calls auto-tracked, 2 tool spans manual.\n")


# ── Test 3: Mixed — both clients in one session ────────────────────────────────

print("=" * 60)
print("Test 3: Mixed models — routing agent (GPT-4o + Claude)")
print("=" * 60)

oai = dottle.wrap_openai(MockOpenAIClient())
ant = dottle.wrap_anthropic(MockAnthropicClient())

with dottle.session("multi-model-router", metadata={"strategy": "cost_optimized"}) as sid:
    print(f"  Session: {sid}")

    # Cheap model for classification
    oai.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": "Classify this task: 'Write a detailed legal analysis of GDPR Article 17'. Category: [simple, complex, legal, technical]"}]
    )

    # Smart model for heavy lifting
    ant.messages.create(
        model="claude-opus-4-6",
        system="You are a senior legal analyst specializing in EU data protection law.",
        max_tokens=4096,
        messages=[{"role": "user", "content": "Provide a comprehensive analysis of GDPR Article 17 (Right to Erasure) including case law examples and compliance checklist."}]
    )

    # Cheap model for formatting
    oai.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": "Format the following legal analysis as a structured markdown document with table of contents."}]
    )

print(f"  Done. 3 LLM calls across 2 providers, all auto-tracked.\n")

print("All 3 tests complete!")
print("Open http://localhost:3000/sessions to see the results.")
print("\nKey observation: ZERO manual span() calls for LLM tracking.")
print("Developers only wrap the client once — everything else is automatic.")
