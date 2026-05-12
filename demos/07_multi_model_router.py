"""
Demo 7: Multi-Model Routing Agent
===================================
Industry: AI Platform / Infrastructure
Agent: Routes tasks to the right model based on complexity and cost

Features demonstrated:
  - Both wrap_openai() and wrap_anthropic() in the same session
  - Cost comparison visible in dashboard (cheap vs expensive model)
  - Task classification → model selection → execution
  - Three routing strategies: cost-optimized, quality-first, speed-first

Run: python 07_multi_model_router.py
     Then open https://app.dottle.dev/sessions
"""

import sys, time
import _config  # loads DOTTLE_API_KEY from env, configures dottle → production
import dottle
from _mock_clients import MockOpenAI, MockAnthropic

# Wrap both providers — both auto-tracked in dashboard
oai = dottle.wrap_openai(MockOpenAI("generic"))
ant = dottle.wrap_anthropic(MockAnthropic("research"))

BANNER = "=" * 60

TASKS = [
    {
        "id": "task_001",
        "description": "Summarize this 3-paragraph news article into 2 sentences.",
        "complexity": "simple",
        "priority": "speed",
        "strategy": "cost-optimized",
    },
    {
        "id": "task_002",
        "description": "Analyze GDPR Article 17 compliance for a healthcare SaaS product and produce a legal memo.",
        "complexity": "complex",
        "priority": "quality",
        "strategy": "quality-first",
    },
    {
        "id": "task_003",
        "description": "Translate the following product description from English to Spanish and French.",
        "complexity": "simple",
        "priority": "speed",
        "strategy": "cost-optimized",
    },
    {
        "id": "task_004",
        "description": "Perform a multi-step financial analysis: extract KPIs from Q1 earnings, compare to guidance, and produce a buy/hold/sell recommendation.",
        "complexity": "complex",
        "priority": "quality",
        "strategy": "quality-first",
    },
]


print(BANNER)
print("Multi-Model Router — Cost Optimized Strategy")
print(BANNER)

with dottle.session(
    "llm-router-agent",
    tags=["prod", "routing", "cost-optimized"],
    agent_version="1.0.0",
    metadata={"strategy": "cost-optimized", "batch_size": len(TASKS)},
) as sid:
    print(f"  session: {sid}")

    for task in TASKS:
        # Step 1: Classify complexity
        with dottle.span("llm", "gpt-4o-mini: classify task") as s:
            time.sleep(0.08)
            s.record_tokens(145, 22, "gpt-4o-mini")
            s.record_prompt(
                input_text=f"Classify complexity: '{task['description'][:80]}'. Options: simple, complex.",
                output_text=task["complexity"],
            )
            s.set_attribute("task_id", task["id"])
            s.set_attribute("classified_as", task["complexity"])

        # Step 2: Route to appropriate model
        if task["complexity"] == "simple":
            result = oai.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "Complete the task efficiently and concisely."},
                    {"role": "user", "content": task["description"]},
                ]
            )
            model_used = "gpt-4o-mini"
        else:
            result = ant.messages.create(
                model="claude-opus-4-6",
                system="You are an expert analyst. Provide thorough, well-reasoned responses.",
                max_tokens=4096,
                messages=[{"role": "user", "content": task["description"]}]
            )
            model_used = "claude-opus-4-6"

        print(f"  [{task['id']}] {task['complexity']} → {model_used}")

        # Step 3: Quality check
        with dottle.span("llm", "gpt-4o-mini: quality check") as s:
            time.sleep(0.06)
            s.record_tokens(180, 18, "gpt-4o-mini")
            s.set_attribute("task_id", task["id"])
            s.set_attribute("quality_score", 0.94 if task["complexity"] == "complex" else 0.88)
            s.set_attribute("passed", True)

print("  ✓ Batch complete (cost-optimized routing)\n")


print(BANNER)
print("Multi-Model Router — GPT-4o vs Claude Comparison")
print(BANNER)

# Run same task through both models for A/B comparison visible in dashboard
COMPARE_TASK = "Write a cold email to a VP of Engineering at a Series B startup about an AI observability platform. Focus on cost savings and debugging speed. Under 120 words."

for model_config in [
    {"name": "gpt-4o-variant", "provider": "openai", "model": "gpt-4o", "tags": ["ab-test", "gpt4o"]},
    {"name": "claude-variant", "provider": "anthropic", "model": "claude-opus-4-6", "tags": ["ab-test", "claude"]},
]:
    with dottle.session(
        "ab-test-email-agent",
        tags=model_config["tags"],
        agent_version="1.0.0",
        metadata={"experiment": "cold-email-ab-test", "variant": model_config["name"]},
    ) as sid:
        print(f"  session: {sid} [{model_config['name']}]")

        with dottle.span("tool", "fetch_lead_context") as s:
            time.sleep(0.03)
            s.set_attribute("lead", "CTO @ HighScale.ai")
            s.set_attribute("signals", "recently posted about debugging LLM costs")

        if model_config["provider"] == "openai":
            resp = oai.chat.completions.create(
                model=model_config["model"],
                messages=[
                    {"role": "system", "content": "You are an expert SDR. Write compelling, personalized cold emails."},
                    {"role": "user", "content": COMPARE_TASK},
                ]
            )
        else:
            resp = ant.messages.create(
                model=model_config["model"],
                system="You are an expert SDR. Write compelling, personalized cold emails.",
                max_tokens=256,
                messages=[{"role": "user", "content": COMPARE_TASK}]
            )

        with dottle.span("tool", "score_email_quality") as s:
            time.sleep(0.04)
            s.set_attribute("personalization_score", 0.82 if model_config["provider"] == "openai" else 0.91)
            s.set_attribute("clarity_score", 0.88 if model_config["provider"] == "openai" else 0.85)
            s.set_attribute("cta_present", True)

    print(f"  ✓ {model_config['name']} complete\n")


print(BANNER)
print("Multi-model router demo complete.")
print("Open https://app.dottle.dev/sessions — compare:")
print("  - gpt-4o-mini vs claude-opus-4-6 cost per task")
print("  - Total session cost for cost-optimized vs quality-first routing")
print("  - A/B test sessions side by side")
print(BANNER)
