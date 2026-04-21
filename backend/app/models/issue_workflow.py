import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, ForeignKey, Text, text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class IssueWorkflow(Base):
    """Per-project, per-issue-type workflow state (status + assignee)."""
    __tablename__ = "issue_workflows"
    __table_args__ = (
        UniqueConstraint("project_id", "issue_type", name="uq_issue_workflow"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    issue_type: Mapped[str] = mapped_column(String(100), nullable=False)
    # open | in_review | resolved
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open")
    assignee: Mapped[str | None] = mapped_column(String(255), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), nullable=False
    )


class IssueComment(Base):
    """Comment thread on a (project, issue_type) pair."""
    __tablename__ = "issue_comments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False
    )
    issue_type: Mapped[str] = mapped_column(String(100), nullable=False)
    author: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), nullable=False
    )
