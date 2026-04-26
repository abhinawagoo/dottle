from sqlalchemy import Column, String, Text, DateTime, Float, Integer, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.database import Base
import uuid


class Experiment(Base):
    __tablename__ = "experiments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    dataset_id = Column(UUID(as_uuid=True), ForeignKey("datasets.id", ondelete="SET NULL"), nullable=True)
    eval_criteria = Column(Text, nullable=True)
    eval_config_id = Column(UUID(as_uuid=True), ForeignKey("eval_configs.id", ondelete="SET NULL"), nullable=True)
    variant_a = Column(JSONB, nullable=False, default=dict)
    variant_b = Column(JSONB, nullable=False, default=dict)
    status = Column(String(20), nullable=False, default="draft")
    result_summary = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)


class ExperimentRun(Base):
    __tablename__ = "experiment_runs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    experiment_id = Column(UUID(as_uuid=True), ForeignKey("experiments.id", ondelete="CASCADE"), nullable=False, index=True)
    variant = Column(String(1), nullable=False)   # "a" or "b"
    item_index = Column(Integer, nullable=False)
    input_text = Column(Text, nullable=True)
    response_text = Column(Text, nullable=True)
    score = Column(Float, nullable=True)
    reasoning = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default="pending")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
