from datetime import datetime
from typing import Any
import uuid

from pydantic import BaseModel


class IssueResponse(BaseModel):
    id: uuid.UUID
    issue_type: str
    severity: str
    title: str
    description: str
    span_id: uuid.UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}


class SpanResponse(BaseModel):
    id: uuid.UUID
    parent_span_id: uuid.UUID | None
    span_type: str
    name: str
    status: str
    started_at: datetime
    ended_at: datetime | None
    duration_ms: int | None
    model: str | None
    input_tokens: int | None
    output_tokens: int | None
    cost_usd: float | None
    input_text: str | None
    output_text: str | None
    error_message: str | None
    error_type: str | None
    attributes: dict[str, Any]

    model_config = {"from_attributes": True}


class SessionResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    agent_name: str
    external_id: str | None
    status: str
    started_at: datetime
    ended_at: datetime | None
    duration_ms: int | None
    total_cost_usd: float | None
    total_tokens: int | None
    input_tokens: int | None
    output_tokens: int | None
    iteration_count: int
    loop_detected: bool
    loop_reason: str | None
    error_message: str | None
    error_type: str | None
    metadata: dict[str, Any]
    created_at: datetime
    # Attribution + tagging
    user_id: str | None = None
    user_email: str | None = None
    tags: list[str] = []
    agent_version: str | None = None

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_with_metadata(cls, obj):
        data = {c.name: getattr(obj, c.name) for c in obj.__table__.columns}
        # Remap metadata_ -> metadata
        data["metadata"] = obj.metadata_
        return cls(**data)


class SessionDetailResponse(SessionResponse):
    spans: list[SpanResponse] = []
    issues: list[IssueResponse] = []

    model_config = {"from_attributes": True}


class SessionListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    items: list[SessionResponse]
