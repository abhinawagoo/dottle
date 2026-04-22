import uuid
from datetime import datetime, timezone

import sqlalchemy as sa
from sqlalchemy import String, DateTime, ForeignKey, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    org_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True, index=True
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    api_key: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()"),
        nullable=False,
    )

    slack_webhook_url: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    slack_channel_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    slack_workspace_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    org: Mapped["Organization | None"] = relationship("Organization", back_populates="projects")
    sessions: Mapped[list["AgentSession"]] = relationship(
        "AgentSession", back_populates="project", cascade="all, delete-orphan"
    )
    alert_rules: Mapped[list["AlertRule"]] = relationship(
        "AlertRule", back_populates="project", cascade="all, delete-orphan"
    )
