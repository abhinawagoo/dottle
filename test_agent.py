import sys
sys.path.insert(0, "sdk")
import dottle
import time

dottle.configure(
    api_key="dtl_live_mKCacIJyquHiGd4lrXV3aCIc2wMe4FUqJU7XlmK9td4",
    api_url="http://localhost:8000/api/v1",
    debug=True,
)

print("=" * 60)
print("Test 1: Successful session with attribution + tags")
print("=" * 60)
with dottle.session(
    "salesmemory-agent",
    user_id="user_001",
    user_email="bob@acmecorp.com",
    tags=["prod", "sales", "v1.2"],
    agent_version="1.2.0",
) as sid:
    print(f"  session_id: {sid}")
    with dottle.span("llm", "gpt-4o: qualify lead") as s:
        time.sleep(0.3)
        s.record_tokens(480, 210, "gpt-4o")
        s.record_prompt(
            input_text="Analyze this lead: Acme Corp, 500 employees, budget $50k. Qualify them.",
            output_text="Lead qualified: HIGH priority. Budget fits, company size matches ICP. Recommend outreach within 24h.",
        )
    with dottle.span("tool", "crm_lookup") as s:
        time.sleep(0.05)
        s.set_attribute("company", "Acme Corp")
        s.set_attribute("result", "found")
    with dottle.span("tool", "send_email") as s:
        time.sleep(0.1)
        s.set_attribute("to", "ceo@acmecorp.com")
        s.set_attribute("template", "high_priority_outreach")
    with dottle.span("llm", "gpt-4o: draft follow-up") as s:
        time.sleep(0.2)
        s.record_tokens(320, 180, "gpt-4o")
        s.record_prompt(
            input_text="Draft a follow-up email for Acme Corp after initial outreach.",
            output_text="Subject: Following up on our conversation\nHi [Name], wanted to circle back...",
        )
print("  ✓ Done\n")


print("=" * 60)
print("Test 2: Failed session (tool error)")
print("=" * 60)
try:
    with dottle.session(
        "salesmemory-agent",
        user_id="user_002",
        user_email="carol@techco.com",
        tags=["prod", "sales"],
        agent_version="1.2.0",
    ) as sid:
        print(f"  session_id: {sid}")
        with dottle.span("llm", "gpt-4o: qualify lead") as s:
            time.sleep(0.2)
            s.record_tokens(380, 160, "gpt-4o")
            s.record_prompt(
                input_text="Analyze this lead: TechCo, 50 employees, budget unknown.",
                output_text="Lead status: UNCERTAIN. Need to gather more info before qualifying.",
            )
        with dottle.span("tool", "crm_lookup") as s:
            time.sleep(0.05)
            s.set_attribute("company", "TechCo")
            raise ConnectionError("CRM API timeout after 30s")
except ConnectionError:
    pass
print("  ✓ Done\n")


print("=" * 60)
print("Test 3: Looping session (repetitive tool calls)")
print("=" * 60)
with dottle.session(
    "salesmemory-agent",
    user_id="user_003",
    user_email="dave@startup.io",
    tags=["staging", "debug"],
    agent_version="1.2.0",
) as sid:
    print(f"  session_id: {sid}")
    for i in range(6):
        with dottle.span("llm", "gpt-4o: next action") as s:
            time.sleep(0.05)
            s.record_tokens(200, 80, "gpt-4o")
        with dottle.span("tool", "search_contacts", input_args={"query": "startup.io CEO"}) as s:
            time.sleep(0.02)
print("  ✓ Done\n")

print("=" * 60)
print("All tests complete! Open http://localhost:3000/sessions")
print("=" * 60)
