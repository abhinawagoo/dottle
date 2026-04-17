import uuid
from datetime import datetime, timezone

from sqlalchemy import String, DateTime, Text, ForeignKey, text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class GitHubConfig(Base):
    """GitHub integration settings per project (PAT + repo info)."""
    __tablename__ = "github_configs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"),
        unique=True, nullable=False, index=True
    )
    repo_url: Mapped[str] = mapped_column(String(500), nullable=False)
    # owner/repo extracted from repo_url
    repo_owner: Mapped[str] = mapped_column(String(255), nullable=False)
    repo_name: Mapped[str] = mapped_column(String(255), nullable=False)
    default_branch: Mapped[str] = mapped_column(String(100), nullable=False, server_default="main")
    # Encrypted PAT stored in DB — masked when returned via API
    access_token: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), nullable=False
    )


class CodeFixJob(Base):
    """A code fix generation + PR job tied to a detected issue."""
    __tablename__ = "code_fix_jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    issue_type: Mapped[str] = mapped_column(String(100), nullable=False)
    # Snapshot of issue context at job creation time
    issue_context: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    # Job lifecycle: pending → running → ready → applied | failed
    status: Mapped[str] = mapped_column(String(50), nullable=False, server_default="pending")
    # LLM-generated root cause analysis
    diagnosis: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Array of file patches: [{file_path, old_code, new_code, explanation}]
    patches: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    # GitHub PR URL after creation
    pr_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    pr_branch: Mapped[str | None] = mapped_column(String(200), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Files the agent chose to load (for transparency)
    files_loaded: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), nullable=False
    )
