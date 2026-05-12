"""
Demo 6: Error Scenarios & Loop Detection
==========================================
Industry: Any — demonstrates platform observability features directly
Agent: Simulates real failure patterns seen in production AI agents

Features demonstrated:
  - Session marked "failed" on exception
  - Tool error captured in span
  - LLM hallucination retry loop (loop detection)
  - Hard timeout scenario
  - Graceful degradation with fallback

Run: python 06_loop_and_errors.py
     Then open https://app.dottle.dev/sessions
"""

import sys, time
import _config  # loads DOTTLE_API_KEY from env, configures dottle → production
import dottle

BANNER = "=" * 60


# ── Scenario 1: Clean success (baseline) ──────────────────────────────────────

print(BANNER)
print("Scenario 1: Successful run (baseline)")
print(BANNER)

with dottle.session(
    "inventory-reorder-agent",
    user_email="ops@retailco.com",
    tags=["prod", "inventory", "v1.0"],
) as sid:
    print(f"  session: {sid}")

    with dottle.span("tool", "check_inventory_levels") as s:
        time.sleep(0.05)
        s.set_attribute("sku", "SKU-88291")
        s.set_attribute("current_stock", 12)
        s.set_attribute("reorder_threshold", 20)
        s.set_attribute("should_reorder", True)

    with dottle.span("llm", "gpt-4o: calculate reorder quantity") as s:
        time.sleep(0.22)
        s.record_tokens(310, 95, "gpt-4o")
        s.record_prompt(
            input_text="Current stock: 12 units. Daily velocity: 8 units. Lead time: 5 days. Safety stock: 10 days. Calculate optimal reorder quantity.",
            output_text="Optimal reorder: 220 units (5-day lead time × 8 velocity + 80-unit safety buffer, rounded to nearest case of 10)."
        )
        s.set_attribute("reorder_qty", 220)

    with dottle.span("tool", "submit_purchase_order") as s:
        time.sleep(0.06)
        s.set_attribute("supplier", "MegaDistributor Inc")
        s.set_attribute("quantity", 220)
        s.set_attribute("po_number", "PO-AUTO-2026-8821")
        s.set_attribute("estimated_arrival", "2026-05-16")

print("  ✓ Reorder placed successfully\n")


# ── Scenario 2: Tool failure mid-session ──────────────────────────────────────

print(BANNER)
print("Scenario 2: Tool failure — external API down")
print(BANNER)

try:
    with dottle.session(
        "inventory-reorder-agent",
        user_email="ops@retailco.com",
        tags=["prod", "inventory", "v1.0"],
    ) as sid:
        print(f"  session: {sid}")

        with dottle.span("tool", "check_inventory_levels") as s:
            time.sleep(0.05)
            s.set_attribute("sku", "SKU-44102")
            s.set_attribute("current_stock", 3)

        with dottle.span("llm", "gpt-4o: calculate reorder quantity") as s:
            time.sleep(0.20)
            s.record_tokens(290, 88, "gpt-4o")
            s.record_prompt(
                input_text="Current stock: 3 units. Reorder now.",
                output_text="Urgent reorder required: 200 units."
            )

        # Supplier API is down
        with dottle.span("tool", "submit_purchase_order") as s:
            time.sleep(0.09)
            s.set_attribute("supplier", "GlobalSupplier API")
            raise ConnectionError("GlobalSupplier API: 503 Service Unavailable (maintenance window)")

except ConnectionError:
    pass

print("  ✓ Failure captured — session marked failed\n")


# ── Scenario 3: Validation loop (agent stuck in retry cycle) ──────────────────

print(BANNER)
print("Scenario 3: Agent loop — LLM output fails validation repeatedly")
print(BANNER)

with dottle.session(
    "data-extraction-agent",
    user_email="data@analytics.co",
    tags=["prod", "extraction", "debug"],
    agent_version="0.9.1",
) as sid:
    print(f"  session: {sid}")

    # The agent keeps trying to extract a date field but keeps getting wrong format
    for attempt in range(1, 7):
        with dottle.span("llm", "gpt-4o: extract date field") as s:
            time.sleep(0.12)
            s.record_tokens(280 + attempt * 20, 60, "gpt-4o")
            s.record_prompt(
                input_text=f"Extract the invoice date from: 'Invoice dated May first, twenty twenty-six'. Return ISO 8601 format. (Attempt {attempt})",
                output_text=f"{'May 1, 2026' if attempt < 5 else '2026-05-01'}"  # keeps returning wrong format
            )
            s.set_attribute("attempt", attempt)
            s.set_attribute("validation_passed", attempt >= 5)

        with dottle.span("tool", "validate_date_format") as s:
            time.sleep(0.02)
            s.set_attribute("format_expected", "ISO 8601")
            s.set_attribute("value_received", "May 1, 2026" if attempt < 5 else "2026-05-01")
            s.set_attribute("valid", attempt >= 5)

        if attempt >= 5:
            break

    print(f"  Resolved after {attempt} attempts (loop detected in dashboard)\n")


# ── Scenario 4: Cascading errors with partial recovery ────────────────────────

print(BANNER)
print("Scenario 4: Cascading errors with fallback")
print(BANNER)

with dottle.session(
    "content-generation-agent",
    user_email="marketing@saas.io",
    tags=["prod", "content", "v2.1"],
) as sid:
    print(f"  session: {sid}")

    with dottle.span("tool", "fetch_brand_guidelines") as s:
        time.sleep(0.04)
        s.set_attribute("source", "notion_api")
        s.set_attribute("status", "success")

    # Primary model fails
    with dottle.span("llm", "claude-opus-4-6: generate blog post") as s:
        time.sleep(0.08)
        s.record_tokens(0, 0, "claude-opus-4-6")
        s.set_error("Anthropic API overloaded: 529 rate limit (retry-after: 60s)")
        s.set_attribute("fallback_triggered", True)

    # Fallback to GPT-4o
    with dottle.span("llm", "gpt-4o: generate blog post [fallback]") as s:
        time.sleep(0.31)
        s.record_tokens(890, 540, "gpt-4o")
        s.record_prompt(
            input_text="Write a 500-word blog post about the ROI of AI agent observability. Tone: professional but approachable. Include 3 specific metrics.",
            output_text="Title: 'The Hidden Cost of Flying Blind with AI Agents'\n\nEvery month, engineering teams running AI agents lose an average of $12,000 to undetected token waste, infinite loops, and silent failures..."
        )
        s.set_attribute("model_used", "fallback_gpt4o")
        s.set_attribute("word_count", 512)

    with dottle.span("tool", "publish_to_cms") as s:
        time.sleep(0.05)
        s.set_attribute("cms", "Contentful")
        s.set_attribute("status", "draft")
        s.set_attribute("post_id", "entry_8821abc")

print("  ✓ Content generated via fallback model\n")


print(BANNER)
print("Error & loop scenarios complete.")
print("Open https://app.dottle.dev/sessions — look for:")
print("  - Red (failed) sessions in scenarios 2")
print("  - Loop indicators in scenario 3")
print("  - Error spans with fallback in scenario 4")
print(BANNER)
