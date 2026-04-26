"""experiments and experiment_runs tables

Revision ID: 017
Revises: 016
Create Date: 2026-04-27
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "017"
down_revision = "016"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "experiments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("dataset_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("datasets.id", ondelete="SET NULL"), nullable=True),
        sa.Column("eval_criteria", sa.Text, nullable=True),   # inline criteria if no eval_config
        sa.Column("eval_config_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("eval_configs.id", ondelete="SET NULL"), nullable=True),
        sa.Column("variant_a", postgresql.JSONB, nullable=False, server_default="{}"),  # {model, system_prompt, prompt_id?}
        sa.Column("variant_b", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),  # draft|running|completed|failed
        sa.Column("result_summary", postgresql.JSONB, nullable=True),  # {a_avg, b_avg, winner, total, a_wins, b_wins, ties}
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "experiment_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("experiment_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("experiments.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("variant", sa.String(1), nullable=False),   # "a" or "b"
        sa.Column("item_index", sa.Integer, nullable=False),  # 0-based index into dataset items
        sa.Column("input_text", sa.Text, nullable=True),
        sa.Column("response_text", sa.Text, nullable=True),
        sa.Column("score", sa.Float, nullable=True),
        sa.Column("reasoning", sa.Text, nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_experiment_runs_exp_variant", "experiment_runs", ["experiment_id", "variant"])


def downgrade():
    op.drop_table("experiment_runs")
    op.drop_table("experiments")
