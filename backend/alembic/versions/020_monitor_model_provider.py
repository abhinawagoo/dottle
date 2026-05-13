"""Add model_provider column to semantic_monitors

Revision ID: 020
Revises: 019
Create Date: 2026-05-14
"""
from alembic import op
import sqlalchemy as sa

revision = "020"
down_revision = "019"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "semantic_monitors",
        sa.Column("model_provider", sa.String(50), nullable=True),
    )


def downgrade():
    op.drop_column("semantic_monitors", "model_provider")
