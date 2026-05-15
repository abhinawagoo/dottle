"""
Semantic Monitor — watches agent output for behavioral patterns.
e.g. "agent refusing tasks", "agent apologising excessively", "hallucinating brand names"
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class SemanticMonitor(Base):
    __tablename__ = "semantic_monitors"

    id:           Mapped[uuid.UUID]  = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id:   Mapped[uuid.UUID]  = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    name:         Mapped[str]        = mapped_column(String(255), nullable=False)
    description:  Mapped[str | None] = mapped_column(Text, nullable=True)
    # The detection prompt — LLM is asked: "Does this session exhibit: <pattern_prompt>?"
    pattern_prompt: Mapped[str]      = mapped_column(Text, nullable=False)
    # Fire alert when >= threshold_pct % of sessions in window match
    threshold_pct:  Mapped[float]    = mapped_column(Float, default=20.0)
    window_minutes: Mapped[int]      = mapped_column(Integer, default=60)
    min_sessions:   Mapped[int]      = mapped_column(Integer, default=5)   # need at least N sessions before firing
    # Preferred LLM provider for evaluation (None = auto-pick from org providers)
    model_provider:  Mapped[str | None]      = mapped_column(String(50), nullable=True)
    enabled:         Mapped[bool]            = mapped_column(Boolean, default=True)
    last_fired_at:   Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Cursor: started_at of the most-recent session we evaluated — prevents re-evaluating old sessions
    session_cursor:  Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at:      Mapped[datetime]        = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    events: Mapped[list["MonitorEvent"]]         = relationship("MonitorEvent", back_populates="monitor", cascade="all, delete-orphan")
    session_flags: Mapped[list["MonitorSessionFlag"]] = relationship("MonitorSessionFlag", back_populates="monitor", cascade="all, delete-orphan")


class MonitorEvent(Base):
    __tablename__ = "monitor_events"

    id:                 Mapped[uuid.UUID]  = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    semantic_monitor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("semantic_monitors.id", ondelete="CASCADE"), nullable=False, index=True)
    project_id:          Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    match_pct:           Mapped[float]     = mapped_column(Float, nullable=False)   # % sessions that matched
    sessions_evaluated:  Mapped[int]       = mapped_column(Integer, nullable=False)
    sessions_matched:    Mapped[int]       = mapped_column(Integer, nullable=False)
    # Sample session IDs that matched (stored as comma-separated UUIDs)
    sample_session_ids:  Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_summary:          Mapped[str | None] = mapped_column(Text, nullable=True)
    fired_at:            Mapped[datetime]   = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    monitor: Mapped["SemanticMonitor"] = relationship("SemanticMonitor", back_populates="events")


class MonitorSessionFlag(Base):
    """Per-session behavioral match record — stores which sessions matched a monitor and why."""
    __tablename__ = "monitor_session_flags"

    id:           Mapped[uuid.UUID]  = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    monitor_id:   Mapped[uuid.UUID]  = mapped_column(UUID(as_uuid=True), ForeignKey("semantic_monitors.id", ondelete="CASCADE"), nullable=False, index=True)
    session_id:   Mapped[uuid.UUID]  = mapped_column(UUID(as_uuid=True), ForeignKey("agent_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    project_id:   Mapped[uuid.UUID]  = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    matched:      Mapped[bool]       = mapped_column(Boolean, nullable=False)
    reason:       Mapped[str | None] = mapped_column(Text, nullable=True)   # LLM's one-sentence reasoning
    evaluated_at: Mapped[datetime]   = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    monitor: Mapped["SemanticMonitor"] = relationship("SemanticMonitor", back_populates="session_flags")
