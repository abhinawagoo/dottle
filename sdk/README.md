# Agentloop Python SDK

Instrument your AI agents in 3 lines of code.

```bash
pip install agentloop
```

```python
import agentloop

agentloop.configure(api_key="alp_live_...", api_url="http://localhost:8000/api/v1")

with agentloop.session("my-agent") as sid:
    with agentloop.span("llm", "gpt-4o call") as s:
        s.record_tokens(512, 128, "gpt-4o")
```
