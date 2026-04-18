"""
PII redaction for prompt/response text.
Runs regex patterns over text before it's sent to the Dottle backend.
Enable with: dottle.configure(redact_pii=True)
"""
from __future__ import annotations
import re

# ── Patterns ──────────────────────────────────────────────────────────────────
_PATTERNS: list[tuple[re.Pattern, str]] = [
    # Email addresses
    (re.compile(r'\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b'), '[EMAIL]'),
    # Phone numbers (various formats)
    (re.compile(r'\b(?:\+?\d{1,3}[\s\-.]?)?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}\b'), '[PHONE]'),
    # Credit card numbers (basic: 16 digits with spaces/dashes)
    (re.compile(r'\b(?:\d{4}[\s\-]?){3}\d{4}\b'), '[CARD]'),
    # SSN (US)
    (re.compile(r'\b\d{3}[\s\-]\d{2}[\s\-]\d{4}\b'), '[SSN]'),
    # IP addresses
    (re.compile(r'\b(?:\d{1,3}\.){3}\d{1,3}\b'), '[IP]'),
    # API keys / tokens (long alphanumeric strings with common prefixes)
    (re.compile(r'\b(?:sk|pk|api|key|token|secret)[-_]?[A-Za-z0-9_\-]{20,}\b', re.IGNORECASE), '[API_KEY]'),
    # Bearer tokens
    (re.compile(r'Bearer\s+[A-Za-z0-9\-_.~+/]+=*', re.IGNORECASE), 'Bearer [TOKEN]'),
]


def redact(text: str) -> str:
    """Apply all PII redaction patterns to the input text."""
    for pattern, replacement in _PATTERNS:
        text = pattern.sub(replacement, text)
    return text


def maybe_redact(text: str | None, enabled: bool) -> str | None:
    if not enabled or not text:
        return text
    return redact(text)
