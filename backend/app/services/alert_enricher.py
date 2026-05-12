"""
AI-powered alert enrichment.

When an alert fires, this module calls the org's configured LLM provider
to generate a plain-English explanation of what's happening and what to do.

Provider priority: openai → anthropic → groq → gemini → (skip, send without summary)
Models used are the cheapest/fastest per provider — alert enrichment should be
sub-second and low-cost. Switch to a centralized Dottle model once available.
"""
import logging
from typing import Optional
import uuid

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_provider import OrgAIProvider

logger = logging.getLogger(__name__)

TIMEOUT = 12  # seconds — don't let enrichment delay the alert notification

METRIC_LABELS = {
    "loop_detected":       "Agent Loop Count",
    "tool_failure_rate":   "Tool Failure Rate",
    "cost_per_session":    "Cost per Session",
    "session_duration_ms": "Session Duration (p95)",
    "iteration_count":     "Max Agent Iterations",
    "error_rate":          "Session Error Rate",
}
METRIC_UNITS = {
    "loop_detected":       "loops",
    "tool_failure_rate":   "%",
    "cost_per_session":    "USD",
    "session_duration_ms": "ms",
    "iteration_count":     "iterations",
    "error_rate":          "%",
}
OPERATOR_LABELS = {
    "gt": "above", "gte": "at or above",
    "lt": "below", "lte": "at or below", "eq": "equal to",
}


def _build_prompt(
    rule_name: str,
    metric: str,
    metric_value: float,
    operator: str,
    threshold: float,
    window_minutes: int,
) -> str:
    label = METRIC_LABELS.get(metric, metric)
    unit = METRIC_UNITS.get(metric, "")
    op_label = OPERATOR_LABELS.get(operator, operator)

    if metric == "cost_per_session":
        value_str = f"${metric_value:.4f}"
        threshold_str = f"${threshold:.2f}"
    elif metric in ("tool_failure_rate", "error_rate"):
        value_str = f"{metric_value:.1f}%"
        threshold_str = f"{threshold}{unit}"
    elif metric == "session_duration_ms":
        value_str = f"{metric_value / 1000:.1f}s ({metric_value:,.0f}ms)"
        threshold_str = f"{threshold}{unit}"
    else:
        value_str = f"{metric_value:,.1f} {unit}".strip()
        threshold_str = f"{threshold} {unit}".strip()

    return f"""You are an AI operations assistant for an AI agent monitoring platform.

An alert has just fired in production:

Alert rule: "{rule_name}"
Metric: {label}
Current value: {value_str} (threshold: {op_label} {threshold_str})
Evaluated over: last {window_minutes} minutes

In 2–3 concise sentences, tell the on-call engineer:
1. What this metric means and why this alert matters right now
2. The most likely cause (be specific — mention things like a recent deploy, a stuck agent, a failing external API, cost overrun, etc.)
3. The single most important first action to take

Write in plain English. No bullet points, no headers, no markdown. Just clear, direct prose an engineer can act on immediately."""


async def _call_openai(api_key: str, prompt: str) -> Optional[str]:
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "model": "gpt-4o-mini",
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 200,
                    "temperature": 0.3,
                },
            )
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"].strip()
    except Exception as exc:
        logger.warning(f"[alert-enricher] OpenAI call failed: {exc}")
        return None


async def _call_anthropic(api_key: str, prompt: str) -> Optional[str]:
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": "claude-haiku-4-5-20251001",
                    "max_tokens": 200,
                    "messages": [{"role": "user", "content": prompt}],
                },
            )
            resp.raise_for_status()
            return resp.json()["content"][0]["text"].strip()
    except Exception as exc:
        logger.warning(f"[alert-enricher] Anthropic call failed: {exc}")
        return None


async def _call_groq(api_key: str, prompt: str) -> Optional[str]:
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "model": "llama-3.1-8b-instant",
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 200,
                    "temperature": 0.3,
                },
            )
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"].strip()
    except Exception as exc:
        logger.warning(f"[alert-enricher] Groq call failed: {exc}")
        return None


async def _call_gemini(api_key: str, prompt: str) -> Optional[str]:
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}",
                json={"contents": [{"parts": [{"text": prompt}]}]},
            )
            resp.raise_for_status()
            return resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
    except Exception as exc:
        logger.warning(f"[alert-enricher] Gemini call failed: {exc}")
        return None


PROVIDER_CALLERS = {
    "openai":    _call_openai,
    "anthropic": _call_anthropic,
    "groq":      _call_groq,
    "gemini":    _call_gemini,
}
# Priority order — cheapest/fastest first
PROVIDER_PRIORITY = ["openai", "anthropic", "groq", "gemini"]


async def enrich_alert(
    org_id: uuid.UUID,
    rule_name: str,
    metric: str,
    metric_value: float,
    operator: str,
    threshold: float,
    window_minutes: int,
    db: AsyncSession,
) -> Optional[str]:
    """
    Returns an AI-generated plain-English summary, or None if no provider
    is configured or all calls fail. Never raises — alert delivery must not
    be blocked by enrichment failure.
    """
    try:
        result = await db.execute(
            select(OrgAIProvider).where(OrgAIProvider.org_id == org_id)
        )
        providers = {row.provider: row.api_key_enc for row in result.scalars().all()}

        if not providers:
            return None

        prompt = _build_prompt(rule_name, metric, metric_value, operator, threshold, window_minutes)

        for provider_name in PROVIDER_PRIORITY:
            api_key = providers.get(provider_name)
            if not api_key:
                continue
            caller = PROVIDER_CALLERS[provider_name]
            summary = await caller(api_key, prompt)
            if summary:
                logger.info(f"[alert-enricher] Enriched via {provider_name}")
                return summary

        return None
    except Exception as exc:
        logger.warning(f"[alert-enricher] Enrichment failed: {exc}")
        return None
