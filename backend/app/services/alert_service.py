"""
Alert rule evaluation engine.
Called by the APScheduler worker every 60 seconds.
"""
import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alert import AlertRule, AlertEvent
from app.models.session import AgentSession
from app.models.tool_call import ToolCall
from app.services.notifier import dispatch_alert

logger = logging.getLogger(__name__)

OPERATOR_FNS = {
    "gt":  lambda v, t: v > t,
    "lt":  lambda v, t: v < t,
    "gte": lambda v, t: v >= t,
    "lte": lambda v, t: v <= t,
    "eq":  lambda v, t: v == t,
}

COOLDOWN_MINUTES = 30  # don't re-fire the same rule within this window


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

    # Cooldown check
    if rule.last_fired_at:
        elapsed = (now - rule.last_fired_at).total_seconds() / 60
        if elapsed < COOLDOWN_MINUTES:
            return

    window_start = now - timedelta(minutes=rule.window_minutes)
    metric_value = await _compute_metric(rule.metric, rule.project_id, window_start, db)

    if metric_value is None:
        return

    op_fn = OPERATOR_FNS.get(rule.operator)
    if op_fn is None:
        return

    if op_fn(metric_value, float(rule.threshold)):
        await _fire_alert(rule, metric_value, db)


async def _compute_metric(
    metric: str,
    project_id: uuid.UUID,
    window_start: datetime,
    db: AsyncSession
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


async def _fire_alert(rule: AlertRule, metric_value: float, db: AsyncSession) -> None:
    from app.models.project import Project
    now = datetime.now(timezone.utc)
    message = (
        f"Alert *{rule.name}* fired.\n"
        f"Metric `{rule.metric}` is `{metric_value}` "
        f"({rule.operator} {rule.threshold}) "
        f"in the last {rule.window_minutes} minutes."
    )

    delivered, error = await dispatch_alert(
        channel=rule.channel,
        destination=rule.destination,
        rule_name=rule.name,
        message=message,
        metric_value=metric_value,
    )

    # Also notify via project-level Slack webhook (if configured and not already using slack rule)
    if rule.channel != "slack":
        proj_result = await db.execute(select(Project).where(Project.id == rule.project_id))
        project = proj_result.scalar_one_or_none()
        if project and project.slack_webhook_url:
            await dispatch_alert(
                channel="slack",
                destination=project.slack_webhook_url,
                rule_name=rule.name,
                message=message,
                metric_value=metric_value,
            )

    event = AlertEvent(
        id=uuid.uuid4(),
        alert_rule_id=rule.id,
        metric_value=metric_value,
        message=message,
        delivered=delivered,
        delivery_error=error,
    )
    db.add(event)

    rule.last_fired_at = now
    await db.commit()

    logger.info(f"Alert fired: {rule.name} | metric={metric_value} | delivered={delivered}")
