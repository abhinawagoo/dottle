from sqlalchemy import Column, String, DateTime, UniqueConstraint, ForeignKey, func, Text
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base
import uuid


class ProjectAIProvider(Base):
    __tablename__ = "project_ai_providers"
    __table_args__ = (
        UniqueConstraint("project_id", "provider", name="uq_project_provider"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    provider = Column(String(64), nullable=False)
    api_key_enc = Column(Text, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
