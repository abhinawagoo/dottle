"""
Shared mock OpenAI and Anthropic clients.

These mirror the exact response structures of the real SDKs so dottle
wrappers work correctly — no real API keys needed.
"""
import time
import random
from dataclasses import dataclass, field
from typing import Any


# ── OpenAI mocks ──────────────────────────────────────────────────────────────

@dataclass
class MockUsage:
    prompt_tokens: int
    completion_tokens: int

@dataclass
class MockMessage:
    content: str
    role: str = "assistant"
    tool_calls: Any = None

@dataclass
class MockChoice:
    message: MockMessage
    finish_reason: str = "stop"
    index: int = 0

@dataclass
class MockOpenAIResponse:
    choices: list
    usage: MockUsage
    model: str = "gpt-4o"
    id: str = "chatcmpl-mock"

OPENAI_RESPONSES = {
    "support": [
        "I understand your frustration. Let me look up your order right away. Order #48291 shows it's currently in transit and expected to arrive within 1-2 business days. I've flagged it for priority tracking.",
        "I've applied a 10% discount to your next order as a courtesy for the delay. You'll receive an email confirmation shortly. Is there anything else I can help you with?",
        "I'm sorry to hear about the damaged item. I've initiated a replacement shipment and a full refund. You should receive both within 3-5 business days.",
    ],
    "sales": [
        "Lead analysis complete. Acme Corp scores 87/100 on our ICP matrix: Series B funding ($12M), 250+ engineers, active OpenAI API usage detected via BuiltWith. Recommend: immediate outreach with enterprise tier positioning.",
        "Personalized email drafted. Subject: 'How Stripe cut AI costs 40% with observability'. Opening references their recent blog post on scaling ML infrastructure. CTA: 15-min demo this week.",
        "Follow-up sequence created: Day 1 (email), Day 3 (LinkedIn), Day 7 (email with case study), Day 14 (breakup email). Estimated response rate: 23% based on similar ICP cohort.",
    ],
    "research": [
        "Found 14 relevant sources on AI agent observability market. Key findings: market growing 340% YoY, primary buyers are ML platform teams at Series B+ companies. Top competitors: Langsmith, Arize, Weights & Biases.",
        "Executive summary complete. The AI observability market is consolidating around three use cases: cost optimization (avg 35% savings reported), debugging (MTTR reduced from days to hours), and compliance (audit trails for regulated industries).",
        "Competitive analysis: LangSmith focuses on LangChain ecosystem, Arize on ML model monitoring, W&B on training. Gap identified: none offer real-time cost alerting + loop detection for production agents.",
    ],
    "code": [
        "Security review complete. Found 2 medium-severity issues: (1) SQL query on line 47 is vulnerable to injection via unsanitized user_id parameter. (2) JWT token stored in localStorage instead of httpOnly cookie. No critical issues.",
        "Performance analysis: The N+1 query pattern in UserService.get_orders() will cause 50+ DB calls for a typical user. Recommend: add select_related('items') to the queryset. Estimated improvement: 10x latency reduction.",
        "PR Review Summary: ✅ Approve with changes. Fix the SQL injection (blocking) and N+1 query (high priority). The auth refactor looks solid — good use of middleware pattern. Test coverage at 78%, acceptable for this change size.",
    ],
    "document": [
        "Invoice processed. Extracted: Vendor=Cloudflare Inc, Amount=$4,892.00, Date=2026-04-30, PO#=PO-2026-0891, Line items: Bandwidth ($2,100), Workers ($890), R2 Storage ($1,902). Confidence: 98.7%",
        "Validation complete. All fields verified against vendor master. Amount within approved budget limit ($10k). No duplicate invoice detected. Ready for AP approval workflow.",
        "Enrichment complete. Mapped to GL account 6100-IT-Infrastructure. Cost center: Engineering. Budget remaining this quarter: $28,450. Approval required from: CFO (>$5k threshold).",
    ],
    "generic": [
        "Task completed successfully. Here are the results based on my analysis.",
        "I've processed your request and here is a comprehensive response with actionable next steps.",
        "Analysis complete. Based on the data provided, I recommend the following course of action.",
    ],
}

def _mock_openai_response(model: str, messages: list, category: str = "generic") -> MockOpenAIResponse:
    user_msgs = [m for m in (messages or []) if m.get("role") == "user"]
    n_tokens = sum(len(m.get("content", "")) for m in messages) // 4 + 80
    responses = OPENAI_RESPONSES.get(category, OPENAI_RESPONSES["generic"])
    text = random.choice(responses)
    time.sleep(random.uniform(0.15, 0.35))
    return MockOpenAIResponse(
        model=model,
        choices=[MockChoice(message=MockMessage(content=text))],
        usage=MockUsage(prompt_tokens=n_tokens, completion_tokens=len(text) // 4 + 20),
    )

class MockCompletions:
    def __init__(self, category="generic"):
        self.category = category

    def create(self, *, model="gpt-4o", messages=None, **kwargs):
        return _mock_openai_response(model, messages or [], self.category)

class MockOpenAIChat:
    def __init__(self, category="generic"):
        self.completions = MockCompletions(category)

class MockOpenAI:
    def __init__(self, category="generic"):
        self.chat = MockOpenAIChat(category)


# ── Anthropic mocks ───────────────────────────────────────────────────────────

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
    id: str = "msg_mock"

ANTHROPIC_RESPONSES = {
    "code": [
        "After reviewing the diff carefully, I've identified the following:\n\n**Critical**: The authentication bypass on line 89 allows unauthenticated access to admin endpoints when `X-Internal-Request` header is present. This must be fixed before merge.\n\n**High**: Rate limiting is applied after DB lookup — move it to middleware layer to prevent enumeration attacks.\n\n**Medium**: 3 functions exceed 50-line complexity threshold. Consider extracting helper methods.",
        "**Recommendation: Request Changes** ⚠️\n\nThe security findings require immediate attention. The auth bypass is a P0 issue. Once fixed, the overall code quality is good — clean abstractions, good test coverage, well-documented edge cases. Approve after security fixes are in.",
    ],
    "research": [
        "Based on my analysis of 23 data points across the AI observability landscape, here are the key insights:\n\n1. **Market timing**: 78% of ML teams report 'flying blind' in production — they have logs but no structured observability.\n2. **Primary pain**: Cost overruns (avg 3.2x over budget) and debugging time (avg 4.2 hours per incident).\n3. **Buyer profile**: ML Platform Lead at companies with >10 models in production, budget owner is typically CTO or VP Engineering.",
        "**Competitive Moat Analysis**: The winning position in this market requires real-time streaming (not batch), provider-agnostic instrumentation (1-line setup), and actionable alerts (not just dashboards). Current tools require 2-8 hours of integration work. Dottle's 3-line setup is a significant differentiator.",
    ],
    "support": [
        "I completely understand your frustration, and I sincerely apologize for the experience. After reviewing your account history and this interaction, here's what I'm doing right now:\n\n1. Issuing a full refund — you'll see it in 3-5 business days\n2. Sending a replacement with overnight shipping at no charge\n3. Adding a $25 store credit to your account\n\nYou've been a customer for 3 years and this should never have happened.",
    ],
    "generic": [
        "I've completed a thorough analysis of the request. Here is my comprehensive response with detailed reasoning and specific recommendations based on the available information.",
        "After careful consideration, I recommend the following approach. This solution addresses the core requirements while remaining maintainable and scalable for future needs.",
    ],
}

def _mock_anthropic_response(model: str, messages: list, system: str = "", category: str = "generic") -> MockAnthropicResponse:
    n_tokens = (len(system) + sum(len(m.get("content", "")) for m in messages)) // 4 + 120
    responses = ANTHROPIC_RESPONSES.get(category, ANTHROPIC_RESPONSES["generic"])
    text = random.choice(responses)
    time.sleep(random.uniform(0.2, 0.45))
    return MockAnthropicResponse(
        model=model,
        content=[MockContentBlock(text=text)],
        usage=MockAnthropicUsage(input_tokens=n_tokens, output_tokens=len(text) // 4 + 30),
    )

class MockAnthropicMessages:
    def __init__(self, category="generic"):
        self.category = category

    def create(self, *, model="claude-opus-4-6", messages=None, system="", max_tokens=1024, **kwargs):
        return _mock_anthropic_response(model, messages or [], system, self.category)

class MockAnthropic:
    def __init__(self, category="generic"):
        self.messages = MockAnthropicMessages(category)
