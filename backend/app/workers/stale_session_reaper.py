"""
Stale Session Reaper
====================
Background worker that marks sessions stuck in "running" state as "timed_out".

A session is considered stale if:
- status == "running"
- started_at < now - STALE_THRESHOLD_MINUTES

On expiry the reaper:
1. Sets status = "timed_out", ended_at = now, duration_ms computed
2. Runs issue detection (tool failures, high latency, etc.) on the session's spans
   so issues are still surfaced even when the SDK never called end_session()

Runs every POLL_INTERVAL_SECONDS via APScheduler (shared scheduler with alert_worker).
"""
import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload

from app.database import AsyncSessionLocal
from app.models.session import AgentSession
from app.models.issue import SessionIssue
from app.services.issue_detector import detect_all, SessionSnapshot

logger = logging.getLogger(__name__)

STALE_THRESHOLD_MINUTES = 30
POLL_INTERVAL_SECONDS = 300  # every 5 minutes


async def reap_stale_sessions() -> int:
    """
    Find sessions stuck in 'running' and mark them 'timed_out'.
    Returns the number of sessions reaped.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=STALE_THRESHOLD_MINUTES)

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(AgentSession)
            .where(
                and_(
                    AgentSession.status == "running",
                    AgentSession.started_at < cutoff,
                )
            )
            .options(selectinload(AgentSession.spans))
        )
        stale = result.scalars().all()

        if not stale:
            return 0

        now = datetime.now(timezone.utc)
        reaped = 0

        for session in stale:
            started = session.started_at
            if started.tzinfo is None:
                started = started.replace(tzinfo=timezone.utc)

            duration_ms = int((now - started).total_seconds() * 1000)

            session.status = "timed_out"
            session.ended_at = now
            session.duration_ms = duration_ms

            # Run issue detection on whatever spans were captured
            span_dicts = [
                {
                    "id": str(sp.id),
                    "span_type": sp.span_type,
                    "name": sp.name,
                    "status": sp.status,
                    "duration_ms": sp.duration_ms,
                    "input_tokens": sp.input_tokens,
                    "output_tokens": sp.output_tokens,
                    "input_text": sp.input_text,
                    "output_text": sp.output_text,
                    "error_message": sp.error_message,
                    "error_type": sp.error_type,
                }
                for sp in (session.spans or [])
            ]

            snapshot = SessionSnapshot(
                session_id=session.id,
                project_id=session.project_id,
                status="timed_out",
                duration_ms=duration_ms,
                total_cost_usd=float(session.total_cost_usd) if session.total_cost_usd else None,
                total_tokens=session.total_tokens,
                iteration_count=session.iteration_count,
                loop_detected=session.loop_detected,
                loop_reason=session.loop_reason,
                error_message=session.error_message,
                error_type=session.error_type,
                spans=span_dicts,
            )

            issues = detect_all(snapshot)
            # Also add a "timed_out" issue so it shows on the issues board
            from app.services.issue_detector import IssueResult
            issues.append(IssueResult(
                issue_type="session_timed_out",
                severity="high",
                title="Session timed out — never received end_session()",
                description=(
                    f"This session started but `end_session()` was never called. "
                    f"After {STALE_THRESHOLD_MINUTES} minutes it was automatically marked as timed out.\n\n"
                    f"**Common causes:**\n"
                    f"- The agent process crashed or was killed\n"
                    f"- An unhandled exception prevented the SDK teardown\n"
                    f"- `end_session()` is missing from a `finally` block\n\n"
                    f"**Fix:** Wrap your agent in a `try/finally` block and always call "
                    f"`session.end()` (or use the context manager `async with dottle.session(...)`)."
                ),
            ))

            for issue in issues:
                db.add(SessionIssue(
                    session_id=session.id,
                    project_id=session.project_id,
                    issue_type=issue.issue_type,
                    severity=issue.severity,
                    title=issue.title,
                    description=issue.description,
                    span_id=issue.span_id,
                ))

            reaped += 1
            logger.info(
                "Reaped stale session",
                session_id=str(session.id),
                duration_min=duration_ms // 60000,
                issues_detected=len(issues),
            )

        await db.commit()
        return reaped


async def _run_reaper():
    try:
        count = await reap_stale_sessions()
        if count:
            logger.info(f"Stale session reaper: expired {count} session(s)")
    except Exception as exc:
        logger.error(f"Stale session reaper error: {exc}", exc_info=True)


def start_reaper(scheduler):
    """Register the reaper job on an existing APScheduler instance."""
    scheduler.add_job(
        _run_reaper,
        trigger="interval",
        seconds=POLL_INTERVAL_SECONDS,
        id="stale_session_reaper",
        replace_existing=True,
        max_instances=1,
    )
    logger.info(f"Stale session reaper registered (threshold={STALE_THRESHOLD_MINUTES}m, interval={POLL_INTERVAL_SECONDS}s)")
