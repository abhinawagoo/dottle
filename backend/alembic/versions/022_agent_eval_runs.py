"""Add agent_eval_configs, agent_eval_runs, agent_eval_results tables

Revision ID: 022
Revises: 021
Create Date: 2026-05-19

Three tables for the eval runs feature:
  agent_eval_configs  — webhook URL + dataset + scoring settings
  agent_eval_runs     — one per "Run eval" click, tracks progress + aggregates
  agent_eval_results  — one per dataset item per run, field-level comparison
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "022"
down_revision = "021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── agent_eval_configs ─────────────────────────────────────────────────────
    op.create_table(
        "agent_eval_configs",
        sa.Column("id",               UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id",       UUID(as_uuid=True),
                  sa.ForeignKey("projects.id",  ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("dataset_id",       UUID(as_uuid=True),
                  sa.ForeignKey("datasets.id",  ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name",             sa.String(255), nullable=False),
        sa.Column("description",      sa.Text,        nullable=True),
        # Webhook
        sa.Column("webhook_url",      sa.Text,        nullable=False),
        sa.Column("webhook_headers",  JSONB,          nullable=False, server_default="{}"),
        sa.Column("webhook_timeout_s",sa.Integer,     nullable=False, server_default="30"),
        # Scoring
        sa.Column("scoring_method",   sa.String(50),  nullable=False, server_default="'field_comparison'"),
        sa.Column("scoring_config",   JSONB,          nullable=False, server_default="{}"),
        sa.Column("active",           sa.Boolean,     nullable=False, server_default="true"),
        # Timestamps
        sa.Column("created_at",       sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at",       sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # ── agent_eval_runs ────────────────────────────────────────────────────────
    op.create_table(
        "agent_eval_runs",
        sa.Column("id",               UUID(as_uuid=True), primary_key=True),
        sa.Column("config_id",        UUID(as_uuid=True),
                  sa.ForeignKey("agent_eval_configs.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("project_id",       UUID(as_uuid=True),
                  sa.ForeignKey("projects.id",           ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("dataset_id",       UUID(as_uuid=True),
                  sa.ForeignKey("datasets.id",           ondelete="CASCADE"), nullable=False, index=True),
        # Status + progress
        sa.Column("status",           sa.String(20),  nullable=False, server_default="'pending'"),
        sa.Column("total_items",      sa.Integer,     nullable=False, server_default="0"),
        sa.Column("completed_items",  sa.Integer,     nullable=False, server_default="0"),
        sa.Column("failed_items",     sa.Integer,     nullable=False, server_default="0"),
        # Aggregates (populated on completion)
        sa.Column("avg_score",        sa.Float,       nullable=True),
        sa.Column("score_breakdown",  JSONB,          nullable=True),
        sa.Column("error",            sa.Text,        nullable=True),
        # Timestamps
        sa.Column("created_at",       sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("started_at",       sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at",     sa.DateTime(timezone=True), nullable=True),
    )
    # List runs for a config, newest first
    op.create_index(
        "ix_agent_eval_runs_config_created",
        "agent_eval_runs",
        ["config_id", "created_at"],
    )

    # ── agent_eval_results ─────────────────────────────────────────────────────
    op.create_table(
        "agent_eval_results",
        sa.Column("id",                UUID(as_uuid=True), primary_key=True),
        sa.Column("run_id",            UUID(as_uuid=True),
                  sa.ForeignKey("agent_eval_runs.id",      ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("config_id",         UUID(as_uuid=True),
                  sa.ForeignKey("agent_eval_configs.id",   ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("project_id",        UUID(as_uuid=True),
                  sa.ForeignKey("projects.id",             ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("item_id",           UUID(as_uuid=True),
                  sa.ForeignKey("dataset_items.id",        ondelete="SET NULL"), nullable=True,  index=True),
        sa.Column("session_id",        UUID(as_uuid=True),
                  sa.ForeignKey("agent_sessions.id",       ondelete="SET NULL"), nullable=True,  index=True),
        sa.Column("item_index",        sa.Integer,     nullable=False),
        # Immutable snapshots of what was tested
        sa.Column("input",             JSONB,          nullable=False, server_default="{}"),
        sa.Column("expected_output",   JSONB,          nullable=False, server_default="{}"),
        # Agent response
        sa.Column("agent_output",      JSONB,          nullable=True),
        sa.Column("latency_ms",        sa.Integer,     nullable=True),
        # Scoring
        sa.Column("score",             sa.Float,       nullable=True),
        sa.Column("field_scores",      JSONB,          nullable=True),
        sa.Column("comparison_detail", JSONB,          nullable=True),
        sa.Column("status",            sa.String(20),  nullable=False, server_default="'pending'"),
        sa.Column("error",             sa.Text,        nullable=True),
        # Timestamps
        sa.Column("created_at",        sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("completed_at",      sa.DateTime(timezone=True), nullable=True),
    )
    # Primary access pattern: all results for a run, in item order
    op.create_index(
        "ix_agent_eval_results_run_index",
        "agent_eval_results",
        ["run_id", "item_index"],
    )


def downgrade() -> None:
    op.drop_index("ix_agent_eval_results_run_index",    table_name="agent_eval_results")
    op.drop_index("ix_agent_eval_runs_config_created",  table_name="agent_eval_runs")
    op.drop_table("agent_eval_results")
    op.drop_table("agent_eval_runs")
    op.drop_table("agent_eval_configs")
