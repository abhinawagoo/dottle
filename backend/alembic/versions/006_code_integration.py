"""GitHub integration + code fix jobs

Revision ID: 006
Revises: 005
Create Date: 2026-04-16
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "github_configs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"),
                  nullable=False, unique=True),
        sa.Column("repo_url", sa.String(500), nullable=False),
        sa.Column("repo_owner", sa.String(255), nullable=False),
        sa.Column("repo_name", sa.String(255), nullable=False),
        sa.Column("default_branch", sa.String(100), nullable=False, server_default="main"),
        sa.Column("access_token", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_github_configs_project_id", "github_configs", ["project_id"])

    op.create_table(
        "code_fix_jobs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("issue_type", sa.String(100), nullable=False),
        sa.Column("issue_context", JSONB, nullable=False, server_default="{}"),
        sa.Column("status", sa.String(50), nullable=False, server_default="pending"),
        sa.Column("diagnosis", sa.Text, nullable=True),
        sa.Column("patches", JSONB, nullable=True),
        sa.Column("pr_url", sa.String(500), nullable=True),
        sa.Column("pr_branch", sa.String(200), nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("files_loaded", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_code_fix_jobs_project_id", "code_fix_jobs", ["project_id"])
    op.create_index("ix_code_fix_jobs_issue_type", "code_fix_jobs", ["issue_type"])


def downgrade() -> None:
    op.drop_table("code_fix_jobs")
    op.drop_table("github_configs")
