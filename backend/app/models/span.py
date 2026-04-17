import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, Integer, Numeric, ForeignKey, Text, text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Span(Base):
    """
    Any timed operation inside a session: LLM call, tool call, retrieval, custom.
    Mirrors OpenTelemetry span model for future compatibility.
    """
    __tablename__ = "spans"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agent_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    parent_span_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("spans.id"), nullable=True
    )

    span_type: Mapped[str] = mapped_column(
        String(50), nullable=False, index=True
    )
    # Types: llm | tool | retrieval | agent | custom

    name: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="ok", index=True)
    # Statuses: ok | error | timeout

    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # LLM-specific
    model: Mapped[str | None] = mapped_column(String(255), nullable=True)
    input_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cost_usd: Mapped[float | None] = mapped_column(Numeric(12, 6), nullable=True)

    # Prompt / response logging
    input_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    output_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Error info
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_type: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Flexible key-value store (temperature, retrieval scores, tool args summary, etc.)
    attributes: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), nullable=False
    )

    session: Mapped["AgentSession"] = relationship("AgentSession", back_populates="spans")
    children: Mapped[list["Span"]] = relationship("Span", back_populates="parent")
    parent: Mapped["Span | None"] = relationship("Span", back_populates="children", remote_side=[id])
