import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, and_, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.session import AgentSession
from app.models.tool_call import ToolCall
from app.schemas.metrics import (
    MetricsSummary, CostOverTimeResponse, CostBucket,
    ToolFailureRatesResponse, ToolFailureStat,
    LatencyDistributionResponse, LatencyPercentiles,
    RegressionReport, VersionSnapshot, RegressionDelta,
)

router = APIRouter(prefix="/metrics", tags=["metrics"])


def _default_from() -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=7)


@router.get("/summary", response_model=MetricsSummary)
async def get_summary(
    project_id: uuid.UUID,
    from_: datetime | None = Query(None, alias="from"),
    to: datetime | None = None,
    db: AsyncSession = Depends(get_db),
):
    from_ = from_ or _default_from()
    to = to or datetime.now(timezone.utc)

    conditions = [
        AgentSession.project_id == project_id,
        AgentSession.started_at >= from_,
        AgentSession.started_at <= to,
    ]

    # Aggregate session stats
    result = await db.execute(
        select(
            func.count(AgentSession.id).label("total"),
            func.coalesce(func.sum(AgentSession.total_cost_usd), 0).label("total_cost"),
            func.coalesce(func.avg(AgentSession.total_cost_usd), 0).label("avg_cost"),
            func.coalesce(func.avg(AgentSession.duration_ms), 0).label("avg_latency"),
            func.count(AgentSession.id).filter(AgentSession.loop_detected == True).label("loop_count"),  # noqa: E712
            func.count(AgentSession.id).filter(AgentSession.status == "failed").label("failed_count"),
        ).where(and_(*conditions))
    )
    row = result.one()

    # P95 latency using percentile_cont (PostgreSQL)
    p95_result = await db.execute(
        select(
            func.percentile_cont(0.95).within_group(AgentSession.duration_ms).label("p95")
        ).where(and_(*conditions, AgentSession.duration_ms.isnot(None)))
    )
    p95_row = p95_result.one()

    # Status breakdown
    status_result = await db.execute(
        select(AgentSession.status, func.count(AgentSession.id).label("cnt"))
        .where(and_(*conditions))
        .group_by(AgentSession.status)
    )
    sessions_by_status = {r.status: r.cnt for r in status_result}

    # Tool failure rate
    tc_result = await db.execute(
        select(
            func.count(ToolCall.id).label("total"),
            func.count(ToolCall.id).filter(ToolCall.status == "error").label("errors"),
        ).where(
            ToolCall.project_id == project_id,
            ToolCall.called_at >= from_,
            ToolCall.called_at <= to,
        )
    )
    tc_row = tc_result.one()
    tool_failure_rate = round(tc_row.errors / tc_row.total * 100, 2) if tc_row.total else 0.0

    total = row.total or 0
    return MetricsSummary(
        total_sessions=total,
        total_cost_usd=float(row.total_cost or 0),
        avg_cost_per_session=float(row.avg_cost or 0),
        avg_latency_ms=float(row.avg_latency or 0),
        p95_latency_ms=float(p95_row.p95 or 0),
        loop_rate_pct=round(row.loop_count / total * 100, 2) if total else 0.0,
        tool_failure_rate_pct=tool_failure_rate,
        error_rate_pct=round(row.failed_count / total * 100, 2) if total else 0.0,
        sessions_by_status=sessions_by_status,
    )


@router.get("/cost-over-time", response_model=CostOverTimeResponse)
async def get_cost_over_time(
    project_id: uuid.UUID,
    from_: datetime | None = Query(None, alias="from"),
    to: datetime | None = None,
    granularity: str = "day",
    db: AsyncSession = Depends(get_db),
):
    from_ = from_ or _default_from()
    to = to or datetime.now(timezone.utc)

    trunc_map = {"hour": "hour", "day": "day", "week": "week"}
    trunc = trunc_map.get(granularity, "day")

    result = await db.execute(
        text("""
            SELECT
                date_trunc(:trunc, started_at) AS bucket,
                COALESCE(SUM(total_cost_usd), 0) AS cost_usd,
                COUNT(*) AS session_count,
                COALESCE(SUM(total_tokens), 0) AS token_count
            FROM agent_sessions
            WHERE project_id = :project_id
              AND started_at >= :from_
              AND started_at <= :to_
            GROUP BY bucket
            ORDER BY bucket ASC
        """),
        {
            "trunc": trunc,
            "project_id": str(project_id),
            "from_": from_,
            "to_": to,
        },
    )
    rows = result.fetchall()

    return CostOverTimeResponse(
        granularity=granularity,
        series=[
            CostBucket(
                bucket=row.bucket.isoformat(),
                cost_usd=float(row.cost_usd),
                session_count=row.session_count,
                token_count=row.token_count,
            )
            for row in rows
        ],
    )


@router.get("/tool-failure-rates", response_model=ToolFailureRatesResponse)
async def get_tool_failure_rates(
    project_id: uuid.UUID,
    from_: datetime | None = Query(None, alias="from"),
    to: datetime | None = None,
    db: AsyncSession = Depends(get_db),
):
    from_ = from_ or _default_from()
    to = to or datetime.now(timezone.utc)

    result = await db.execute(
        select(
            ToolCall.tool_name,
            func.count(ToolCall.id).label("total"),
            func.count(ToolCall.id).filter(ToolCall.status == "error").label("errors"),
            func.avg(ToolCall.duration_ms).label("avg_duration_ms"),
        )
        .where(
            ToolCall.project_id == project_id,
            ToolCall.called_at >= from_,
            ToolCall.called_at <= to,
        )
        .group_by(ToolCall.tool_name)
        .order_by(func.count(ToolCall.id).filter(ToolCall.status == "error").desc())
    )
    rows = result.fetchall()

    return ToolFailureRatesResponse(
        tools=[
            ToolFailureStat(
                tool_name=row.tool_name,
                total=row.total,
                errors=row.errors,
                failure_rate_pct=round(row.errors / row.total * 100, 2) if row.total else 0.0,
                avg_duration_ms=float(row.avg_duration_ms) if row.avg_duration_ms else None,
            )
            for row in rows
        ]
    )


@router.get("/regression", response_model=RegressionReport)
async def get_regression_report(
    project_id: uuid.UUID,
    agent_name: str | None = None,
    # Compare by version
    version_a: str | None = None,
    version_b: str | None = None,
    # OR compare by time window  (window A = baseline, window B = comparison)
    from_a: datetime | None = Query(None),
    to_a: datetime | None = Query(None),
    from_b: datetime | None = Query(None),
    to_b: datetime | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Compare two cohorts of sessions to detect regressions or improvements.

    Mode 1 — version comparison: provide version_a and version_b.
    Mode 2 — time window comparison: provide from_a/to_a and from_b/to_b.
    """
    now = datetime.now(timezone.utc)

    async def _compute_snapshot(conditions: list, label: str) -> VersionSnapshot:
        result = await db.execute(
            select(
                func.count(AgentSession.id).label("total"),
                func.coalesce(func.avg(AgentSession.total_cost_usd), 0).label("avg_cost"),
                func.coalesce(func.avg(AgentSession.duration_ms), 0).label("avg_latency"),
                func.coalesce(func.avg(AgentSession.iteration_count), 0).label("avg_iters"),
                func.count(AgentSession.id).filter(AgentSession.status == "failed").label("failed_count"),
                func.count(AgentSession.id).filter(AgentSession.loop_detected == True).label("loop_count"),  # noqa: E712
            ).where(and_(*conditions))
        )
        row = result.one()

        p95_result = await db.execute(
            select(
                func.percentile_cont(0.95).within_group(AgentSession.duration_ms).label("p95")
            ).where(and_(*conditions, AgentSession.duration_ms.isnot(None)))
        )
        p95_row = p95_result.one()

        total = row.total or 0
        return VersionSnapshot(
            label=label,
            session_count=total,
            failure_rate_pct=round(row.failed_count / total * 100, 2) if total else 0.0,
            loop_rate_pct=round(row.loop_count / total * 100, 2) if total else 0.0,
            avg_cost_usd=float(row.avg_cost or 0),
            avg_latency_ms=float(row.avg_latency or 0),
            avg_iterations=float(row.avg_iters or 0),
            p95_latency_ms=float(p95_row.p95 or 0),
        )

    base_conditions = [AgentSession.project_id == project_id]
    if agent_name:
        base_conditions.append(AgentSession.agent_name == agent_name)

    if version_a and version_b:
        conds_a = base_conditions + [AgentSession.agent_version == version_a]
        conds_b = base_conditions + [AgentSession.agent_version == version_b]
        label_a, label_b = f"v{version_a}", f"v{version_b}"
    else:
        # Default: last 14 days vs previous 14 days
        fa = from_a or (now - timedelta(days=14))
        ta = to_a or (now - timedelta(days=7))
        fb = from_b or (now - timedelta(days=7))
        tb = to_b or now
        conds_a = base_conditions + [AgentSession.started_at >= fa, AgentSession.started_at <= ta]
        conds_b = base_conditions + [AgentSession.started_at >= fb, AgentSession.started_at <= tb]
        label_a = f"{fa.strftime('%b %d')} – {ta.strftime('%b %d')}"
        label_b = f"{fb.strftime('%b %d')} – {tb.strftime('%b %d')}"

    baseline, comparison = await _compute_snapshot(conds_a, label_a), await _compute_snapshot(conds_b, label_b)

    delta = RegressionDelta(
        failure_rate_pct=round(comparison.failure_rate_pct - baseline.failure_rate_pct, 2),
        loop_rate_pct=round(comparison.loop_rate_pct - baseline.loop_rate_pct, 2),
        avg_cost_usd=round(comparison.avg_cost_usd - baseline.avg_cost_usd, 6),
        avg_latency_ms=round(comparison.avg_latency_ms - baseline.avg_latency_ms, 1),
        avg_iterations=round(comparison.avg_iterations - baseline.avg_iterations, 2),
    )

    # Verdict: regressed if any key metric got worse by >5%, improved if better
    regression_score = delta.failure_rate_pct + delta.loop_rate_pct * 0.5
    if regression_score > 5:
        verdict = "regressed"
    elif regression_score < -5:
        verdict = "improved"
    else:
        verdict = "neutral"

    return RegressionReport(baseline=baseline, comparison=comparison, delta=delta, verdict=verdict)


@router.get("/latency", response_model=LatencyDistributionResponse)
async def get_latency_distribution(
    project_id: uuid.UUID,
    from_: datetime | None = Query(None, alias="from"),
    to: datetime | None = None,
    db: AsyncSession = Depends(get_db),
):
    from_ = from_ or _default_from()
    to = to or datetime.now(timezone.utc)

    conditions = [
        AgentSession.project_id == project_id,
        AgentSession.started_at >= from_,
        AgentSession.started_at <= to,
        AgentSession.duration_ms.isnot(None),
    ]

    result = await db.execute(
        select(
            func.percentile_cont(0.50).within_group(AgentSession.duration_ms).label("p50"),
            func.percentile_cont(0.75).within_group(AgentSession.duration_ms).label("p75"),
            func.percentile_cont(0.95).within_group(AgentSession.duration_ms).label("p95"),
            func.percentile_cont(0.99).within_group(AgentSession.duration_ms).label("p99"),
        ).where(and_(*conditions))
    )
    row = result.one()

    return LatencyDistributionResponse(
        percentiles=LatencyPercentiles(
            p50_ms=float(row.p50 or 0),
            p75_ms=float(row.p75 or 0),
            p95_ms=float(row.p95 or 0),
            p99_ms=float(row.p99 or 0),
        )
    )
