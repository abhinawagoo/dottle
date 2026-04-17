"""user attribution, session tags, agent version

Revision ID: 005
Revises: 004
Create Date: 2026-04-16
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # User attribution
    op.add_column("agent_sessions", sa.Column("user_id",    sa.String(255), nullable=True, index=True))
    op.add_column("agent_sessions", sa.Column("user_email", sa.String(255), nullable=True, index=True))

    # Session tags  (text array)
    op.add_column("agent_sessions", sa.Column("tags", ARRAY(sa.Text), nullable=True, server_default="{}"))

    # Agent versioning
    op.add_column("agent_sessions", sa.Column("agent_version", sa.String(100), nullable=True, index=True))


def downgrade() -> None:
    op.drop_column("agent_sessions", "agent_version")
    op.drop_column("agent_sessions", "tags")
    op.drop_column("agent_sessions", "user_email")
    op.drop_column("agent_sessions", "user_id")
