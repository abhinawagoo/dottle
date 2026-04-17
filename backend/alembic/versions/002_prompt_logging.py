"""Add prompt/response logging and search to spans

Revision ID: 002
Revises: 001
Create Date: 2026-04-15
"""
from alembic import op
import sqlalchemy as sa

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Prompt & response text storage on spans
    op.add_column("spans", sa.Column("input_text", sa.Text, nullable=True))
    op.add_column("spans", sa.Column("output_text", sa.Text, nullable=True))


def downgrade() -> None:
    op.drop_column("spans", "output_text")
    op.drop_column("spans", "input_text")
