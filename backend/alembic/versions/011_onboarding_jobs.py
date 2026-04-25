"""Add onboarding_jobs table for auto-instrumentation

Revision ID: 011
Revises: 010
Create Date: 2026-04-23
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "onboarding_jobs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", UUID(as_uuid=True),
                  sa.ForeignKey("projects.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        # Repo
        sa.Column("repo_owner", sa.String(255), nullable=False),
        sa.Column("repo_name", sa.String(255), nullable=False),
        sa.Column("repo_url", sa.Text, nullable=False),
        sa.Column("default_branch", sa.String(100), nullable=False, server_default="main"),
        # Questionnaire answers (stored as JSON)
        sa.Column("questionnaire", JSONB, nullable=True),
        # AI analysis outputs
        sa.Column("status", sa.String(50), nullable=False, server_default="pending"),
        # pending | analyzing | ready | applied | failed
        sa.Column("summary", sa.Text, nullable=True),          # AI's understanding of the codebase
        sa.Column("patches", JSONB, nullable=True),            # list of {file_path, original, updated, explanation}
        sa.Column("env_vars_needed", JSONB, nullable=True),    # list of {name, description, example}
        sa.Column("files_analyzed", JSONB, nullable=True),     # list of file paths read
        sa.Column("pr_url", sa.Text, nullable=True),
        sa.Column("pr_branch", sa.Text, nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        # Timestamps
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("onboarding_jobs")
