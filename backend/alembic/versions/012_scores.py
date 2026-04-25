"""scores table

Revision ID: 012
Revises: 011
Create Date: 2026-04-25
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "012"
down_revision = "011"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "scores",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agent_sessions.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("span_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("spans.id", ondelete="CASCADE"), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),       # e.g. "quality", "thumbs", "relevance"
        sa.Column("value", sa.Float, nullable=False),             # 1.0 / -1.0 for thumbs; 0-1 for model scores
        sa.Column("string_value", sa.String(255), nullable=True), # "positive" / "negative" / label
        sa.Column("comment", sa.Text, nullable=True),
        sa.Column("source", sa.String(50), nullable=False, server_default="human"),  # human | model | api
        sa.Column("model_name", sa.String(255), nullable=True),   # which model gave the score
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_scores_session_id_name", "scores", ["session_id", "name"])


def downgrade():
    op.drop_table("scores")
