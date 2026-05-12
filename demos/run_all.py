"""
Run all demos in sequence to populate the dashboard with rich data.

Usage:
    cd demos/
    python run_all.py

    # Or run individually:
    python 01_customer_support.py
    python 02_sales_agent.py
    ...

Requires: local backend running at http://localhost:8000
          (cd backend && uvicorn app.main:app --reload)
"""

import subprocess, sys, time

DEMOS = [
    ("01_customer_support.py",  "E-Commerce Customer Support Agent"),
    ("02_sales_agent.py",       "B2B Sales Development Agent"),
    ("03_research_agent.py",    "Market Research & Competitive Intelligence"),
    ("04_code_review.py",       "Automated Code Review Agent"),
    ("05_document_processor.py","Intelligent Document Processing (AP Automation)"),
    ("06_loop_and_errors.py",   "Error Scenarios & Loop Detection"),
    ("07_multi_model_router.py","Multi-Model Routing (Cost & Quality)"),
]

BANNER = "=" * 60

print(BANNER)
print("Dottle Demo Suite — Full Run")
print(f"Running {len(DEMOS)} agents...")
print(BANNER)
print()

for filename, description in DEMOS:
    print(f"▶  {description}")
    print(f"   File: {filename}")
    print("-" * 60)

    result = subprocess.run(
        [sys.executable, filename],
        capture_output=False,
    )

    if result.returncode != 0:
        print(f"   [WARNING] Exited with code {result.returncode}")

    print()
    time.sleep(0.5)  # brief pause between agents

print(BANNER)
print("All demos complete!")
print()
print("Open https://app.dottle.dev/sessions to explore:")
print("  - Green sessions = successful agent runs")
print("  - Red sessions   = failed agents (errors captured)")
print("  - Loop badges    = agents caught in retry cycles")
print("  - Costs          = token costs per session and span")
print(BANNER)
