"""
Agent Eval Runs — data models.

Three tables:
  agent_eval_configs  — one per "eval setup": which dataset, webhook URL,
                        and how to score field-by-field comparisons
  agent_eval_runs     — one per "Run eval" click; tracks progress + aggregates
  agent_eval_results  — one per dataset item per run; stores agent output,
                        field-level comparison, and optional session trace link
"""
import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, Float, Integer, Text, Boolean, ForeignKey, text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AgentEvalConfig(Base):
    """
    Eval configuration: binds a dataset to a webhook and scoring rules.

    scoring_method values:
      "field_comparison" — compare each JSONB key against expected_output field-by-field
      "llm_judge"        — ask an LLM to score the full response against criteria
      "exact_match"      — require exact string equality per field (strict)

    scoring_config shape (JSONB, method-specific):
      field_comparison: {"field_weights": {"invoice_number": 2.0, "total": 1.5, ...}}
      llm_judge:        {"model": "claude-opus-4-6", "criteria": "..."}
      exact_match:      {"fields": ["invoice_number", "vendor_name"]}
    """
    __tablename__ = "agent_eval_configs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    dataset_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("datasets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Agent webhook
    webhook_url: Mapped[str] = mapped_column(Text, nullable=False)
    webhook_headers: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict,
        comment="Optional auth headers sent with every webhook call, e.g. {Authorization: Bearer ...}",
    )
    webhook_timeout_s: Mapped[int] = mapped_column(
        Integer, nullable=False, default=30,
        comment="Per-item webhook call timeout in seconds",
    )

    # Scoring
    scoring_method: Mapped[str] = mapped_column(
        String(50), nullable=False, default="field_comparison",
        comment="field_comparison | llm_judge | exact_match",
    )
    scoring_config: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict,
        comment="Method-specific scoring parameters",
    )

    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), nullable=False
    )


class AgentEvalRun(Base):
    """
    One row per "Run eval" click.

    status progression:
      pending → running → completed | failed | cancelled

    score_breakdown holds aggregate field-level scores once complete:
      {"invoice_number": 0.91, "vendor_name": 0.87, "total": 0.95, ...}
    """
    __tablename__ = "agent_eval_runs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    config_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("agent_eval_configs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    dataset_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("datasets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="Snapshot of which dataset was used; retained even if config changes later",
    )

    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending",
        comment="pending | running | completed | failed | cancelled",
    )

    # Progress counters — updated in place as items complete
    total_items: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    completed_items: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    failed_items: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Aggregates — populated once status = completed
    avg_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    score_breakdown: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True,
        comment="Per-field average scores across all completed items",
    )

    error: Mapped[str | None] = mapped_column(
        Text, nullable=True,
        comment="Top-level error message if the entire run failed to start",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), nullable=False
    )
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class AgentEvalResult(Base):
    """
    One row per dataset item per run.

    field_scores example:
      {"invoice_number": 1.0, "vendor_name": 0.0, "line_items": 0.75, "total": 1.0}

    comparison_detail example:
      {
        "invoice_number": {"expected": "INV-001", "actual": "INV-001", "match": true,  "score": 1.0},
        "vendor_name":    {"expected": "Acme",    "actual": "ACME",    "match": false, "score": 0.0},
        "total":          {"expected": 142.50,    "actual": 142.50,    "match": true,  "score": 1.0}
      }
    """
    __tablename__ = "agent_eval_results"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("agent_eval_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    config_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("agent_eval_configs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    item_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("dataset_items.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="Link back to the source dataset item; SET NULL so results survive item deletion",
    )
    session_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("agent_sessions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="Populated if the agent used the Dottle SDK and reported a session_id in the webhook response",
    )

    item_index: Mapped[int] = mapped_column(
        Integer, nullable=False,
        comment="Zero-based position within the run, used for stable ordering",
    )

    # Snapshots of the item at eval time (immutable record of what was tested)
    input: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict,
        comment="Copy of DatasetItem.input at the time of eval",
    )
    expected_output: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict,
        comment="Parsed expected output fields; always stored as JSONB for field comparison",
    )

    # Agent response
    agent_output: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True,
        comment="Raw JSON body returned by the agent's webhook",
    )
    latency_ms: Mapped[int | None] = mapped_column(
        Integer, nullable=True,
        comment="Webhook round-trip time in milliseconds",
    )

    # Scoring
    score: Mapped[float | None] = mapped_column(
        Float, nullable=True,
        comment="Overall 0.0–1.0 score for this item (weighted average of field_scores)",
    )
    field_scores: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True,
        comment="Per-field 0.0–1.0 scores",
    )
    comparison_detail: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True,
        comment="Full field-by-field comparison: expected, actual, match, score",
    )

    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending",
        comment="pending | running | completed | failed | skipped",
    )
    error: Mapped[str | None] = mapped_column(
        Text, nullable=True,
        comment="Webhook error or scoring failure message",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), nullable=False
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
