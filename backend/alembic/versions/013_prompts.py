"""prompts table

Revision ID: 013
Revises: 012
Create Date: 2026-04-25
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "prompts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),       # slug used in SDK: dottle.get_prompt("my-prompt")
        sa.Column("version", sa.Integer, nullable=False, server_default="1"),
        sa.Column("label", sa.String(255), nullable=True),       # optional display label e.g. "v2-prod"
        sa.Column("content", sa.Text, nullable=False),            # the prompt text with {{variable}} placeholders
        sa.Column("variables", postgresql.JSONB, nullable=False, server_default="[]"),  # extracted variable names
        sa.Column("config", postgresql.JSONB, nullable=False, server_default="{}"),     # model, temp, etc.
        sa.Column("tags", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("commit_message", sa.String(500), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    # Unique constraint: one version number per name per project
    op.create_unique_constraint("uq_prompts_project_name_version", "prompts", ["project_id", "name", "version"])
    op.create_index("ix_prompts_project_name", "prompts", ["project_id", "name"])


def downgrade():
    op.drop_table("prompts")
