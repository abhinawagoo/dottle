"""
Demo 1: E-Commerce Customer Support Agent
==========================================
Industry: Retail / E-Commerce
Agent: Handles inbound support tickets — order issues, returns, billing

Features demonstrated:
  - dottle.session() with user attribution (email, user_id, tags)
  - Manual span("llm", ...) with record_tokens() + record_prompt()
  - Manual span("tool", ...) with set_attribute()
  - Error scenario: payment gateway timeout → session marked failed
  - Successful multi-turn conversation with tool calls in between

Run: python 01_customer_support.py
     Then open https://app.dottle.dev/sessions
"""

import sys, time, random
import _config  # loads DOTTLE_API_KEY from env, configures dottle → production
import dottle
from _mock_clients import MockOpenAI

openai = dottle.wrap_openai(MockOpenAI("support"))

BANNER = "=" * 60

# ── Ticket 1: Delayed order (happy path) ──────────────────────────────────────

print(BANNER)
print("Ticket #84201 — Order not arrived (Sarah)")
print(BANNER)

with dottle.session(
    "shopflow-support-agent",
    user_id="usr_sarah_k",
    user_email="sarah.kim@gmail.com",
    tags=["prod", "support", "order-issue"],
    agent_version="2.4.1",
) as sid:
    print(f"  session: {sid}")

    # Step 1: classify ticket
    with dottle.span("tool", "classify_ticket") as s:
        time.sleep(0.04)
        s.set_attribute("ticket_id", "84201")
        s.set_attribute("category", "shipping_delay")
        s.set_attribute("priority", "medium")

    # Step 2: look up order
    with dottle.span("tool", "lookup_order") as s:
        time.sleep(0.06)
        s.set_attribute("order_id", "ORD-48291")
        s.set_attribute("status", "in_transit")
        s.set_attribute("carrier", "UPS")
        s.set_attribute("estimated_delivery", "2026-05-13")

    # Step 3: generate empathetic response
    resp = openai.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "You are a helpful customer support agent for ShopFlow, an e-commerce platform. Be empathetic, concise, and solution-oriented."},
            {"role": "user", "content": "My order #ORD-48291 hasn't arrived. I ordered 10 days ago and paid for 5-day shipping."},
        ]
    )
    print(f"  Response: {resp.choices[0].message.content[:80]}...")

    # Step 4: check refund eligibility
    with dottle.span("tool", "check_refund_eligibility") as s:
        time.sleep(0.03)
        s.set_attribute("order_id", "ORD-48291")
        s.set_attribute("days_late", 5)
        s.set_attribute("eligible_for_shipping_refund", True)

    # Step 5: apply shipping refund
    with dottle.span("tool", "apply_refund") as s:
        time.sleep(0.05)
        s.set_attribute("order_id", "ORD-48291")
        s.set_attribute("amount_usd", 12.99)
        s.set_attribute("reason", "shipping_delay_compensation")

    # Step 6: follow-up message
    resp2 = openai.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "You are a helpful customer support agent for ShopFlow."},
            {"role": "user", "content": "My order #ORD-48291 hasn't arrived. Ordered 10 days ago."},
            {"role": "assistant", "content": resp.choices[0].message.content},
            {"role": "user", "content": "Will I get a refund for the shipping?"},
        ]
    )
    print(f"  Follow-up: {resp2.choices[0].message.content[:80]}...")

print("  ✓ Ticket resolved\n")


# ── Ticket 2: Damaged item (happy path) ───────────────────────────────────────

print(BANNER)
print("Ticket #84202 — Damaged item received (James)")
print(BANNER)

with dottle.session(
    "shopflow-support-agent",
    user_id="usr_james_t",
    user_email="james.thornton@acmecorp.com",
    tags=["prod", "support", "damaged-item"],
    agent_version="2.4.1",
) as sid:
    print(f"  session: {sid}")

    with dottle.span("tool", "classify_ticket") as s:
        time.sleep(0.03)
        s.set_attribute("ticket_id", "84202")
        s.set_attribute("category", "damaged_item")
        s.set_attribute("priority", "high")

    with dottle.span("tool", "lookup_order") as s:
        time.sleep(0.05)
        s.set_attribute("order_id", "ORD-51002")
        s.set_attribute("status", "delivered")
        s.set_attribute("item", "Sony WH-1000XM5 Headphones")
        s.set_attribute("order_value_usd", 349.99)

    # Search knowledge base for damaged item policy
    with dottle.span("tool", "search_knowledge_base") as s:
        time.sleep(0.04)
        s.set_attribute("query", "damaged item replacement policy")
        s.set_attribute("results_found", 3)
        s.set_attribute("top_result", "damaged_item_policy_v3")

    resp = openai.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "You are a helpful customer support agent for ShopFlow. Policy: damaged items get free replacement + 15% discount on next order."},
            {"role": "user", "content": "I received my Sony headphones today but the right ear cup is cracked and they don't work properly."},
        ]
    )
    print(f"  Response: {resp.choices[0].message.content[:80]}...")

    with dottle.span("tool", "create_return_label") as s:
        time.sleep(0.06)
        s.set_attribute("order_id", "ORD-51002")
        s.set_attribute("label_type", "prepaid_return")
        s.set_attribute("carrier", "FedEx")

    with dottle.span("tool", "schedule_replacement") as s:
        time.sleep(0.04)
        s.set_attribute("item", "Sony WH-1000XM5 Headphones")
        s.set_attribute("shipping", "overnight")
        s.set_attribute("tracking", "FX-2026-88821")

print("  ✓ Replacement scheduled\n")


# ── Ticket 3: Billing dispute (error — payment gateway down) ──────────────────

print(BANNER)
print("Ticket #84203 — Billing dispute (Maria) [ERROR SCENARIO]")
print(BANNER)

try:
    with dottle.session(
        "shopflow-support-agent",
        user_id="usr_maria_g",
        user_email="maria.garcia@startup.io",
        tags=["prod", "support", "billing"],
        agent_version="2.4.1",
    ) as sid:
        print(f"  session: {sid}")

        with dottle.span("tool", "classify_ticket") as s:
            time.sleep(0.03)
            s.set_attribute("ticket_id", "84203")
            s.set_attribute("category", "billing_dispute")
            s.set_attribute("priority", "high")

        with dottle.span("tool", "lookup_transaction") as s:
            time.sleep(0.04)
            s.set_attribute("transaction_id", "TXN-9920441")
            s.set_attribute("amount_usd", 89.99)

        # Payment gateway is down — this will fail the session
        with dottle.span("tool", "query_payment_gateway") as s:
            time.sleep(0.08)
            raise TimeoutError("Payment gateway API unreachable (timeout after 30s)")

except TimeoutError:
    pass

print("  ✓ Error captured — session marked failed\n")


print(BANNER)
print("All support tickets processed.")
print("Open https://app.dottle.dev/sessions to review.")
print(BANNER)
