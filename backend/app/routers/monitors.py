"""
Semantic Monitors API — CRUD + event history.
"""
import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.semantic_monitor import SemanticMonitor, MonitorEvent
from app.lib.auth import current_user

router = APIRouter(prefix="/monitors", tags=["monitors"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class MonitorCreate(BaseModel):
    project_id: uuid.UUID
    name: str
    description: str | None = None
    pattern_prompt: str
    threshold_pct: float = 20.0
    window_minutes: int = 60
    min_sessions: int = 5


class MonitorUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    pattern_prompt: str | None = None
    threshold_pct: float | None = None
    window_minutes: int | None = None
    min_sessions: int | None = None
    enabled: bool | None = None


class MonitorOut(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    description: str | None
    pattern_prompt: str
    threshold_pct: float
    window_minutes: int
    min_sessions: int
    enabled: bool
    last_fired_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class MonitorEventOut(BaseModel):
    id: uuid.UUID
    semantic_monitor_id: uuid.UUID
    match_pct: float
    sessions_evaluated: int
    sessions_matched: int
    sample_session_ids: str | None
    ai_summary: str | None
    fired_at: datetime

    model_config = {"from_attributes": True}


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("", response_model=list[MonitorOut])
async def list_monitors(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: Any = Depends(current_user),
):
    result = await db.execute(
        select(SemanticMonitor)
        .where(SemanticMonitor.project_id == project_id)
        .order_by(SemanticMonitor.created_at.desc())
    )
    return result.scalars().all()


@router.post("", response_model=MonitorOut, status_code=201)
async def create_monitor(
    body: MonitorCreate,
    db: AsyncSession = Depends(get_db),
    _: Any = Depends(current_user),
):
    monitor = SemanticMonitor(**body.model_dump())
    db.add(monitor)
    await db.commit()
    await db.refresh(monitor)
    return monitor


@router.patch("/{monitor_id}", response_model=MonitorOut)
async def update_monitor(
    monitor_id: uuid.UUID,
    body: MonitorUpdate,
    db: AsyncSession = Depends(get_db),
    _: Any = Depends(current_user),
):
    result = await db.execute(select(SemanticMonitor).where(SemanticMonitor.id == monitor_id))
    monitor = result.scalar_one_or_none()
    if not monitor:
        raise HTTPException(status_code=404, detail="Monitor not found")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(monitor, field, value)

    await db.commit()
    await db.refresh(monitor)
    return monitor


@router.delete("/{monitor_id}", status_code=204)
async def delete_monitor(
    monitor_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: Any = Depends(current_user),
):
    result = await db.execute(select(SemanticMonitor).where(SemanticMonitor.id == monitor_id))
    monitor = result.scalar_one_or_none()
    if not monitor:
        raise HTTPException(status_code=404, detail="Monitor not found")
    await db.delete(monitor)
    await db.commit()


@router.get("/{monitor_id}/events", response_model=list[MonitorEventOut])
async def list_events(
    monitor_id: uuid.UUID,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    _: Any = Depends(current_user),
):
    result = await db.execute(
        select(MonitorEvent)
        .where(MonitorEvent.semantic_monitor_id == monitor_id)
        .order_by(MonitorEvent.fired_at.desc())
        .limit(limit)
    )
    return result.scalars().all()
