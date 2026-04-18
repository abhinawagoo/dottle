"""
Scenario 3: Successful Multi-Tool Research Agent
--------------------------------------------------
Simulates a realistic agent that completes a full research task:
  LLM plan → 3x search → LLM summarize → write_file → LLM review → done

This is the happy path — session should complete successfully with:
- ~5 LLM calls (multiple models)
- ~4 tool calls
- Nested spans showing tool chaining
- Cost from gpt-4o + gpt-4o-mini mixed usage

What to look for in the dashboard:
- Session status = "completed" (green badge)
- Span tree with nested children
- Token counts and cost appear
- Prompt/response visible in span detail
"""
import dottle
import time

dottle.configure(
    api_key="dtl_live_Zyp15I6iw3i35nbtpf8RJCu04aKmBRT2RrDLi_zP6oA",
    api_url="http://localhost:8000/api/v1",
    debug=True,
)

TOPIC = "Impact of LLMs on software engineering productivity"

print("Running: Multi-Tool Research Agent...")

with dottle.session(
    "research-agent",
    metadata={"scenario": "success_test", "topic": TOPIC, "user_id": "user_demo_001"}
) as sid:
    print(f"  Session: {sid}")

    # ── Phase 1: Planning ────────────────────────────────────────────────────
    with dottle.span("llm", "gpt-4o: research plan") as s:
        time.sleep(0.4)
        s.record_tokens(320, 140, "gpt-4o")
        s.record_prompt(
            input_text=f"You are a research analyst. Create a detailed research plan for: '{TOPIC}'",
            output_text=(
                "Research plan:\n"
                "1. Search for recent academic papers (2023-2024)\n"
                "2. Search for developer surveys and productivity data\n"
                "3. Search for case studies from major tech companies\n"
                "4. Synthesize findings into a structured report\n"
                "5. Peer-review for accuracy"
            ),
        )
        s.set_attribute("phase", "planning")

    # ── Phase 2: Information gathering ──────────────────────────────────────
    queries = [
        ("search_papers", {"query": "LLM software engineering productivity 2024", "source": "arxiv"}),
        ("search_web",    {"query": "developer survey AI coding tools GitHub Copilot 2024"}),
        ("search_web",    {"query": "case study enterprise LLM coding productivity ROI"}),
    ]

    search_results = []
    for tool_name, args in queries:
        with dottle.span("tool", tool_name, input_args=args) as s:
            time.sleep(0.12)
            results = [f"result_{i}" for i in range(8)]
            s.set_attribute("results_count", len(results))
            s.set_attribute("query", list(args.values())[0])
            search_results.extend(results)
        time.sleep(0.05)  # small gap between calls

    # ── Phase 3: Summarization (cheaper model for bulk work) ────────────────
    with dottle.span("llm", "gpt-4o-mini: extract key findings") as s:
        time.sleep(0.6)
        s.record_tokens(1840, 520, "gpt-4o-mini")
        s.record_prompt(
            input_text=f"Here are {len(search_results)} search results about '{TOPIC}'. Extract the 10 most important findings.",
            output_text=(
                "Key findings:\n"
                "1. GitHub Copilot users complete tasks 55% faster (GitHub study, 2023)\n"
                "2. 88% of developers report improved productivity with AI coding tools\n"
                "3. Code review time reduced by 40% when using LLM-assisted review\n"
                "4. Junior developers benefit more than seniors (73% vs 48% productivity gain)\n"
                "5. Test generation is the highest-value use case (82% of users)\n"
                "6. Context window limitations remain the #1 friction point\n"
                "7. AI pair programming reduces onboarding time by 30%\n"
                "8. Hallucination rate in code: 8-12% without verification\n"
                "9. Teams using AI tools ship features 2.3x more frequently\n"
                "10. Security vulnerabilities introduced by AI code: +15% (requires human review)"
            ),
        )
        s.set_attribute("phase", "extraction")
        s.set_attribute("input_docs", len(search_results))

    # ── Phase 4: Write the report ────────────────────────────────────────────
    with dottle.span("tool", "write_file", input_args={"path": "report_llm_productivity.md", "format": "markdown"}) as s:
        time.sleep(0.08)
        s.set_attribute("file_size_bytes", 4820)
        s.set_attribute("sections", 5)

    # ── Phase 5: Final review ────────────────────────────────────────────────
    with dottle.span("llm", "gpt-4o: quality review") as s:
        time.sleep(0.35)
        s.record_tokens(890, 210, "gpt-4o")
        s.record_prompt(
            input_text="Review this research report for accuracy, completeness, and clarity. Rate 1-10.",
            output_text=(
                "Report quality score: 8.5/10\n\n"
                "Strengths: Well-structured, data-backed claims, clear recommendations.\n"
                "Gaps: Missing 2024 Q3 data, could add methodology comparison table.\n"
                "Verdict: Approved for publication with minor revisions."
            ),
        )
        s.set_attribute("phase", "review")
        s.set_attribute("quality_score", 8.5)

print(f"\nDone. Session {sid} should show status=completed in the dashboard.")
print("Open: http://localhost:3000/sessions")
