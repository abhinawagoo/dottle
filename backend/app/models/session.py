import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, Boolean, Integer, Numeric, ForeignKey, Text, text
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class AgentSession(Base):
    """
    Top-level unit: one full agent run / invocation.
    Called 'session' to match Sentrial's terminology.
    """
    __tablename__ = "agent_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    external_id: Mapped[str | None] = mapped_column(String(255), nullable=True)  # caller-provided ID
    agent_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)

    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="running", index=True
    )
    # Statuses: running | completed | failed | looping | timeout

    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Cost + tokens (rolled up from spans)
    total_cost_usd: Mapped[float | None] = mapped_column(Numeric(12, 6), nullable=True)
    total_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    input_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Loop detection
    iteration_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    loop_detected: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    loop_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Error info
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_type: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # User attribution
    user_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    user_email: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)

    # Tags (e.g. ["prod", "v2", "customer:acme"])
    tags: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=True, default=list)

    # Agent version (e.g. "1.0.0", "git:abc123")
    agent_version: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)

    # Flexible metadata
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, default=dict)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), nullable=False
    )

    project: Mapped["Project"] = relationship("Project", back_populates="sessions")
    spans: Mapped[list["Span"]] = relationship(
        "Span", back_populates="session", cascade="all, delete-orphan"
    )
    tool_calls: Mapped[list["ToolCall"]] = relationship(
        "ToolCall", back_populates="session", cascade="all, delete-orphan"
    )
