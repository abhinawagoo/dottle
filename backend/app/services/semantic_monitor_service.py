"""
Semantic Monitor Evaluation Service
====================================
Called by APScheduler every 5 minutes.
For each enabled monitor, samples recent sessions and asks the org's LLM:
  "Does this session exhibit: <pattern_prompt>?"
If the match rate exceeds the threshold, fires a notification.
"""
import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
import sqlalchemy as sa
from sqlalchemy import select, update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_provider import OrgAIProvider
from app.models.project import Project
from app.models.session import AgentSession
from app.models.span import Span
from app.models.semantic_monitor import SemanticMonitor, MonitorEvent, MonitorSessionFlag
from app.services.notifier import dispatch_alert

logger = logging.getLogger(__name__)

TIMEOUT = 12
COOLDOWN_MINUTES = 30
MAX_SESSIONS_PER_RUN = 20   # cap to limit LLM cost per evaluation cycle
PROVIDER_PRIORITY = ["openai", "anthropic", "groq", "gemini"]


# ── Session summariser ─────────────────────────────────────────────────────────

def _summarise_session(session: AgentSession, spans: list) -> str:
    lines = [
        f"Agent: {session.agent_name}",
        f"Status: {session.status}",
        f"Duration: {session.duration_ms}ms" if session.duration_ms else "Duration: unknown",
        f"Iterations: {session.iteration_count}",
        f"Loop: {session.loop_detected}",
    ]
    if session.error_message:
        lines.append(f"Error: {session.error_message[:200]}")

    span_lines = []
    for sp in spans[:10]:
        line = f"  [{sp.span_type.upper()}] {sp.name} → {sp.status}"
        if sp.output_text:
            preview = sp.output_text[:300].replace("\n", " ")
            line += f"\n    output: {preview}"
        span_lines.append(line)

    if span_lines:
        lines.append("Trace:\n" + "\n".join(span_lines))

    return "\n".join(lines)


# ── LLM yes/no detector ───────────────────────────────────────────────────────

def _detection_prompt(pattern_prompt: str, session_summary: str) -> str:
    return f"""You are a behavioral pattern detector for AI agents.

Pattern to detect: "{pattern_prompt}"

Session data:
{session_summary}

Does this session exhibit the pattern described above?
Reply with ONLY a JSON object: {{"match": true/false, "confidence": 0.0-1.0, "reason": "one sentence"}}"""


async def _check_session(api_key: str, provider: str, pattern_prompt: str, session_summary: str) -> Optional[tuple[bool, str]]:
    """Returns (matched, reason) or None on provider error."""
    prompt = _detection_prompt(pattern_prompt, session_summary)
    try:
        if provider == "openai":
            async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                resp = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}"},
                    json={
                        "model": "gpt-4o-mini",
                        "messages": [{"role": "user", "content": prompt}],
                        "max_tokens": 120,
                        "temperature": 0.0,
                        "response_format": {"type": "json_object"},
                    },
                )
                resp.raise_for_status()
                data = json.loads(resp.json()["choices"][0]["message"]["content"])
                return bool(data.get("match", False)), str(data.get("reason", ""))

        elif provider == "anthropic":
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
                        "max_tokens": 120,
                        "messages": [{"role": "user", "content": prompt}],
                    },
                )
                resp.raise_for_status()
                text = resp.json()["content"][0]["text"].strip()
                if text.startswith("```"):
                    text = text.split("```")[1].lstrip("json").strip()
                data = json.loads(text)
                return bool(data.get("match", False)), str(data.get("reason", ""))

        elif provider == "groq":
            async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                resp = await client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}"},
                    json={
                        "model": "llama-3.1-8b-instant",
                        "messages": [{"role": "user", "content": prompt}],
                        "max_tokens": 120,
                        "temperature": 0.0,
                    },
                )
                resp.raise_for_status()
                text = resp.json()["choices"][0]["message"]["content"].strip()
                if text.startswith("```"):
                    text = text.split("```")[1].lstrip("json").strip()
                data = json.loads(text)
                return bool(data.get("match", False)), str(data.get("reason", ""))

    except Exception as exc:
        logger.warning(f"[semantic-monitor] {provider} check failed: {exc}")
        return None


# ── Main evaluation loop ──────────────────────────────────────────────────────

async def evaluate_all_monitors(db: AsyncSession) -> None:
    result = await db.execute(
        select(SemanticMonitor).where(SemanticMonitor.enabled == True)  # noqa: E712
    )
    monitors = result.scalars().all()
    for monitor in monitors:
        try:
            await evaluate_monitor(monitor, db)
        except Exception as exc:
            logger.error(f"[semantic-monitor] Error evaluating monitor {monitor.id}: {exc}")


async def evaluate_monitor(monitor: SemanticMonitor, db: AsyncSession) -> None:
    now = datetime.now(timezone.utc)
    cooldown_cutoff = now - timedelta(minutes=COOLDOWN_MINUTES)

    # Skip if within cooldown
    if monitor.last_fired_at and monitor.last_fired_at > cooldown_cutoff:
        return

    # Fetch the project to get org_id
    proj_result = await db.execute(select(Project).where(Project.id == monitor.project_id))
    project = proj_result.scalar_one_or_none()
    if not project:
        return

    # Get org's LLM providers
    prov_result = await db.execute(
        select(OrgAIProvider).where(OrgAIProvider.org_id == project.org_id)
    )
    providers = {row.provider: row.api_key_enc for row in prov_result.scalars().all()}
    if not providers:
        return

    # Pick the provider: use monitor's preferred provider if set and available,
    # otherwise fall back to the priority chain
    api_key = None
    provider_name = None
    preferred = getattr(monitor, "model_provider", None)
    if preferred and providers.get(preferred):
        api_key = providers[preferred]
        provider_name = preferred
    else:
        for p in PROVIDER_PRIORITY:
            if providers.get(p):
                api_key = providers[p]
                provider_name = p
                break
    if not api_key:
        return

    # Fetch sessions NOT yet evaluated for this monitor (use cursor to avoid re-evaluation)
    window_start = now - timedelta(minutes=monitor.window_minutes)
    # Use the later of: window_start OR session_cursor (whichever is more recent)
    cursor = monitor.session_cursor
    eval_from = max(window_start, cursor) if cursor else window_start

    sess_result = await db.execute(
        select(AgentSession)
        .where(
            AgentSession.project_id == monitor.project_id,
            AgentSession.started_at > eval_from,   # strictly newer than cursor
            AgentSession.started_at <= now,
            AgentSession.status.in_(["completed", "failed"]),
        )
        .order_by(AgentSession.started_at.asc())
        .limit(MAX_SESSIONS_PER_RUN)
    )
    sessions = sess_result.scalars().all()

    if len(sessions) < monitor.min_sessions:
        return  # not enough new sessions yet

    # Evaluate each session — store flag + reason per session
    matched_ids: list[str] = []
    evaluated = 0
    new_cursor = cursor  # will advance to the latest session we process

    for session in sessions:
        # Load spans for this session
        span_result = await db.execute(
            select(Span)
            .where(Span.session_id == session.id)
            .order_by(Span.started_at)
            .limit(10)
        )
        spans = span_result.scalars().all()

        summary = _summarise_session(session, spans)
        result = await _check_session(api_key, provider_name, monitor.pattern_prompt, summary)

        if result is None:
            continue   # provider error — don't count this session
        match, reason = result
        evaluated += 1

        # Store per-session flag
        flag = MonitorSessionFlag(
            monitor_id=monitor.id,
            session_id=session.id,
            project_id=monitor.project_id,
            matched=match,
            reason=reason or None,
        )
        db.add(flag)

        if match:
            matched_ids.append(str(session.id))

        # Advance cursor
        if new_cursor is None or session.started_at > new_cursor:
            new_cursor = session.started_at

    # Update cursor so next run only evaluates newer sessions
    if new_cursor and new_cursor != cursor:
        await db.execute(
            sa_update(SemanticMonitor)
            .where(SemanticMonitor.id == monitor.id)
            .values(session_cursor=new_cursor)
        )
        await db.commit()

    if evaluated == 0:
        return

    match_pct = (len(matched_ids) / evaluated) * 100

    if match_pct < monitor.threshold_pct:
        return  # under threshold — no alert

    # Atomically claim the firing slot
    claim = await db.execute(
        sa_update(SemanticMonitor)
        .where(
            SemanticMonitor.id == monitor.id,
            sa.or_(
                SemanticMonitor.last_fired_at.is_(None),
                SemanticMonitor.last_fired_at < cooldown_cutoff,
            ),
        )
        .values(last_fired_at=now)
        .returning(SemanticMonitor.id)
    )
    if not claim.fetchone():
        return  # another instance claimed it

    await db.commit()

    # Build AI summary for the alert
    ai_summary = (
        f"{match_pct:.0f}% of the last {evaluated} sessions matched the pattern: "
        f'"{monitor.pattern_prompt}". '
        f"Sample sessions: {', '.join(matched_ids[:3])}."
    )

    # Record the event
    event = MonitorEvent(
        id=uuid.uuid4(),
        semantic_monitor_id=monitor.id,
        project_id=monitor.project_id,
        match_pct=match_pct,
        sessions_evaluated=evaluated,
        sessions_matched=len(matched_ids),
        sample_session_ids=",".join(matched_ids[:10]),
        ai_summary=ai_summary,
    )
    db.add(event)

    # Fire notification via existing alert system
    if project.slack_webhook_url:
        from app.config import get_settings
        settings = get_settings()
        await dispatch_alert(
            channel="slack",
            destination=project.slack_webhook_url,
            rule_name=f"🧠 Semantic Monitor: {monitor.name}",
            message=ai_summary,
            metric_value=match_pct,
            metric="error_rate",   # closest existing metric type
            operator="gt",
            threshold=monitor.threshold_pct,
            window_minutes=monitor.window_minutes,
            ai_summary=ai_summary,
        )

    await db.commit()
    logger.info(
        f"[semantic-monitor] '{monitor.name}' fired: {match_pct:.1f}% match "
        f"({len(matched_ids)}/{evaluated} sessions)"
    )
