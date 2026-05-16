"""
Auto Quality Scorer
===================
Runs automatically after every session ends (non-blocking background task).
Scores four dimensions and stores them as Score rows:

  auto_quality          — 0.0–1.0  overall quality (weighted avg)
  auto_task_completion  — 0.0–1.0  did the agent accomplish the goal?
  auto_coherence        — 0.0–1.0  were responses logical and on-topic?
  auto_efficiency       — 0.0–1.0  minimal steps/tokens relative to task?

Uses the org's configured LLM provider (same priority chain as alert_enricher).
Gracefully skips if no provider configured or scoring fails — never blocks ingest.
"""
import json
import logging
import uuid
from typing import Optional

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_provider import OrgAIProvider
from app.models.score import Score

logger = logging.getLogger(__name__)

TIMEOUT = 15

PROVIDER_PRIORITY = ["openai", "anthropic", "groq", "gemini"]

# ── Prompt builder ─────────────────────────────────────────────────────────────

def _build_prompt(
    agent_name: str,
    status: str,
    duration_ms: int | None,
    total_tokens: int | None,
    iteration_count: int,
    loop_detected: bool,
    error_message: str | None,
    spans: list[dict],
) -> str:
    span_summary_lines = []
    for sp in spans[:25]:  # cap at 25 spans to stay within token budget
        line = f"  [{sp['span_type'].upper()}] {sp['name']} → {sp['status']}"
        if sp.get("duration_ms"):
            line += f" ({sp['duration_ms']}ms)"
        if sp.get("error_message"):
            line += f" ERROR: {sp['error_message'][:120]}"
        if sp.get("output_text"):
            preview = sp["output_text"][:200].replace("\n", " ")
            line += f"\n    output: {preview}"
        span_summary_lines.append(line)

    span_block = "\n".join(span_summary_lines) if span_summary_lines else "  (no spans recorded)"

    return f"""You are an expert AI agent quality evaluator. Score the following agent session objectively.

## Session
Agent: {agent_name}
Status: {status}
Duration: {f"{duration_ms}ms" if duration_ms else "unknown"}
Total tokens: {total_tokens or "unknown"}
Iterations: {iteration_count}
Loop detected: {loop_detected}
Error: {error_message or "none"}

## Execution trace
{span_block}

## Instructions
Score the session on exactly these four dimensions (each 0.0–1.0, two decimal places):

1. task_completion  — Did the agent fully accomplish its goal?
   (1.0 = perfect, 0.5 = partial, 0.0 = failed or refused)

2. coherence  — Were the agent's actions and outputs logical, relevant, and on-topic?
   (1.0 = fully coherent, 0.5 = some confusion, 0.0 = incoherent/hallucinating)

3. efficiency  — Did the agent complete the task with minimal unnecessary steps/tokens?
   (1.0 = very efficient, 0.5 = some waste, 0.0 = looping/excessive)

4. overall_quality  — Weighted holistic score (task_completion 50%, coherence 30%, efficiency 20%)

Return ONLY a JSON object, no commentary:
{{"task_completion": 0.00, "coherence": 0.00, "efficiency": 0.00, "overall_quality": 0.00, "reasoning": "one sentence"}}"""


# ── Provider callers ───────────────────────────────────────────────────────────

async def _call_openai(api_key: str, prompt: str) -> Optional[dict]:
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "model": "gpt-4o-mini",
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 150,
                    "temperature": 0.1,
                    "response_format": {"type": "json_object"},
                },
            )
            resp.raise_for_status()
            text = resp.json()["choices"][0]["message"]["content"].strip()
            return json.loads(text)
    except Exception as exc:
        logger.warning(f"[auto-quality] OpenAI failed: {exc}")
        return None


async def _call_anthropic(api_key: str, prompt: str) -> Optional[dict]:
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
                    "max_tokens": 150,
                    "messages": [{"role": "user", "content": prompt}],
                },
            )
            resp.raise_for_status()
            text = resp.json()["content"][0]["text"].strip()
            # strip markdown fences if present
            if text.startswith("```"):
                text = text.split("```")[1].lstrip("json").strip()
            return json.loads(text)
    except Exception as exc:
        logger.warning(f"[auto-quality] Anthropic failed: {exc}")
        return None


async def _call_groq(api_key: str, prompt: str) -> Optional[dict]:
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "model": "llama-3.1-8b-instant",
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 150,
                    "temperature": 0.1,
                },
            )
            resp.raise_for_status()
            text = resp.json()["choices"][0]["message"]["content"].strip()
            if text.startswith("```"):
                text = text.split("```")[1].lstrip("json").strip()
            return json.loads(text)
    except Exception as exc:
        logger.warning(f"[auto-quality] Groq failed: {exc}")
        return None


async def _call_gemini(api_key: str, prompt: str) -> Optional[dict]:
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}",
                json={"contents": [{"parts": [{"text": prompt}]}]},
            )
            resp.raise_for_status()
            text = resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
            if text.startswith("```"):
                text = text.split("```")[1].lstrip("json").strip()
            return json.loads(text)
    except Exception as exc:
        logger.warning(f"[auto-quality] Gemini failed: {exc}")
        return None


CALLERS = {
    "openai":    _call_openai,
    "anthropic": _call_anthropic,
    "groq":      _call_groq,
    "gemini":    _call_gemini,
}


# ── Main entry point ───────────────────────────────────────────────────────────

async def score_session(
    session_id: uuid.UUID,
    project_id: uuid.UUID,
    org_id: uuid.UUID,
    agent_name: str,
    status: str,
    duration_ms: int | None,
    total_tokens: int | None,
    iteration_count: int,
    loop_detected: bool,
    error_message: str | None,
    spans: list[dict],
    db: AsyncSession,
    preferred_provider: Optional[str] = None,
) -> None:
    """
    Called as a background task after session ends.
    Scores the session and stores results in the scores table.
    Never raises — any failure is logged and swallowed.
    preferred_provider: if set, try this provider first before falling back.
    """
    try:
        # Get org's LLM providers
        result = await db.execute(
            select(OrgAIProvider).where(OrgAIProvider.org_id == org_id)
        )
        providers = {row.provider: row.api_key_enc for row in result.scalars().all()}

        if not providers:
            logger.debug(f"[auto-quality] No AI providers for org {org_id}, skipping")
            return

        prompt = _build_prompt(
            agent_name=agent_name,
            status=status,
            duration_ms=duration_ms,
            total_tokens=total_tokens,
            iteration_count=iteration_count,
            loop_detected=loop_detected,
            error_message=error_message,
            spans=spans,
        )

        # Build provider order: preferred first, then the standard priority chain
        order = []
        if preferred_provider and preferred_provider in CALLERS:
            order.append(preferred_provider)
        for p in PROVIDER_PRIORITY:
            if p not in order:
                order.append(p)

        # Try providers in order
        scores_dict: Optional[dict] = None
        provider_used: str = ""
        for provider_name in order:
            api_key = providers.get(provider_name)
            if not api_key:
                continue
            scores_dict = await CALLERS[provider_name](api_key, prompt)
            if scores_dict:
                provider_used = provider_name
                break

        if not scores_dict:
            logger.info(f"[auto-quality] All providers failed for session {session_id}")
            return

        # Clamp all values to 0.0–1.0
        def clamp(v) -> float:
            try:
                return max(0.0, min(1.0, float(v)))
            except Exception:
                return 0.5

        overall      = clamp(scores_dict.get("overall_quality",    0.5))
        task_compl   = clamp(scores_dict.get("task_completion",    0.5))
        coherence    = clamp(scores_dict.get("coherence",          0.5))
        efficiency   = clamp(scores_dict.get("efficiency",         0.5))
        reasoning    = str(scores_dict.get("reasoning", ""))[:500]

        model_tag = f"{provider_used}/auto-quality"

        # Store individual dimension scores + overall
        rows = [
            Score(
                id=uuid.uuid4(),
                project_id=project_id,
                session_id=session_id,
                name="auto_quality",
                value=overall,
                comment=reasoning,
                source="model",
                model_name=model_tag,
            ),
            Score(
                id=uuid.uuid4(),
                project_id=project_id,
                session_id=session_id,
                name="auto_task_completion",
                value=task_compl,
                source="model",
                model_name=model_tag,
            ),
            Score(
                id=uuid.uuid4(),
                project_id=project_id,
                session_id=session_id,
                name="auto_coherence",
                value=coherence,
                source="model",
                model_name=model_tag,
            ),
            Score(
                id=uuid.uuid4(),
                project_id=project_id,
                session_id=session_id,
                name="auto_efficiency",
                value=efficiency,
                source="model",
                model_name=model_tag,
            ),
        ]
        for row in rows:
            db.add(row)
        await db.commit()

        logger.info(
            f"[auto-quality] session={session_id} overall={overall:.2f} "
            f"task={task_compl:.2f} coherence={coherence:.2f} "
            f"efficiency={efficiency:.2f} provider={provider_used}"
        )

    except Exception as exc:
        logger.warning(f"[auto-quality] Failed for session {session_id}: {exc}")
