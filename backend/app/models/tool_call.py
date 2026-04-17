import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, Integer, ForeignKey, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ToolCall(Base):
    """
    Denormalized fast-lookup table for tool calls.
    Derived from spans where span_type='tool'.
    Enables fast tool failure rate queries without full span table scans.
    """
    __tablename__ = "tool_calls"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    span_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("spans.id", ondelete="CASCADE"), nullable=False
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agent_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )

    tool_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error_type: Mapped[str | None] = mapped_column(String(255), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # MD5 hash of input args — used for repeated identical call detection
    input_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)

    called_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)

    session: Mapped["AgentSession"] = relationship("AgentSession", back_populates="tool_calls")
