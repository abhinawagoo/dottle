# Dottle Python SDK

Instrument your AI agents in 3 lines of code.

```bash
pip install dottle
```

```python
import dottle

dottle.configure(api_key="dtl_live_...", api_url="http://localhost:8000/api/v1")

with dottle.session("my-agent") as sid:
    with dottle.span("llm", "gpt-4o call") as s:
        s.record_tokens(512, 128, "gpt-4o")
```
