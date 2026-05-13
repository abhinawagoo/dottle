"""Add semantic_monitors and monitor_events tables; add quality_score to session list

Revision ID: 019
Revises: 018
Create Date: 2026-05-14
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "019"
down_revision = "018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "semantic_monitors",
        sa.Column("id",             UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id",     UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name",           sa.String(255), nullable=False),
        sa.Column("description",    sa.Text, nullable=True),
        sa.Column("pattern_prompt", sa.Text, nullable=False),
        sa.Column("threshold_pct",  sa.Float, nullable=False, server_default="20.0"),
        sa.Column("window_minutes", sa.Integer, nullable=False, server_default="60"),
        sa.Column("min_sessions",   sa.Integer, nullable=False, server_default="5"),
        sa.Column("enabled",        sa.Boolean, nullable=False, server_default="true"),
        sa.Column("last_fired_at",  sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at",     sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "monitor_events",
        sa.Column("id",                  UUID(as_uuid=True), primary_key=True),
        sa.Column("semantic_monitor_id", UUID(as_uuid=True), sa.ForeignKey("semantic_monitors.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("project_id",          UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("match_pct",           sa.Float, nullable=False),
        sa.Column("sessions_evaluated",  sa.Integer, nullable=False),
        sa.Column("sessions_matched",    sa.Integer, nullable=False),
        sa.Column("sample_session_ids",  sa.Text, nullable=True),
        sa.Column("ai_summary",          sa.Text, nullable=True),
        sa.Column("fired_at",            sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("monitor_events")
    op.drop_table("semantic_monitors")
