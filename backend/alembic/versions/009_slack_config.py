"""Add slack_webhook_url and slack_channel_name to projects

Revision ID: 009
Revises: 008
Create Date: 2026-04-22
"""

from alembic import op
import sqlalchemy as sa

revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("slack_webhook_url", sa.Text(), nullable=True))
    op.add_column("projects", sa.Column("slack_channel_name", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("projects", "slack_channel_name")
    op.drop_column("projects", "slack_webhook_url")
