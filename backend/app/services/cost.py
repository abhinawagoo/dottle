"""
Token → USD cost calculator for common LLM models.
Prices are per 1M tokens (input, output).
Update this table as model pricing changes.
"""

MODEL_PRICING: dict[str, tuple[float, float]] = {
    # OpenAI
    "gpt-4o":                (2.50,  10.00),
    "gpt-4o-mini":           (0.15,   0.60),
    "gpt-4-turbo":           (10.00, 30.00),
    "gpt-4":                 (30.00, 60.00),
    "gpt-3.5-turbo":         (0.50,  1.50),
    "o1":                    (15.00, 60.00),
    "o1-mini":               (3.00,  12.00),
    "o3-mini":               (1.10,  4.40),
    # Anthropic
    "claude-opus-4-6":       (15.00, 75.00),
    "claude-sonnet-4-6":     (3.00,  15.00),
    "claude-haiku-4-5":      (0.80,  4.00),
    "claude-3-5-sonnet":     (3.00,  15.00),
    "claude-3-5-haiku":      (0.80,  4.00),
    "claude-3-opus":         (15.00, 75.00),
    # Google
    "gemini-1.5-pro":        (1.25,  5.00),
    "gemini-1.5-flash":      (0.075, 0.30),
    "gemini-2.0-flash":      (0.10,  0.40),
    # Meta / open source (approximate hosted costs)
    "llama-3.1-70b":         (0.88,  0.88),
    "llama-3.1-8b":          (0.18,  0.18),
    # Mistral
    "mistral-large":         (3.00,  9.00),
    "mistral-small":         (0.20,  0.60),
}


def compute_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    """Returns cost in USD. Returns 0.0 for unknown models."""
    model_key = model.lower().strip()
    # Try exact match first, then prefix match
    rates = MODEL_PRICING.get(model_key)
    if rates is None:
        for key, r in MODEL_PRICING.items():
            if model_key.startswith(key) or key in model_key:
                rates = r
                break
    if rates is None:
        return 0.0
    inp_rate, out_rate = rates
    return round((input_tokens * inp_rate + output_tokens * out_rate) / 1_000_000, 8)


def get_supported_models() -> list[str]:
    return sorted(MODEL_PRICING.keys())
