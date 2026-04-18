"""
Scenario 1: Looping Research Agent
-----------------------------------
Simulates an LLM agent that gets stuck searching for the same query
over and over. The loop detector should catch it after 3 identical
tool calls and mark the session as 'looping'.

What to look for in the dashboard:
- Session status = "looping" (orange badge)
- Loop Rate metric goes up
- Span attributes show loop_detected=True with a reason
"""
import dottle
import time

dottle.configure(
    api_key="dtl_live_Zyp15I6iw3i35nbtpf8RJCu04aKmBRT2RrDLi_zP6oA",
    api_url="http://localhost:8000/api/v1",
    debug=True,
)

STUCK_QUERY = "best practices for Python async programming"

print("Running: Looping Research Agent...")

with dottle.session("research-agent", metadata={"scenario": "loop_test"}) as sid:
    print(f"  Session: {sid}")

    # Iteration 1 — normal first search
    with dottle.span("llm", "gpt-4o: plan research") as s:
        time.sleep(0.3)
        s.record_tokens(210, 85, "gpt-4o")
        s.record_prompt(
            input_text="You are a research assistant. Plan how to find information about async Python.",
            output_text=f'I need to search for: "{STUCK_QUERY}". Let me call search_web.',
        )

    with dottle.span("tool", "search_web", input_args={"query": STUCK_QUERY}) as s:
        time.sleep(0.15)
        s.set_attribute("results_count", 10)
        s.set_attribute("query", STUCK_QUERY)

    # Iteration 2 — LLM forgets it already searched, searches again
    with dottle.span("llm", "gpt-4o: evaluate results") as s:
        time.sleep(0.3)
        s.record_tokens(340, 92, "gpt-4o")
        s.record_prompt(
            input_text="Here are the search results. Are these sufficient?",
            output_text=f'The results seem incomplete. I should search again for: "{STUCK_QUERY}".',
        )

    with dottle.span("tool", "search_web", input_args={"query": STUCK_QUERY}) as s:
        time.sleep(0.15)
        s.set_attribute("results_count", 10)
        s.set_attribute("query", STUCK_QUERY)

    # Iteration 3 — still stuck, searches a third time → loop triggers
    with dottle.span("llm", "gpt-4o: refine search") as s:
        time.sleep(0.3)
        s.record_tokens(290, 78, "gpt-4o")
        s.record_prompt(
            input_text="Results still look thin. What should I do?",
            output_text=f'I will try searching one more time for: "{STUCK_QUERY}".',
        )

    with dottle.span("tool", "search_web", input_args={"query": STUCK_QUERY}) as s:
        time.sleep(0.15)
        s.set_attribute("results_count", 10)
        s.set_attribute("query", STUCK_QUERY)
        # Loop detector fires here: 3x identical inputs

print(f"\nDone. Session {sid} should show status=looping in the dashboard.")
print("Open: http://localhost:3000/sessions")
