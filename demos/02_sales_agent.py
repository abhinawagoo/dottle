"""
Demo 2: B2B Sales Development Agent
=====================================
Industry: SaaS / Sales
Agent: Researches leads, scores them, generates personalized outreach

Features demonstrated:
  - wrap_openai() auto-instrumentation
  - Manual tool spans with rich attributes
  - Multiple sessions (one per lead)
  - agent_version + tags for A/B tracking (two prompt variants)
  - A failed lead (disqualified) and a successful one

Run: python 02_sales_agent.py
     Then open https://app.dottle.dev/sessions
"""

import sys, time
import _config  # loads DOTTLE_API_KEY from env, configures dottle → production
import dottle
from _mock_clients import MockOpenAI

openai = dottle.wrap_openai(MockOpenAI("sales"))

BANNER = "=" * 60

LEADS = [
    {
        "company": "Acme Corp",
        "domain": "acmecorp.com",
        "headcount": 340,
        "funding": "Series B — $18M",
        "tech_stack": ["Python", "OpenAI API", "AWS"],
        "contact": "Alex Rivera",
        "title": "VP of Engineering",
        "email": "arivera@acmecorp.com",
        "user_id": "lead_001",
        "score": 91,
        "verdict": "qualified",
    },
    {
        "company": "TinyBiz LLC",
        "domain": "tinybiz.io",
        "headcount": 4,
        "funding": "Bootstrapped",
        "tech_stack": ["Wix", "Mailchimp"],
        "contact": "Bob Smith",
        "title": "Owner",
        "email": "bob@tinybiz.io",
        "user_id": "lead_002",
        "score": 18,
        "verdict": "disqualified",
    },
    {
        "company": "Stripe",
        "domain": "stripe.com",
        "headcount": 7200,
        "funding": "Public",
        "tech_stack": ["Python", "Go", "Anthropic API", "Kubernetes"],
        "contact": "Priya Nair",
        "title": "Staff ML Engineer",
        "email": "priya.nair@stripe.com",
        "user_id": "lead_003",
        "score": 98,
        "verdict": "qualified",
    },
]


for lead in LEADS:
    print(BANNER)
    print(f"Processing lead: {lead['company']} ({lead['verdict']})")
    print(BANNER)

    with dottle.session(
        "outreach-agent-v2",
        user_id=lead["user_id"],
        user_email=lead["email"],
        tags=["prod", "outbound", "v2-prompt"],
        agent_version="2.0.0",
        metadata={"company": lead["company"], "contact_title": lead["title"]},
    ) as sid:
        print(f"  session: {sid}")

        # Step 1: Enrich company data
        with dottle.span("tool", "enrich_company") as s:
            time.sleep(0.07)
            s.set_attribute("domain", lead["domain"])
            s.set_attribute("headcount", lead["headcount"])
            s.set_attribute("funding_stage", lead["funding"])
            s.set_attribute("tech_stack", ", ".join(lead["tech_stack"]))

        # Step 2: CRM lookup — check if existing contact
        with dottle.span("tool", "crm_lookup") as s:
            time.sleep(0.04)
            s.set_attribute("email", lead["email"])
            s.set_attribute("found_in_crm", lead["score"] > 50)
            s.set_attribute("previous_interactions", 0 if lead["score"] < 50 else 2)

        # Step 3: AI scores the lead
        with dottle.span("llm", "gpt-4o: score lead") as s:
            time.sleep(0.25)
            s.record_tokens(420, 180, "gpt-4o")
            s.record_prompt(
                input_text=f"Score this lead for Dottle (AI observability platform):\nCompany: {lead['company']}\nHeadcount: {lead['headcount']}\nFunding: {lead['funding']}\nTech: {', '.join(lead['tech_stack'])}",
                output_text=f"ICP Score: {lead['score']}/100. {'Meets all criteria: AI tech stack, right size, funded.' if lead['score'] > 50 else 'Does not meet ICP: no AI usage, too small, no budget signals.'}"
            )
            s.set_attribute("icp_score", lead["score"])
            s.set_attribute("verdict", lead["verdict"])

        if lead["verdict"] == "disqualified":
            # Log to CRM and move on — no email sent
            with dottle.span("tool", "crm_update_status") as s:
                time.sleep(0.03)
                s.set_attribute("status", "disqualified")
                s.set_attribute("reason", "below_icp_threshold")
            print(f"  Disqualified (score {lead['score']}/100) — no outreach sent\n")
            continue

        # Step 4: Research recent news / trigger events
        with dottle.span("tool", "search_news") as s:
            time.sleep(0.06)
            s.set_attribute("query", f"{lead['company']} AI ML hiring 2026")
            s.set_attribute("results", 3)
            s.set_attribute("top_signal", "Published blog post: 'Scaling our ML platform to 50 models in prod'")

        # Step 5: Generate personalized email
        email_resp = openai.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are a senior SDR at Dottle, an AI agent observability platform. Write highly personalized, concise cold emails (under 120 words). Reference specific signals. No generic pitches."},
                {"role": "user", "content": f"Write a cold email to {lead['contact']} ({lead['title']}) at {lead['company']}. They use {', '.join(lead['tech_stack'])}. Recent signal: published a blog post about scaling ML to 50 models in prod. Our product: 1-line instrumentation for AI agent observability — cost, latency, errors, loops. Offer: 30-day trial."},
            ]
        )
        print(f"  Email: {email_resp.choices[0].message.content[:100]}...")

        # Step 6: Generate LinkedIn connection request
        li_resp = openai.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "Write a LinkedIn connection request note. Under 300 characters. Personal, specific, no pitching upfront."},
                {"role": "user", "content": f"Connect with {lead['contact']} at {lead['company']}. They lead engineering. We both care about ML infrastructure."},
            ]
        )

        # Step 7: Schedule in sequences
        with dottle.span("tool", "add_to_sequence") as s:
            time.sleep(0.04)
            s.set_attribute("contact_email", lead["email"])
            s.set_attribute("sequence", "enterprise-ai-v4")
            s.set_attribute("step_1", "email_day_0")
            s.set_attribute("step_2", "linkedin_day_2")
            s.set_attribute("step_3", "email_day_5_case_study")

        with dottle.span("tool", "crm_create_opportunity") as s:
            time.sleep(0.03)
            s.set_attribute("company", lead["company"])
            s.set_attribute("estimated_arr", 24000 if lead["headcount"] < 500 else 96000)
            s.set_attribute("stage", "prospecting")

        print(f"  ✓ Outreach sent (score {lead['score']}/100)\n")


print(BANNER)
print("Sales pipeline run complete.")
print("Open https://app.dottle.dev/sessions to review lead processing.")
print(BANNER)
