"""Add issue workflow (status, assignee) and issue comments

Revision ID: 008
Revises: 007
Create Date: 2026-04-21
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Issue workflow state — one row per (project, issue_type) pair
    op.create_table(
        "issue_workflows",
        sa.Column("id", UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("project_id", UUID(as_uuid=True),
                  sa.ForeignKey("projects.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("issue_type", sa.String(100), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="open"),
        sa.Column("assignee", sa.String(255), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("project_id", "issue_type", name="uq_issue_workflow"),
    )
    op.create_index("ix_issue_workflows_project", "issue_workflows", ["project_id"])

    # Issue comments — one per comment on a (project, issue_type) thread
    op.create_table(
        "issue_comments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("project_id", UUID(as_uuid=True),
                  sa.ForeignKey("projects.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("issue_type", sa.String(100), nullable=False),
        sa.Column("author", sa.String(255), nullable=False),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_issue_comments_project_type", "issue_comments",
                    ["project_id", "issue_type"])


def downgrade() -> None:
    op.drop_index("ix_issue_comments_project_type", table_name="issue_comments")
    op.drop_table("issue_comments")
    op.drop_index("ix_issue_workflows_project", table_name="issue_workflows")
    op.drop_table("issue_workflows")
