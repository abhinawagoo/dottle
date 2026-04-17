from datetime import datetime
from typing import Any
import uuid

from pydantic import BaseModel, Field


class SessionStartRequest(BaseModel):
    session_id: uuid.UUID | None = None   # client-generated; server generates if absent
    agent_name: str
    external_id: str | None = None
    started_at: datetime
    metadata: dict[str, Any] = Field(default_factory=dict)

    # Attribution + tagging
    user_id: str | None = None
    user_email: str | None = None
    tags: list[str] = Field(default_factory=list)
    agent_version: str | None = None


class SessionEndRequest(BaseModel):
    session_id: uuid.UUID
    status: str = "completed"             # completed | failed
    ended_at: datetime
    error_message: str | None = None
    error_type: str | None = None
    loop_detected: bool = False
    loop_reason: str | None = None
    iteration_count: int = 0


class SpanPayload(BaseModel):
    span_id: uuid.UUID                    # client-generated
    parent_span_id: uuid.UUID | None = None
    span_type: str                        # llm | tool | retrieval | agent | custom
    name: str
    status: str = "ok"
    started_at: datetime
    ended_at: datetime | None = None
    duration_ms: int | None = None

    # LLM fields
    model: str | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None

    # Prompt / response text (optional — only send if you want to log them)
    input_text: str | None = None
    output_text: str | None = None

    # Error fields
    error_message: str | None = None
    error_type: str | None = None

    # Flexible attributes (tool args hash, temperature, etc.)
    attributes: dict[str, Any] = Field(default_factory=dict)


class SpanIngestRequest(BaseModel):
    session_id: uuid.UUID
    spans: list[SpanPayload] = Field(..., max_length=200)
