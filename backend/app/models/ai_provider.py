from sqlalchemy import Column, String, DateTime, UniqueConstraint, ForeignKey, func
from app.database import Base
import uuid


class ProjectAIProvider(Base):
    __tablename__ = "project_ai_providers"
    __table_args__ = (
        UniqueConstraint("project_id", "provider", name="uq_project_provider"),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    provider = Column(String(64), nullable=False)
    api_key_enc = Column(String, nullable=False)   # stored as-is; masked on response
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
