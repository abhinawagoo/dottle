from datetime import datetime
import uuid

from pydantic import BaseModel, field_validator


VALID_METRICS = {
    "loop_detected", "tool_failure_rate", "cost_per_session",
    "session_duration_ms", "iteration_count", "error_rate"
}
VALID_OPERATORS = {"gt", "lt", "gte", "lte", "eq"}
VALID_CHANNELS = {"slack", "email"}


class AlertRuleCreate(BaseModel):
    project_id: uuid.UUID
    name: str
    metric: str
    operator: str
    threshold: float
    window_minutes: int = 60
    channel: str
    destination: str
    enabled: bool = True

    @field_validator("metric")
    @classmethod
    def validate_metric(cls, v):
        if v not in VALID_METRICS:
            raise ValueError(f"metric must be one of: {VALID_METRICS}")
        return v

    @field_validator("operator")
    @classmethod
    def validate_operator(cls, v):
        if v not in VALID_OPERATORS:
            raise ValueError(f"operator must be one of: {VALID_OPERATORS}")
        return v

    @field_validator("channel")
    @classmethod
    def validate_channel(cls, v):
        if v not in VALID_CHANNELS:
            raise ValueError(f"channel must be one of: {VALID_CHANNELS}")
        return v


class AlertRuleUpdate(BaseModel):
    name: str | None = None
    metric: str | None = None
    operator: str | None = None
    threshold: float | None = None
    window_minutes: int | None = None
    channel: str | None = None
    destination: str | None = None
    enabled: bool | None = None


class AlertRuleResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    metric: str
    operator: str
    threshold: float
    window_minutes: int
    channel: str
    destination: str
    enabled: bool
    created_at: datetime
    last_fired_at: datetime | None

    model_config = {"from_attributes": True}


class AlertEventResponse(BaseModel):
    id: uuid.UUID
    alert_rule_id: uuid.UUID
    session_id: uuid.UUID | None
    fired_at: datetime
    metric_value: float
    message: str
    delivered: bool
    delivery_error: str | None

    model_config = {"from_attributes": True}
