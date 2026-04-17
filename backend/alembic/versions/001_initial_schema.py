"""Initial schema with TimescaleDB hypertables

Revision ID: 001
Revises:
Create Date: 2026-04-12
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Enable TimescaleDB extension
    op.execute("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;")

    # ── projects ──────────────────────────────────────────────────────────────
    op.create_table(
        "projects",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False, unique=True),
        sa.Column("api_key", sa.String(255), nullable=False, unique=True),
        sa.Column("description", sa.String(1000), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    # ── agent_sessions ────────────────────────────────────────────────────────
    op.create_table(
        "agent_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("external_id", sa.String(255), nullable=True),
        sa.Column("agent_name", sa.String(255), nullable=False),
        sa.Column("status", sa.String(50), nullable=False, server_default="running"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_ms", sa.Integer, nullable=True),
        sa.Column("total_cost_usd", sa.Numeric(12, 6), nullable=True),
        sa.Column("total_tokens", sa.Integer, nullable=True),
        sa.Column("input_tokens", sa.Integer, nullable=True),
        sa.Column("output_tokens", sa.Integer, nullable=True),
        sa.Column("iteration_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("loop_detected", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("loop_reason", sa.Text, nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("error_type", sa.String(255), nullable=True),
        sa.Column("metadata", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("idx_sessions_project_id", "agent_sessions", ["project_id"])
    op.create_index("idx_sessions_started_at", "agent_sessions", ["started_at"])
    op.create_index("idx_sessions_status", "agent_sessions", ["status"])
    op.create_index("idx_sessions_agent_name", "agent_sessions", ["agent_name"])
    op.create_index("idx_sessions_loop", "agent_sessions", ["loop_detected"],
                    postgresql_where=sa.text("loop_detected = true"))

    # NOTE: TimescaleDB hypertables require the partition column (started_at) to be
    # part of the primary key. For v1 we use regular PostgreSQL tables with time-based
    # indexes which handle millions of rows well. Hypertables can be added in migration 002
    # by using composite PKs (id, started_at). The TimescaleDB extension is still available.

    # ── spans ─────────────────────────────────────────────────────────────────
    op.create_table(
        "spans",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agent_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("parent_span_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("span_type", sa.String(50), nullable=False),
        sa.Column("name", sa.String(500), nullable=False),
        sa.Column("status", sa.String(50), nullable=False, server_default="ok"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_ms", sa.Integer, nullable=True),
        sa.Column("model", sa.String(255), nullable=True),
        sa.Column("input_tokens", sa.Integer, nullable=True),
        sa.Column("output_tokens", sa.Integer, nullable=True),
        sa.Column("cost_usd", sa.Numeric(12, 6), nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("error_type", sa.String(255), nullable=True),
        sa.Column("attributes", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("idx_spans_session_id", "spans", ["session_id"])
    op.create_index("idx_spans_project_id", "spans", ["project_id"])
    op.create_index("idx_spans_span_type", "spans", ["span_type"])
    op.create_index("idx_spans_started_at", "spans", ["started_at"])
    op.create_index("idx_spans_status", "spans", ["status"])

    # spans hypertable: add in migration 002 with composite PK

    # ── tool_calls ────────────────────────────────────────────────────────────
    op.create_table(
        "tool_calls",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("span_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("spans.id", ondelete="CASCADE"), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agent_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tool_name", sa.String(255), nullable=False),
        sa.Column("status", sa.String(50), nullable=False),
        sa.Column("duration_ms", sa.Integer, nullable=True),
        sa.Column("error_type", sa.String(255), nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("input_hash", sa.String(64), nullable=True),
        sa.Column("called_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("idx_tool_calls_session_id", "tool_calls", ["session_id"])
    op.create_index("idx_tool_calls_project_id", "tool_calls", ["project_id"])
    op.create_index("idx_tool_calls_tool_name", "tool_calls", ["tool_name"])
    op.create_index("idx_tool_calls_status", "tool_calls", ["status"])
    op.create_index("idx_tool_calls_called_at", "tool_calls", ["called_at"])
    op.create_index("idx_tool_calls_repeat", "tool_calls", ["session_id", "tool_name", "input_hash"])

    # tool_calls hypertable: add in migration 002 with composite PK

    # ── alert_rules ───────────────────────────────────────────────────────────
    op.create_table(
        "alert_rules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("metric", sa.String(100), nullable=False),
        sa.Column("operator", sa.String(10), nullable=False),
        sa.Column("threshold", sa.Numeric(12, 4), nullable=False),
        sa.Column("window_minutes", sa.Integer, nullable=False, server_default="60"),
        sa.Column("channel", sa.String(50), nullable=False),
        sa.Column("destination", sa.Text, nullable=False),
        sa.Column("enabled", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("last_fired_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("idx_alert_rules_project_id", "alert_rules", ["project_id"])
    op.create_index("idx_alert_rules_enabled", "alert_rules", ["enabled"],
                    postgresql_where=sa.text("enabled = true"))

    # ── alert_events ──────────────────────────────────────────────────────────
    op.create_table(
        "alert_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("alert_rule_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("alert_rules.id", ondelete="CASCADE"), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("fired_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("metric_value", sa.Numeric(12, 4), nullable=False),
        sa.Column("message", sa.Text, nullable=False),
        sa.Column("delivered", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("delivery_error", sa.Text, nullable=True),
    )
    op.create_index("idx_alert_events_rule_id", "alert_events", ["alert_rule_id"])
    op.create_index("idx_alert_events_fired_at", "alert_events", ["fired_at"])


def downgrade() -> None:
    op.drop_table("alert_events")
    op.drop_table("alert_rules")
    op.drop_table("tool_calls")
    op.drop_table("spans")
    op.drop_table("agent_sessions")
    op.drop_table("projects")
