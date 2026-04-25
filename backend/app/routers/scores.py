"""
Scores router
=============
Human or model-generated quality scores on sessions/spans.
POST /scores          — create a score
GET  /scores          — list scores for a project (filterable by session)
DELETE /scores/{id}   — delete a score
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.score import Score
from app.routers.auth import get_current_user
from app.models.user import User

router = APIRouter(prefix="/scores", tags=["scores"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class ScoreCreate(BaseModel):
    project_id: str
    session_id: str
    span_id: Optional[str] = None
    name: str = "quality"           # "quality" | "thumbs" | "relevance" | custom
    value: float                     # 1.0 / -1.0 for thumbs; 0–1 for numeric
    string_value: Optional[str] = None
    comment: Optional[str] = None
    source: str = "human"


class ScoreOut(BaseModel):
    id: str
    project_id: str
    session_id: str
    span_id: Optional[str]
    name: str
    value: float
    string_value: Optional[str]
    comment: Optional[str]
    source: str
    model_name: Optional[str]
    created_at: str

    class Config:
        from_attributes = True


def _score_out(s: Score) -> ScoreOut:
    return ScoreOut(
        id=str(s.id),
        project_id=str(s.project_id),
        session_id=str(s.session_id),
        span_id=str(s.span_id) if s.span_id else None,
        name=s.name,
        value=s.value,
        string_value=s.string_value,
        comment=s.comment,
        source=s.source,
        model_name=s.model_name,
        created_at=s.created_at.isoformat(),
    )


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("", response_model=ScoreOut, status_code=201)
async def create_score(
    body: ScoreCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    score = Score(
        project_id=uuid.UUID(body.project_id),
        session_id=uuid.UUID(body.session_id),
        span_id=uuid.UUID(body.span_id) if body.span_id else None,
        name=body.name,
        value=body.value,
        string_value=body.string_value,
        comment=body.comment,
        source=body.source,
        created_by=current_user.id,
    )
    db.add(score)
    await db.commit()
    await db.refresh(score)
    return _score_out(score)


@router.get("", response_model=list[ScoreOut])
async def list_scores(
    project_id: str = Query(...),
    session_id: Optional[str] = Query(None),
    name: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = select(Score).where(Score.project_id == uuid.UUID(project_id))
    if session_id:
        q = q.where(Score.session_id == uuid.UUID(session_id))
    if name:
        q = q.where(Score.name == name)
    q = q.order_by(Score.created_at.desc()).limit(500)
    result = await db.execute(q)
    return [_score_out(s) for s in result.scalars()]


@router.delete("/{score_id}", status_code=204)
async def delete_score(
    score_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Score).where(Score.id == uuid.UUID(score_id)))
    score = result.scalar_one_or_none()
    if not score:
        raise HTTPException(404, "Score not found")
    await db.delete(score)
    await db.commit()
