# Dottle Demo Agents

Realistic industry agents for testing features and recording demo videos.
All use mock LLM clients — no real API keys needed.

## Setup

```bash
# 1. Start the backend
cd ../backend && uvicorn app.main:app --reload

# 2. Start the frontend
cd ../frontend && npm run dev

# 3. Run demos (from this folder)
cd demos/
python run_all.py          # run everything
python 01_customer_support.py  # run one
```

## Demos

| File | Industry | Agent | Key Features |
|------|----------|-------|-------------|
| `01_customer_support.py` | E-Commerce | Support ticket handler | User attribution, tool spans, error session |
| `02_sales_agent.py` | SaaS Sales | Lead qualifier + outreach | Multi-session, disqualification, wrap_openai |
| `03_research_agent.py` | Strategy | Market research analyst | wrap_anthropic, chained LLM calls, deep mode |
| `04_code_review.py` | DevTools | PR code reviewer | Security findings, approval/block outcomes |
| `05_document_processor.py` | Finance | Invoice AP automation | Pipeline stages, duplicate detection, escalation |
| `06_loop_and_errors.py` | Any | Error & loop simulator | Failures, retry loops, fallback models |
| `07_multi_model_router.py` | AI Platform | Multi-model router | GPT-4o vs Claude, cost routing, A/B testing |

## What to look for in the dashboard

- **Sessions list**: green = success, red = failed, orange = looping
- **Cost per session**: visible across all spans with token counts
- **Span waterfall**: tool spans + LLM spans in order
- **Error details**: click a failed session to see which span threw
- **User attribution**: filter sessions by `user_email` or `user_id`
- **Tags**: filter by `prod`, `staging`, `ab-test`, etc.

## API Key & URL

Demos use the dev API key. To use a different key or point to production:

```python
dottle.configure(
    api_key="dtl_live_...",
    api_url="https://dottle-production.up.railway.app/api/v1",
)
```
