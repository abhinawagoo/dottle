from pydantic import BaseModel


class MetricsSummary(BaseModel):
    total_sessions: int
    total_cost_usd: float
    avg_cost_per_session: float
    avg_latency_ms: float
    p95_latency_ms: float
    loop_rate_pct: float
    tool_failure_rate_pct: float
    error_rate_pct: float
    sessions_by_status: dict[str, int]
    avg_quality_score: float | None = None   # 0.0–1.0, None if no auto-scoring yet
    scored_session_count: int = 0            # how many sessions have been scored


class CostBucket(BaseModel):
    bucket: str   # ISO date string: "2026-04-12" or "2026-04-12T10:00"
    cost_usd: float
    session_count: int
    token_count: int


class CostOverTimeResponse(BaseModel):
    granularity: str
    series: list[CostBucket]


class ToolFailureStat(BaseModel):
    tool_name: str
    total: int
    errors: int
    failure_rate_pct: float
    avg_duration_ms: float | None


class ToolFailureRatesResponse(BaseModel):
    tools: list[ToolFailureStat]


class LatencyPercentiles(BaseModel):
    p50_ms: float
    p75_ms: float
    p95_ms: float
    p99_ms: float


class LatencyDistributionResponse(BaseModel):
    percentiles: LatencyPercentiles


class VersionSnapshot(BaseModel):
    label: str                  # e.g. "v1.1.0" or "Last 7 days"
    session_count: int
    failure_rate_pct: float
    loop_rate_pct: float
    avg_cost_usd: float
    avg_latency_ms: float
    avg_iterations: float
    p95_latency_ms: float


class RegressionDelta(BaseModel):
    failure_rate_pct: float     # positive = regression, negative = improvement
    loop_rate_pct: float
    avg_cost_usd: float
    avg_latency_ms: float
    avg_iterations: float


class RegressionReport(BaseModel):
    baseline: VersionSnapshot
    comparison: VersionSnapshot
    delta: RegressionDelta
    verdict: str                # "improved" | "regressed" | "neutral"


# ── Issues Board ──────────────────────────────────────────────────────────────

class IssueGroup(BaseModel):
    issue_type: str
    severity: str
    title: str                  # most representative title
    occurrence_count: int       # total issue instances
    session_count: int          # unique sessions affected
    user_count: int             # unique users affected (where attribution exists)
    agent_names: list[str]      # which agents trigger this
    first_seen: str             # ISO datetime
    last_seen: str              # ISO datetime
    source: str = "instrumented"  # "instrumented" | "ai" (future)


class IssuesBoardResponse(BaseModel):
    total_signals: int
    groups: list[IssueGroup]
