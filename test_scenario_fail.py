"""
Scenario 2: Failing Data Pipeline Agent
-----------------------------------------
Simulates an agent that tries to query a database, hits timeouts,
retries with backoff, and eventually raises an exception so the
session ends as 'failed'.

What to look for in the dashboard:
- Session status = "failed" (red badge)
- Spans with status = "error" and error_message visible
- Error rate metric goes up
- Tool failure rate for 'query_database' goes up
"""
import agentloop
import time

agentloop.configure(
    api_key="alp_live_Zyp15I6iw3i35nbtpf8RJCu04aKmBRT2RrDLi_zP6oA",
    api_url="http://localhost:8000/api/v1",
    debug=True,
)

print("Running: Failing Data Pipeline Agent...")

try:
    with agentloop.session("data-pipeline-agent", metadata={"scenario": "fail_test", "pipeline": "user_report_v2"}) as sid:
        print(f"  Session: {sid}")

        # Step 1 — LLM decides what to query
        with agentloop.span("llm", "gpt-4o: plan query") as s:
            time.sleep(0.2)
            s.record_tokens(180, 60, "gpt-4o")
            s.record_prompt(
                input_text="Generate a SQL query to get monthly active users for last 90 days.",
                output_text="SELECT user_id, COUNT(*) FROM events WHERE ts > NOW() - INTERVAL '90 days' GROUP BY user_id;",
            )

        # Step 2 — First DB attempt: connection timeout
        with agentloop.span("tool", "query_database", input_args={"query": "SELECT user_id..."}) as s:
            time.sleep(0.8)
            s.set_attribute("attempt", 1)
            s.set_attribute("db_host", "prod-db-01")
            s.set_error("Connection timed out after 800ms", "DatabaseTimeoutError")

        # Step 3 — LLM decides to retry
        with agentloop.span("llm", "gpt-4o: handle error") as s:
            time.sleep(0.2)
            s.record_tokens(220, 55, "gpt-4o")
            s.record_prompt(
                input_text="The query timed out. What should I do?",
                output_text="I'll retry with a read replica and add a timeout hint.",
            )

        # Step 4 — Second DB attempt: different error
        with agentloop.span("tool", "query_database", input_args={"query": "SELECT user_id...", "replica": True}) as s:
            time.sleep(1.2)
            s.set_attribute("attempt", 2)
            s.set_attribute("db_host", "prod-db-replica-01")
            s.set_error("Too many connections (max 100 reached)", "DatabaseConnectionError")

        # Step 5 — LLM tries one more time
        with agentloop.span("llm", "gpt-4o: final retry decision") as s:
            time.sleep(0.2)
            s.record_tokens(195, 48, "gpt-4o")
            s.record_prompt(
                input_text="Replica also failed. Should I retry again?",
                output_text="I'll try one final time with a simplified query.",
            )

        # Step 6 — Third attempt: fatal error, raise exception
        with agentloop.span("tool", "query_database", input_args={"query": "SELECT COUNT(*) FROM events"}) as s:
            time.sleep(0.5)
            s.set_attribute("attempt", 3)
            s.set_attribute("db_host", "prod-db-replica-02")
            s.set_error("Permission denied for relation events", "DatabasePermissionError")

        # Agent gives up and raises
        raise RuntimeError("Data pipeline failed: exhausted all database retry attempts (3/3)")

except RuntimeError:
    pass  # expected — session is already marked failed by the context manager

print(f"\nDone. Session {sid} should show status=failed in the dashboard.")
print("Open: http://localhost:3000/sessions")
