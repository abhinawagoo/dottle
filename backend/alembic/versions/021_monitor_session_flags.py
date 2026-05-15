"""Add monitor_session_flags table and session_cursor to semantic_monitors

Revision ID: 021
Revises: 020
Create Date: 2026-05-16
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "021"
down_revision = "020"
branch_labels = None
depends_on = None


def upgrade():
    # Track the latest session evaluated per monitor to avoid re-evaluation
    op.add_column(
        "semantic_monitors",
        sa.Column("session_cursor", sa.DateTime(timezone=True), nullable=True),
    )

    # Per-session behavioral match records
    op.create_table(
        "monitor_session_flags",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("monitor_id", UUID(as_uuid=True), sa.ForeignKey("semantic_monitors.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("session_id", UUID(as_uuid=True), sa.ForeignKey("agent_sessions.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("matched", sa.Boolean, nullable=False),
        sa.Column("reason", sa.Text, nullable=True),
        sa.Column("evaluated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_monitor_session_flags_session", "monitor_session_flags", ["session_id", "matched"])


def downgrade():
    op.drop_index("ix_monitor_session_flags_session", table_name="monitor_session_flags")
    op.drop_table("monitor_session_flags")
    op.drop_column("semantic_monitors", "session_cursor")
