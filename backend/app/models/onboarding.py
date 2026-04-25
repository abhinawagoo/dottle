import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, Text, ForeignKey, text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class OnboardingJob(Base):
    __tablename__ = "onboarding_jobs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    repo_owner: Mapped[str] = mapped_column(String(255), nullable=False)
    repo_name: Mapped[str] = mapped_column(String(255), nullable=False)
    repo_url: Mapped[str] = mapped_column(Text, nullable=False)
    default_branch: Mapped[str] = mapped_column(String(100), nullable=False, default="main")

    questionnaire: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending")
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    patches: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    env_vars_needed: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    files_analyzed: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    pr_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    pr_branch: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), nullable=False
    )
