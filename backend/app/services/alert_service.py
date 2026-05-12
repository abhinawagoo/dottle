"""
Alert rule evaluation engine.
Called by the APScheduler worker every 60 seconds.
"""
import logging
import uuid
from datetime import datetime, timedelta, timezone

import sqlalchemy as sa
from sqlalchemy import select, func, update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alert import AlertRule, AlertEvent
from app.models.session import AgentSession
from app.models.tool_call import ToolCall
from app.services.notifier import dispatch_alert
from app.services.alert_enricher import enrich_alert

logger = logging.getLogger(__name__)

OPERATOR_FNS = {
    "gt":  lambda v, t: v > t,
    "lt":  lambda v, t: v < t,
    "gte": lambda v, t: v >= t,
    "lte": lambda v, t: v <= t,
    "eq":  lambda v, t: v == t,
}

COOLDOWN_MINUTES = 30  # minimum gap between two firings of the same rule


async def evaluate_all_rules(db: AsyncSession) -> None:
    """Main entry point called by the scheduler."""
    result = await db.execute(
        select(AlertRule).where(AlertRule.enabled == True)  # noqa: E712
    )
    rules = result.scalars().all()

    for rule in rules:
        try:
            await evaluate_rule(rule, db)
        except Exception as exc:
            logger.error(f"Error evaluating alert rule {rule.id}: {exc}")


async def evaluate_rule(rule: AlertRule, db: AsyncSession) -> None:
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(minutes=COOLDOWN_MINUTES)

    # Fast path: skip if still within cooldown (avoids metric query cost)
    if rule.last_fired_at and rule.last_fired_at > cutoff:
        return

    # Compute the metric value
    window_start = now - timedelta(minutes=rule.window_minutes)
    metric_value = await _compute_metric(rule.metric, rule.project_id, window_start, db)
    if metric_value is None:
        return

    op_fn = OPERATOR_FNS.get(rule.operator)
    if op_fn is None or not op_fn(metric_value, float(rule.threshold)):
        return

    # Threshold crossed — atomically claim this firing slot.
    # Uses UPDATE ... WHERE last_fired_at < cutoff RETURNING id so that
    # concurrent worker instances (multiple Railway dynos) can't double-fire.
    claim = await db.execute(
        sa_update(AlertRule)
        .where(
            AlertRule.id == rule.id,
            sa.or_(
                AlertRule.last_fired_at.is_(None),
                AlertRule.last_fired_at < cutoff,
            ),
        )
        .values(last_fired_at=now)
        .returning(AlertRule.id)
    )
    if not claim.fetchone():
        # Another instance already claimed this firing window
        return

    await db.commit()  # Commit the timestamp claim before doing any I/O

    await _fire_alert(rule, metric_value, now, db)


async def _compute_metric(
    metric: str,
    project_id: uuid.UUID,
    window_start: datetime,
    db: AsyncSession,
) -> float | None:
    if metric == "loop_detected":
        result = await db.execute(
            select(func.count(AgentSession.id))
            .where(
                AgentSession.project_id == project_id,
                AgentSession.started_at >= window_start,
                AgentSession.loop_detected == True,  # noqa: E712
            )
        )
        return float(result.scalar() or 0)

    elif metric == "tool_failure_rate":
        result = await db.execute(
            select(
                func.count(ToolCall.id).label("total"),
                func.count(ToolCall.id).filter(ToolCall.status == "error").label("errors"),
            )
            .where(
                ToolCall.project_id == project_id,
                ToolCall.called_at >= window_start,
            )
        )
        row = result.one()
        if not row.total:
            return 0.0
        return round(row.errors / row.total * 100, 2)

    elif metric == "cost_per_session":
        result = await db.execute(
            select(func.avg(AgentSession.total_cost_usd))
            .where(
                AgentSession.project_id == project_id,
                AgentSession.started_at >= window_start,
                AgentSession.total_cost_usd.isnot(None),
            )
        )
        return float(result.scalar() or 0)

    elif metric == "session_duration_ms":
        result = await db.execute(
            select(func.percentile_cont(0.95).within_group(AgentSession.duration_ms))
            .where(
                AgentSession.project_id == project_id,
                AgentSession.started_at >= window_start,
                AgentSession.duration_ms.isnot(None),
            )
        )
        return float(result.scalar() or 0)

    elif metric == "iteration_count":
        result = await db.execute(
            select(func.max(AgentSession.iteration_count))
            .where(
                AgentSession.project_id == project_id,
                AgentSession.started_at >= window_start,
            )
        )
        return float(result.scalar() or 0)

    elif metric == "error_rate":
        result = await db.execute(
            select(
                func.count(AgentSession.id).label("total"),
                func.count(AgentSession.id).filter(AgentSession.status == "failed").label("errors"),
            )
            .where(
                AgentSession.project_id == project_id,
                AgentSession.started_at >= window_start,
            )
        )
        row = result.one()
        if not row.total:
            return 0.0
        return round(row.errors / row.total * 100, 2)

    return None


async def _fire_alert(
    rule: AlertRule,
    metric_value: float,
    fired_at: datetime,
    db: AsyncSession,
) -> None:
    from app.models.project import Project

    message = (
        f"Alert *{rule.name}* fired.\n"
        f"Metric `{rule.metric}` is `{metric_value}` "
        f"({rule.operator} {rule.threshold}) "
        f"in the last {rule.window_minutes} minutes."
    )

    # Resolve __project_slack__ sentinel → actual webhook URL + fetch org_id
    destination = rule.destination
    org_id = None

    proj_result = await db.execute(select(Project).where(Project.id == rule.project_id))
    project = proj_result.scalar_one_or_none()

    if project:
        org_id = project.org_id
        if rule.channel == "slack" and destination == "__project_slack__":
            if project.slack_webhook_url:
                destination = project.slack_webhook_url
            else:
                logger.warning(f"Alert {rule.id} uses __project_slack__ but no webhook configured")
                destination = ""

    # Generate AI-enriched summary using the org's configured LLM provider
    ai_summary: str | None = None
    if org_id:
        ai_summary = await enrich_alert(
            org_id=org_id,
            rule_name=rule.name,
            metric=rule.metric,
            metric_value=metric_value,
            operator=rule.operator,
            threshold=float(rule.threshold),
            window_minutes=rule.window_minutes,
            db=db,
        )

    # Dispatch primary notification
    delivered, error = await dispatch_alert(
        channel=rule.channel,
        destination=destination,
        rule_name=rule.name,
        message=message,
        metric_value=metric_value,
        metric=rule.metric,
        operator=rule.operator,
        threshold=float(rule.threshold),
        window_minutes=rule.window_minutes,
        ai_summary=ai_summary,
    ) if destination else (False, "No destination configured")

    # Mirror to project Slack for non-Slack rules
    if rule.channel != "slack" and project and project.slack_webhook_url:
        await dispatch_alert(
            channel="slack",
            destination=project.slack_webhook_url,
            rule_name=rule.name,
            message=message,
            metric_value=metric_value,
            metric=rule.metric,
            operator=rule.operator,
            threshold=float(rule.threshold),
            window_minutes=rule.window_minutes,
            ai_summary=ai_summary,
        )

    event = AlertEvent(
        id=uuid.uuid4(),
        alert_rule_id=rule.id,
        metric_value=metric_value,
        message=ai_summary or message,  # store richer message in history
        delivered=delivered,
        delivery_error=error,
    )
    db.add(event)
    await db.commit()

    logger.info(f"Alert fired: {rule.name} | metric={metric_value} | delivered={delivered} | enriched={ai_summary is not None}")
