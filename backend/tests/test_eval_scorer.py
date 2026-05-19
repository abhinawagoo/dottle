"""
Tests for app/services/eval_scorer.py

Run with:  python3 -m pytest tests/test_eval_scorer.py -v
"""
import asyncio
import pytest

from app.services.eval_scorer import (
    FieldResult,
    _exact_compare,
    _fuzzy_compare,
    aggregate,
    score_outputs,
)


# ── Helpers ────────────────────────────────────────────────────────────────────

def fuzz(field, expected, actual) -> FieldResult:
    return _fuzzy_compare(field, expected, actual)


def exact(field, expected, actual) -> FieldResult:
    return _exact_compare(field, expected, actual)


# ── Exact match ────────────────────────────────────────────────────────────────

class TestExactMatch:
    def test_identical_strings(self):
        r = exact("name", "Acme Corp", "Acme Corp")
        assert r.matched and r.score == 1.0

    def test_case_sensitive(self):
        r = exact("name", "Acme Corp", "acme corp")
        assert not r.matched and r.score == 0.0

    def test_whitespace_trimmed(self):
        r = exact("ref", "  INV-001  ", "INV-001")
        assert r.matched

    def test_number_vs_string(self):
        r = exact("total", "1240", 1240)
        assert not r.matched   # "1240" != 1240 (no coercion in exact mode)

    def test_dict_equality(self):
        r = exact("addr", {"city": "NYC"}, {"city": "NYC"})
        assert r.matched

    def test_dict_inequality(self):
        r = exact("addr", {"city": "NYC"}, {"city": "LA"})
        assert not r.matched


# ── Fuzzy match — numbers ──────────────────────────────────────────────────────

class TestFuzzyNumbers:
    def test_currency_string_vs_float(self):
        assert fuzz("total", "$1,240.50", 1240.50).matched

    def test_currency_string_vs_int(self):
        assert fuzz("total", "$1,240", 1240).matched

    def test_integer_vs_float(self):
        assert fuzz("qty", 42, "42.0").matched

    def test_comma_separated(self):
        assert fuzz("amount", "1,000,000", 1_000_000).matched

    def test_euro_symbol(self):
        assert fuzz("price", "€500", "500").matched

    def test_percentage_ignored(self):
        assert fuzz("rate", "12%", 12).matched

    def test_mismatch(self):
        assert not fuzz("total", "$1,240", "$1,241").matched

    def test_zero_vs_zero(self):
        assert fuzz("discount", 0, "0.00").matched

    def test_negative(self):
        assert fuzz("balance", "-42.50", -42.5).matched


# ── Fuzzy match — dates ────────────────────────────────────────────────────────

class TestFuzzyDates:
    def test_iso_vs_long_form(self):
        assert fuzz("due", "2026-03-15", "March 15, 2026").matched

    def test_iso_vs_us_slash(self):
        assert fuzz("due", "2026-03-15", "03/15/2026").matched

    def test_long_form_vs_abbreviated(self):
        assert fuzz("due", "March 15 2026", "Mar 15 2026").matched

    def test_day_first_long(self):
        assert fuzz("date", "2026-01-20", "20 January 2026").matched

    def test_date_mismatch(self):
        assert not fuzz("date", "2026-03-15", "2026-03-16").matched

    def test_non_date_not_treated_as_date(self):
        r = fuzz("name", "March 15", "March 15")
        # "March 15" without a year doesn't parse → falls to string compare
        assert r.matched


# ── Fuzzy match — booleans ─────────────────────────────────────────────────────

class TestFuzzyBooleans:
    def test_true_variants(self):
        assert fuzz("active", True, "yes").matched
        assert fuzz("active", True, "1").matched
        assert fuzz("active", "true", True).matched

    def test_false_variants(self):
        assert fuzz("active", False, "no").matched
        assert fuzz("active", False, "0").matched
        assert fuzz("active", "false", False).matched

    def test_mismatch(self):
        assert not fuzz("active", True, False).matched
        assert not fuzz("active", "yes", "no").matched


# ── Fuzzy match — strings ──────────────────────────────────────────────────────

class TestFuzzyStrings:
    def test_case_insensitive(self):
        assert fuzz("name", "ACME CORP", "acme corp").matched

    def test_extra_whitespace(self):
        assert fuzz("ref", "INV  001", "inv 001").matched

    def test_mismatch(self):
        assert not fuzz("name", "Acme", "Ajax").matched

    def test_numeric_string_that_looks_like_date(self):
        # "123-45" is not a valid date → falls through to string compare
        r = fuzz("code", "123-45", "123-45")
        assert r.matched


# ── Missing and hallucinated ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_missing_field():
    results = await score_outputs(
        expected={"invoice_number": "INV-001", "total": 100},
        actual={"invoice_number": "INV-001"},      # total missing
    )
    missing = next(r for r in results if r.field == "total")
    assert missing.method == "missing"
    assert missing.score == 0.0
    assert missing.actual is None


@pytest.mark.asyncio
async def test_hallucinated_field():
    results = await score_outputs(
        expected={"invoice_number": "INV-001"},
        actual={"invoice_number": "INV-001", "secret": "extra"},
    )
    hall = next(r for r in results if r.field == "secret")
    assert hall.method == "hallucinated"
    assert hall.score == 0.0
    assert hall.expected is None


# ── score_outputs integration ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_field_comparison_full():
    expected = {
        "invoice_number": "INV-001",
        "vendor_name":    "Acme Corp",
        "due_date":       "2026-03-15",
        "total":          "$1,240.50",
        "paid":           True,
    }
    actual = {
        "invoice_number": "INV-001",
        "vendor_name":    "ACME CORP",      # different case → fuzzy match
        "due_date":       "March 15, 2026", # different format → fuzzy match
        "total":          "1240.5",          # no currency symbol → fuzzy match
        "paid":           "yes",             # boolean variant → fuzzy match
    }
    results = await score_outputs(expected, actual, method="field_comparison")
    assert all(r.matched for r in results), [r for r in results if not r.matched]


@pytest.mark.asyncio
async def test_exact_match_fails_on_case():
    results = await score_outputs(
        expected={"name": "Acme"},
        actual={"name": "acme"},
        method="exact_match",
    )
    assert not results[0].matched


@pytest.mark.asyncio
async def test_llm_judge_fallback_without_key():
    """Without an API key, llm_judge falls back to field_comparison."""
    results = await score_outputs(
        expected={"name": "Acme Corp"},
        actual={"name": "acme corp"},
        method="llm_judge",
        api_key=None,   # no key → falls back to fuzzy
    )
    # Fuzzy match should still pass
    assert results[0].matched


# ── aggregate ──────────────────────────────────────────────────────────────────

def test_aggregate_equal_weights():
    results = [
        FieldResult("a", "x", "x", True,  1.0, "match", "fuzzy"),
        FieldResult("b", "y", "z", False, 0.0, "no match", "fuzzy"),
    ]
    agg = aggregate(results)
    assert agg["overall_score"] == 0.5
    assert agg["matched_count"] == 1
    assert agg["total_fields"] == 2


def test_aggregate_weighted():
    results = [
        FieldResult("invoice_number", "INV", "INV", True,  1.0, "match", "fuzzy"),
        FieldResult("total",          100,   99,    False, 0.0, "miss",  "fuzzy"),
    ]
    # total has 3× the weight of invoice_number
    agg = aggregate(results, field_weights={"invoice_number": 1.0, "total": 3.0})
    # (1.0*1 + 0.0*3) / (1+3) = 0.25
    assert agg["overall_score"] == 0.25


def test_aggregate_missing_hallucinated_counts():
    results = [
        FieldResult("a", "x", None,  False, 0.0, "missing",      "missing"),
        FieldResult("b", None, "y",  False, 0.0, "hallucinated", "hallucinated"),
        FieldResult("c", "z", "z",   True,  1.0, "match",        "fuzzy"),
    ]
    agg = aggregate(results)
    assert agg["missing_count"]      == 1
    assert agg["hallucinated_count"] == 1
    assert agg["matched_count"]      == 1


def test_aggregate_empty():
    agg = aggregate([])
    assert agg["overall_score"] == 0.0
    assert agg["total_fields"]  == 0
