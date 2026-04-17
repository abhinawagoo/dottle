/**
 * PII redaction for prompt / response text.
 * Enable with: agentloop.configure({ ..., redactPii: true })
 */

const PATTERNS: Array<[RegExp, string]> = [
  // Email addresses
  [/\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g, "[EMAIL]"],
  // Phone numbers (various formats)
  [/\b(?:\+?\d{1,3}[\s\-.]?)?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}\b/g, "[PHONE]"],
  // Credit card numbers
  [/\b(?:\d{4}[\s\-]?){3}\d{4}\b/g, "[CARD]"],
  // SSN (US)
  [/\b\d{3}[\s\-]\d{2}[\s\-]\d{4}\b/g, "[SSN]"],
  // IP addresses
  [/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[IP]"],
  // API keys / tokens (long alphanumeric strings with common prefixes)
  [/\b(?:sk|pk|api|key|token|secret)[-_]?[A-Za-z0-9_\-]{20,}\b/gi, "[API_KEY]"],
  // Bearer tokens
  [/Bearer\s+[A-Za-z0-9\-_.~+/]+=*/gi, "Bearer [TOKEN]"],
];

export function redact(text: string): string {
  for (const [pattern, replacement] of PATTERNS) {
    text = text.replace(pattern, replacement);
  }
  return text;
}

export function maybeRedact(text: string | undefined, enabled: boolean): string | undefined {
  if (!enabled || !text) return text;
  return redact(text);
}
