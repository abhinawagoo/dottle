"""eval_configs and eval_results tables

Revision ID: 014
Revises: 013
Create Date: 2026-04-25
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "eval_configs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("evaluator_model", sa.String(255), nullable=False, server_default="claude-sonnet-4-6"),
        sa.Column("criteria", sa.Text, nullable=False),          # what the LLM judges
        sa.Column("score_name", sa.String(255), nullable=False), # name of score to create e.g. "helpfulness"
        sa.Column("score_range_min", sa.Float, nullable=False, server_default="0"),
        sa.Column("score_range_max", sa.Float, nullable=False, server_default="1"),
        sa.Column("run_on", sa.String(50), nullable=False, server_default="all"),  # all | sample
        sa.Column("sample_rate", sa.Float, nullable=False, server_default="1.0"),
        sa.Column("active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_table(
        "eval_results",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("eval_config_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("eval_configs.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agent_sessions.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("score_value", sa.Float, nullable=True),
        sa.Column("reasoning", sa.Text, nullable=True),          # LLM's explanation
        sa.Column("status", sa.String(50), nullable=False, server_default="pending"),  # pending | completed | failed
        sa.Column("error", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_eval_results_session_config", "eval_results", ["session_id", "eval_config_id"])


def downgrade():
    op.drop_table("eval_results")
    op.drop_table("eval_configs")
