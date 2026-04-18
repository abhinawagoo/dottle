from __future__ import annotations
from datetime import datetime
from typing import Any
from pydantic import BaseModel, Field
import uuid


class SpanPayload(BaseModel):
    span_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    parent_span_id: str | None = None
    span_type: str                   # llm | tool | retrieval | agent | custom
    name: str
    status: str = "ok"
    started_at: datetime
    ended_at: datetime | None = None
    duration_ms: int | None = None

    # LLM fields
    model: str | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None

    # Prompt / response text
    input_text: str | None = None
    output_text: str | None = None

    # Error fields
    error_message: str | None = None
    error_type: str | None = None

    # Flexible attributes
    attributes: dict[str, Any] = Field(default_factory=dict)


class SessionStartPayload(BaseModel):
    session_id: str | None = None
    agent_name: str
    external_id: str | None = None
    started_at: datetime
    metadata: dict[str, Any] = Field(default_factory=dict)
    user_id: str | None = None
    user_email: str | None = None
    tags: list[str] = Field(default_factory=list)
    agent_version: str | None = None


class SessionEndPayload(BaseModel):
    session_id: str
    status: str = "completed"
    ended_at: datetime
    error_message: str | None = None
    error_type: str | None = None
    loop_detected: bool = False
    loop_reason: str | None = None
    iteration_count: int = 0


class SpanIngestPayload(BaseModel):
    session_id: str
    spans: list[SpanPayload]
