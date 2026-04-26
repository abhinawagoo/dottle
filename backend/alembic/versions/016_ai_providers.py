"""project_ai_providers table

Revision ID: 016
Revises: 015
Create Date: 2026-04-27
"""
from alembic import op
import sqlalchemy as sa

revision = "016"
down_revision = "015"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "project_ai_providers",
        sa.Column("id", sa.String, primary_key=True),
        sa.Column("project_id", sa.String, sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("provider", sa.String(64), nullable=False),   # e.g. "openai", "anthropic"
        sa.Column("api_key_enc", sa.Text, nullable=False),      # stored value (masked on read)
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.UniqueConstraint("project_id", "provider", name="uq_project_provider"),
    )
    op.create_index("ix_ai_providers_project_id", "project_ai_providers", ["project_id"])


def downgrade():
    op.drop_table("project_ai_providers")
