import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, Boolean, Integer, Numeric, ForeignKey, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class AlertRule(Base):
    __tablename__ = "alert_rules"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)

    metric: Mapped[str] = mapped_column(String(100), nullable=False)
    # Metrics: loop_detected | tool_failure_rate | cost_per_session
    #          | session_duration_ms | iteration_count | error_rate

    operator: Mapped[str] = mapped_column(String(10), nullable=False)
    # Operators: gt | lt | gte | lte | eq

    threshold: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False)
    window_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=60)

    channel: Mapped[str] = mapped_column(String(50), nullable=False)
    # Channels: slack | email

    destination: Mapped[str] = mapped_column(Text, nullable=False)
    # Slack: webhook URL | Email: address

    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), nullable=False
    )
    last_fired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    project: Mapped["Project"] = relationship("Project", back_populates="alert_rules")
    events: Mapped[list["AlertEvent"]] = relationship(
        "AlertEvent", back_populates="rule", cascade="all, delete-orphan"
    )


class AlertEvent(Base):
    """Audit log of every alert that fired."""
    __tablename__ = "alert_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    alert_rule_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("alert_rules.id", ondelete="CASCADE"), nullable=False, index=True
    )
    session_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agent_sessions.id"), nullable=True
    )

    fired_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), nullable=False, index=True
    )
    metric_value: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    delivered: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    delivery_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    rule: Mapped["AlertRule"] = relationship("AlertRule", back_populates="events")
