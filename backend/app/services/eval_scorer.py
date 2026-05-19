"""
Eval Runs Scoring Engine
========================
Compares an agent's JSON output against expected JSON output, field by field.

Three modes (matches AgentEvalConfig.scoring_method):
  "field_comparison"  — fuzzy match: normalises numbers, dates, booleans,
                        currency, and whitespace before comparing. Default.
  "exact_match"       — strict string equality after whitespace trim.
  "llm_judge"         — sends all fields in one batched LLM call to judge
                        semantic equivalence. Needs an api_key.

Missing fields   (in expected, absent from actual) → score 0.0
Hallucinated fields (in actual, absent from expected) → score 0.0

Public API
----------
    results = await score_outputs(expected, actual, method, config, api_key)
    summary = aggregate(results, field_weights)

    results  : list[FieldResult]
    summary  : dict  — suitable for AgentEvalRun.score_breakdown
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field as dc_field
from datetime import date, datetime
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# ── Output type ────────────────────────────────────────────────────────────────

@dataclass
class FieldResult:
    field: str
    expected: Any
    actual: Any          # None when the field was missing
    matched: bool
    score: float         # 0.0 – 1.0
    reason: str
    method: str          # "exact" | "fuzzy" | "llm" | "missing" | "hallucinated"


# ── Normalisation helpers ──────────────────────────────────────────────────────

# Strip currency symbols, thousand separators, surrounding whitespace
_CURRENCY_RE = re.compile(r"[$€£¥₹₩₪\s,]")
# Matches a bare number optionally followed by a % sign
_NUMBER_RE   = re.compile(r"^-?[\d]*\.?[\d]+%?$")

_DATE_FORMATS = [
    "%Y-%m-%d",            # 2026-03-15
    "%Y/%m/%d",            # 2026/03/15
    "%m/%d/%Y",            # 03/15/2026
    "%d/%m/%Y",            # 15/03/2026
    "%m-%d-%Y",            # 03-15-2026
    "%d-%m-%Y",            # 15-03-2026
    "%B %d %Y",            # March 15 2026
    "%B %d, %Y",           # March 15, 2026
    "%d %B %Y",            # 15 March 2026
    "%b %d %Y",            # Mar 15 2026
    "%b %d, %Y",           # Mar 15, 2026
    "%d %b %Y",            # 15 Mar 2026
    "%Y-%m-%dT%H:%M:%S",   # ISO datetime
    "%Y-%m-%dT%H:%M:%SZ",  # ISO datetime UTC
    "%d/%m/%y",            # 15/03/26
    "%m/%d/%y",            # 03/15/26
]

_BOOL_TRUE  = {"true", "yes", "1", "y", "on"}
_BOOL_FALSE = {"false", "no", "0", "n", "off"}


def _norm_str(v: Any) -> str:
    """Collapse whitespace and lowercase."""
    return re.sub(r"\s+", " ", str(v)).strip().lower()


def _try_number(v: Any) -> tuple[bool, float]:
    """
    Try to parse v as a number.
    Handles: integers, floats, "$1,240.50", "1 240", "42%", etc.
    """
    if isinstance(v, bool):
        return False, 0.0
    if isinstance(v, (int, float)):
        return True, float(v)
    if not isinstance(v, str):
        return False, 0.0
    cleaned = _CURRENCY_RE.sub("", v.strip()).rstrip("%")
    try:
        return True, float(cleaned)
    except ValueError:
        return False, 0.0


def _try_date(v: Any) -> tuple[bool, date | None]:
    """Try to parse v as a calendar date under multiple common formats."""
    if not isinstance(v, str):
        return False, None
    s = v.strip()
    for fmt in _DATE_FORMATS:
        try:
            return True, datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return False, None


def _try_bool(v: Any) -> tuple[bool, bool | None]:
    """Try to parse v as a boolean (true/false/yes/no/1/0)."""
    if isinstance(v, bool):
        return True, v
    if isinstance(v, int):
        if v in (0, 1):
            return True, bool(v)
        return False, None
    if isinstance(v, str):
        s = v.strip().lower()
        if s in _BOOL_TRUE:
            return True, True
        if s in _BOOL_FALSE:
            return True, False
    return False, None


def _is_complex(v: Any) -> bool:
    return isinstance(v, (dict, list))


def _json_canonical(v: Any) -> str:
    """Stable JSON string for complex value comparison."""
    return json.dumps(v, sort_keys=True, ensure_ascii=False)


# ── Per-field comparators ──────────────────────────────────────────────────────

def _exact_compare(fname: str, expected: Any, actual: Any) -> FieldResult:
    """
    Strict comparison: both values are stringified, whitespace-trimmed,
    then compared for equality.  No type coercion.
    """
    if _is_complex(expected) or _is_complex(actual):
        exp_s = _json_canonical(expected)
        act_s = _json_canonical(actual)
        matched = exp_s == act_s
        return FieldResult(fname, expected, actual, matched,
                           1.0 if matched else 0.0,
                           "exact JSON match" if matched else "JSON structures differ",
                           "exact")

    exp_s = str(expected).strip()
    act_s = str(actual).strip()
    matched = exp_s == act_s
    return FieldResult(fname, expected, actual, matched,
                       1.0 if matched else 0.0,
                       "exact match" if matched else f"expected {exp_s!r}, got {act_s!r}",
                       "exact")


def _fuzzy_compare(fname: str, expected: Any, actual: Any) -> FieldResult:
    """
    Fuzzy comparison. Priority:
      1. Numeric — strip currency/commas, parse float, compare (ε = 0.01 %)
      2. Date    — try N format strings, compare calendar date
      3. Boolean — true/yes/1 ↔ false/no/0
      4. Complex — canonical JSON equality
      5. String  — normalise whitespace + lowercase
    """
    # 1. Numeric
    exp_num_ok, exp_num = _try_number(expected)
    act_num_ok, act_num = _try_number(actual)
    if exp_num_ok and act_num_ok:
        if abs(exp_num) < 1e-9:
            matched = abs(act_num) < 1e-9
        else:
            matched = abs(exp_num - act_num) / abs(exp_num) < 0.0001
        return FieldResult(
            fname, expected, actual, matched,
            1.0 if matched else 0.0,
            f"numeric match ({exp_num} ≈ {act_num})" if matched
            else f"numeric mismatch: expected {exp_num}, got {act_num}",
            "fuzzy",
        )

    # 2. Date
    exp_date_ok, exp_date = _try_date(expected)
    act_date_ok, act_date = _try_date(actual)
    if exp_date_ok and act_date_ok:
        matched = exp_date == act_date
        return FieldResult(
            fname, expected, actual, matched,
            1.0 if matched else 0.0,
            f"date match ({exp_date})" if matched
            else f"date mismatch: expected {exp_date}, got {act_date}",
            "fuzzy",
        )

    # 3. Boolean
    exp_bool_ok, exp_bool = _try_bool(expected)
    act_bool_ok, act_bool = _try_bool(actual)
    if exp_bool_ok and act_bool_ok:
        matched = exp_bool == act_bool
        return FieldResult(
            fname, expected, actual, matched,
            1.0 if matched else 0.0,
            f"boolean match ({exp_bool})" if matched
            else f"boolean mismatch: expected {exp_bool}, got {act_bool}",
            "fuzzy",
        )

    # 4. Complex — fall back to canonical JSON
    if _is_complex(expected) or _is_complex(actual):
        exp_s = _json_canonical(expected)
        act_s = _json_canonical(actual)
        matched = exp_s == act_s
        return FieldResult(fname, expected, actual, matched,
                           1.0 if matched else 0.0,
                           "JSON match" if matched else "JSON structures differ",
                           "fuzzy")

    # 5. Normalised string
    exp_s = _norm_str(expected)
    act_s = _norm_str(actual)
    matched = exp_s == act_s
    return FieldResult(
        fname, expected, actual, matched,
        1.0 if matched else 0.0,
        "normalised string match" if matched
        else f"string mismatch: expected {exp_s!r}, got {act_s!r}",
        "fuzzy",
    )


# ── LLM judge (batched) ────────────────────────────────────────────────────────

_LLM_SYSTEM = """\
You are an impartial evaluator comparing AI agent outputs to ground-truth values.
For each field you will receive the expected value and the actual value returned by the agent.
Determine whether the actual value is semantically equivalent to the expected value.

Equivalence rules:
- Numbers: "$1,240" and "1240" are equivalent. "1 240.00" and "1240" are equivalent.
- Dates: "2026-03-15" and "March 15, 2026" are equivalent.
- Case: "ACME Corp" and "acme corp" are equivalent.
- Abbreviations: "Inc." and "Incorporated" may be equivalent — use judgment.
- Null/empty: an empty string is NOT equivalent to a non-empty expected value.

Return ONLY valid JSON — no markdown, no commentary:
{
  "<field_name>": {"match": <true|false>, "score": <0.0-1.0>, "reason": "<one sentence>"},
  ...
}"""


async def _llm_judge(
    pairs: dict[str, tuple[Any, Any]],   # {field: (expected, actual)}
    api_key: str,
    model: str = "claude-haiku-4-5-20251001",
) -> dict[str, FieldResult]:
    """
    Single batched LLM call for all fields.  Returns a dict of FieldResults.
    Falls back to score=0.5 for any field whose entry is unparseable.
    """
    field_lines = "\n".join(
        f'- {fname}: expected={json.dumps(exp)}, actual={json.dumps(act)}'
        for fname, (exp, act) in pairs.items()
    )
    user_msg = f"Compare these fields:\n{field_lines}"

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": api_key, "anthropic-version": "2023-06-01"},
                json={
                    "model": model,
                    "max_tokens": 1024,
                    "temperature": 0.0,
                    "system": _LLM_SYSTEM,
                    "messages": [{"role": "user", "content": user_msg}],
                },
            )
        resp.raise_for_status()
        text = resp.json()["content"][0]["text"].strip()
        # Strip markdown fences if present
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        parsed: dict = json.loads(text)
    except Exception as exc:
        logger.warning("llm_judge_call_failed error=%s", exc)
        # Return neutral 0.5 for everything so the run still completes
        return {
            fname: FieldResult(fname, exp, act, False, 0.5, f"LLM judge failed: {exc}", "llm")
            for fname, (exp, act) in pairs.items()
        }

    results: dict[str, FieldResult] = {}
    for fname, (exp, act) in pairs.items():
        entry = parsed.get(fname, {})
        try:
            score   = float(entry.get("score", 0.5))
            score   = max(0.0, min(1.0, score))
            matched = bool(entry.get("match", score >= 0.5))
            reason  = str(entry.get("reason", ""))
        except Exception:
            score, matched, reason = 0.5, False, "could not parse LLM response"
        results[fname] = FieldResult(fname, exp, act, matched, score, reason, "llm")

    return results


# ── Main entry point ───────────────────────────────────────────────────────────

async def score_outputs(
    expected: dict,
    actual: dict,
    method: str = "field_comparison",
    config: dict | None = None,
    api_key: str | None = None,
) -> list[FieldResult]:
    """
    Compare actual against expected field by field.

    Parameters
    ----------
    expected    : ground-truth dict (from DatasetItem / AgentEvalResult.expected_output)
    actual      : agent's response dict (from webhook)
    method      : "field_comparison" | "exact_match" | "llm_judge"
    config      : scoring_config from AgentEvalConfig
                    field_comparison: {"field_weights": {"total": 2.0, ...}}
                    llm_judge:        {"model": "claude-opus-4-6", "criteria": "..."}
                    exact_match:      {"fields": ["invoice_number", ...]}  # optional subset
    api_key     : Anthropic API key — required for llm_judge, ignored otherwise

    Returns
    -------
    list[FieldResult] — one entry per expected field, plus one per hallucinated field
    """
    config = config or {}
    results: list[FieldResult] = []

    exp_keys = set(expected.keys())
    act_keys = set(actual.keys()) if isinstance(actual, dict) else set()

    missing_keys      = exp_keys - act_keys
    hallucinated_keys = act_keys - exp_keys
    present_keys      = exp_keys & act_keys

    # ── Missing fields ─────────────────────────────────────────────────────────
    for fname in sorted(missing_keys):
        results.append(FieldResult(
            field=fname,
            expected=expected[fname],
            actual=None,
            matched=False,
            score=0.0,
            reason="field missing from agent output",
            method="missing",
        ))

    # ── Hallucinated fields ────────────────────────────────────────────────────
    for fname in sorted(hallucinated_keys):
        results.append(FieldResult(
            field=fname,
            expected=None,
            actual=actual[fname],
            matched=False,
            score=0.0,
            reason="field not present in expected output (hallucinated)",
            method="hallucinated",
        ))

    # ── Present fields ─────────────────────────────────────────────────────────
    if method == "llm_judge":
        if not api_key:
            logger.warning("llm_judge requested but no api_key provided; falling back to field_comparison")
            method = "field_comparison"
        else:
            judge_model = config.get("model", "claude-haiku-4-5-20251001")
            pairs = {fname: (expected[fname], actual[fname]) for fname in sorted(present_keys)}
            if pairs:
                llm_results = await _llm_judge(pairs, api_key=api_key, model=judge_model)
                results.extend(llm_results[fname] for fname in sorted(present_keys) if fname in llm_results)
            return results  # hallucinated + missing already appended above

    # exact_match or field_comparison (fuzzy)
    compare_fn = _exact_compare if method == "exact_match" else _fuzzy_compare
    for fname in sorted(present_keys):
        results.append(compare_fn(fname, expected[fname], actual[fname]))

    return results


# ── Aggregation ────────────────────────────────────────────────────────────────

def aggregate(
    results: list[FieldResult],
    field_weights: dict[str, float] | None = None,
) -> dict:
    """
    Compute overall and per-field scores from a list of FieldResults.

    field_weights: optional map of field → weight multiplier (default 1.0 each).
    Hallucinated fields are included in total_fields and matched_count but
    their weight is always 1.0 (they are never in field_weights since they
    have no expected counterpart).

    Returns a dict suitable for:
      AgentEvalResult.score            → overall_score
      AgentEvalResult.field_scores     → field_scores
      AgentEvalResult.comparison_detail → comparison_detail
      AgentEvalRun.score_breakdown     → any subset the caller wants
    """
    weights = field_weights or {}

    total_weight    = 0.0
    weighted_score  = 0.0
    field_scores:      dict[str, float] = {}
    comparison_detail: dict[str, dict]  = {}

    missing_count      = 0
    hallucinated_count = 0
    matched_count      = 0

    for r in results:
        w = weights.get(r.field, 1.0)
        field_scores[r.field] = r.score
        comparison_detail[r.field] = {
            "expected": r.expected,
            "actual":   r.actual,
            "matched":  r.matched,
            "score":    r.score,
            "reason":   r.reason,
            "method":   r.method,
        }
        total_weight   += w
        weighted_score += r.score * w
        if r.matched:
            matched_count += 1
        if r.method == "missing":
            missing_count += 1
        elif r.method == "hallucinated":
            hallucinated_count += 1

    overall = round(weighted_score / total_weight, 4) if total_weight > 0 else 0.0

    return {
        "overall_score":       overall,
        "field_scores":        field_scores,
        "comparison_detail":   comparison_detail,
        "total_fields":        len(results),
        "matched_count":       matched_count,
        "missing_count":       missing_count,
        "hallucinated_count":  hallucinated_count,
    }
