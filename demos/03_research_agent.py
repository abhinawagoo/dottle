"""
Demo 3: Market Research & Competitive Intelligence Agent
=========================================================
Industry: Strategy / Consulting / Startups
Agent: Researches a market, analyzes competitors, produces a briefing

Features demonstrated:
  - wrap_anthropic() auto-instrumentation
  - Chained LLM calls (research → analyze → synthesize)
  - Multiple tool spans (web search, scraping, database lookup)
  - session metadata for report tracking
  - Long-running session (multiple phases)

Run: python 03_research_agent.py
     Then open https://app.dottle.dev/sessions
"""

import sys, time
import _config  # loads DOTTLE_API_KEY from env, configures dottle → production
import dottle
from _mock_clients import MockAnthropic

anthropic = dottle.wrap_anthropic(MockAnthropic("research"))

BANNER = "=" * 60

RESEARCH_TASKS = [
    {
        "topic": "AI Agent Observability Market",
        "user": "cto@venturecap.io",
        "user_id": "analyst_001",
        "depth": "deep",
    },
    {
        "topic": "LLM Cost Optimization Strategies 2026",
        "user": "mlplatform@scale.ai",
        "user_id": "analyst_002",
        "depth": "standard",
    },
]


for task in RESEARCH_TASKS:
    print(BANNER)
    print(f"Research: {task['topic']}")
    print(BANNER)

    with dottle.session(
        "research-analyst-agent",
        user_email=task["user"],
        user_id=task["user_id"],
        tags=["research", task["depth"], "2026"],
        agent_version="1.3.0",
        metadata={"topic": task["topic"], "report_format": "executive_briefing"},
    ) as sid:
        print(f"  session: {sid}")

        # ── Phase 1: Discovery ────────────────────────────────────────────────

        with dottle.span("tool", "web_search") as s:
            time.sleep(0.12)
            s.set_attribute("query", f"{task['topic']} market size 2026")
            s.set_attribute("results_returned", 12)
            s.set_attribute("sources", "TechCrunch, Gartner, a16z, Sequoia Capital blog")

        with dottle.span("tool", "web_search") as s:
            time.sleep(0.09)
            s.set_attribute("query", f"{task['topic']} competitors funding rounds")
            s.set_attribute("results_returned", 8)
            s.set_attribute("sources", "Crunchbase, PitchBook, LinkedIn")

        with dottle.span("tool", "scrape_pages") as s:
            time.sleep(0.15)
            s.set_attribute("pages_scraped", 6)
            s.set_attribute("avg_page_size_kb", 42)
            s.set_attribute("content_extracted", True)

        # Phase 1 synthesis
        phase1 = anthropic.messages.create(
            model="claude-opus-4-6",
            system="You are a senior market research analyst. Synthesize web research into structured insights. Be specific with numbers and trends.",
            max_tokens=2048,
            messages=[{"role": "user", "content": f"Based on recent web research, summarize the key market dynamics for: {task['topic']}. Include: market size, growth rate, key players, and primary buyer profile."}]
        )
        print(f"  Phase 1 (Discovery): {phase1.content[0].text[:80]}...")

        # ── Phase 2: Competitive Analysis ─────────────────────────────────────

        with dottle.span("tool", "query_crunchbase") as s:
            time.sleep(0.08)
            s.set_attribute("query_type", "competitors_by_category")
            s.set_attribute("companies_found", 14)
            s.set_attribute("total_funding_analyzed_m", 312)

        with dottle.span("tool", "scrape_competitor_pricing") as s:
            time.sleep(0.11)
            s.set_attribute("competitors_analyzed", 5)
            s.set_attribute("pricing_pages_found", 4)

        phase2 = anthropic.messages.create(
            model="claude-opus-4-6",
            system="You are a senior competitive intelligence analyst. Focus on differentiation, pricing strategy, and go-to-market approach.",
            max_tokens=2048,
            messages=[{"role": "user", "content": f"Analyze the competitive landscape for {task['topic']}. Who are the top 5 players? What are their pricing models? Where are the gaps?"}]
        )
        print(f"  Phase 2 (Competitive): {phase2.content[0].text[:80]}...")

        if task["depth"] == "deep":
            # ── Phase 3: Customer Interviews (deep only) ──────────────────────

            with dottle.span("tool", "search_reddit_hn") as s:
                time.sleep(0.07)
                s.set_attribute("platforms", "Reddit r/MachineLearning, HackerNews")
                s.set_attribute("posts_analyzed", 47)
                s.set_attribute("sentiment", "mixed_positive")

            with dottle.span("tool", "analyze_g2_reviews") as s:
                time.sleep(0.06)
                s.set_attribute("reviews_analyzed", 203)
                s.set_attribute("avg_rating", 4.1)
                s.set_attribute("top_complaint", "complex setup, poor alerting")

            phase3 = anthropic.messages.create(
                model="claude-opus-4-6",
                system="You are a UX researcher analyzing voice of customer data. Extract patterns, pain points, and unmet needs.",
                max_tokens=1024,
                messages=[{"role": "user", "content": "Based on HackerNews discussions and G2 reviews, what are the top 3 unmet needs and pain points for AI observability tools?"}]
            )
            print(f"  Phase 3 (VOC): {phase3.content[0].text[:80]}...")

        # ── Phase 4: Final Briefing ───────────────────────────────────────────

        final = anthropic.messages.create(
            model="claude-opus-4-6",
            system="You are a management consultant writing an executive briefing. Structured, decisive, actionable. No fluff.",
            max_tokens=3000,
            messages=[{"role": "user", "content": f"Write a 1-page executive briefing on {task['topic']}. Include: market opportunity, competitive positioning, recommended action. Format as structured markdown."}]
        )
        print(f"  Final briefing: {final.content[0].text[:100]}...")

        with dottle.span("tool", "save_report") as s:
            time.sleep(0.04)
            s.set_attribute("report_id", f"RPT-2026-{task['user_id']}")
            s.set_attribute("format", "markdown")
            s.set_attribute("pages", 4 if task["depth"] == "deep" else 2)
            s.set_attribute("sent_to_email", task["user"])

    print(f"  ✓ Report complete\n")


print(BANNER)
print("Research agent run complete.")
print("Open https://app.dottle.dev/sessions to review.")
print(BANNER)
