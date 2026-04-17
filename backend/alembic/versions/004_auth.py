"""users, organizations, org_members; add org_id to projects

Revision ID: 004
Revises: 003
Create Date: 2026-04-16
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Users ──────────────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("email", sa.String(255), unique=True, nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=True),
        sa.Column("avatar_url", sa.Text, nullable=True),
        sa.Column("password_hash", sa.Text, nullable=True),       # NULL for Google-only accounts
        sa.Column("google_id", sa.String(255), unique=True, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
    )

    # ── Organizations ───────────────────────────────────────────────────────
    op.create_table(
        "organizations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), unique=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    # ── Org members (user → org, many-to-many with role) ───────────────────
    op.create_table(
        "org_members",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("org_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("role", sa.String(50), nullable=False, server_default="member"),   # owner | admin | member
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("org_id", "user_id", name="uq_org_members_org_user"),
    )

    # ── Add org_id + created_by to projects ─────────────────────────────────
    op.add_column("projects", sa.Column("org_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True))
    op.add_column("projects", sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True))

    # Drop global unique on name (name is now unique per org)
    op.drop_constraint("projects_name_key", "projects", type_="unique")
    op.create_index("ix_projects_org_id", "projects", ["org_id"])


def downgrade() -> None:
    op.drop_index("ix_projects_org_id", "projects")
    op.create_unique_constraint("projects_name_key", "projects", ["name"])
    op.drop_column("projects", "created_by")
    op.drop_column("projects", "org_id")
    op.drop_table("org_members")
    op.drop_table("organizations")
    op.drop_table("users")
