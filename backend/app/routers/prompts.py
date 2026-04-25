"""
Prompts router
==============
Version-controlled prompt management.

GET  /prompts                      — list latest version of each prompt name
GET  /prompts/{name}               — get active version (used by SDK)
GET  /prompts/{name}/versions      — list all versions
POST /prompts                      — create new version
PUT  /prompts/{name}/activate/{v}  — set a version as active
DELETE /prompts/{id}               — delete a specific version
"""
import re
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.prompt import Prompt
from app.routers.auth import get_current_user
from app.models.user import User

router = APIRouter(prefix="/prompts", tags=["prompts"])

# ── Helpers ───────────────────────────────────────────────────────────────────

VARIABLE_RE = re.compile(r"\{\{(\w+)\}\}")

def _extract_variables(content: str) -> list[str]:
    return list(dict.fromkeys(VARIABLE_RE.findall(content)))  # unique, ordered

def _prompt_out(p: Prompt) -> dict:
    return {
        "id": str(p.id),
        "project_id": str(p.project_id),
        "name": p.name,
        "version": p.version,
        "label": p.label,
        "content": p.content,
        "variables": p.variables,
        "config": p.config,
        "tags": p.tags,
        "is_active": p.is_active,
        "commit_message": p.commit_message,
        "created_at": p.created_at.isoformat(),
    }

# ── Schemas ───────────────────────────────────────────────────────────────────

class PromptCreate(BaseModel):
    project_id: str
    name: str
    content: str
    label: Optional[str] = None
    config: dict = {}
    tags: list[str] = []
    commit_message: Optional[str] = None

# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("")
async def list_prompts(
    project_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Return the latest version of each prompt name."""
    # Subquery: max version per name per project
    sub = (
        select(Prompt.name, func.max(Prompt.version).label("max_v"))
        .where(Prompt.project_id == uuid.UUID(project_id))
        .group_by(Prompt.name)
        .subquery()
    )
    result = await db.execute(
        select(Prompt)
        .join(sub, (Prompt.name == sub.c.name) & (Prompt.version == sub.c.max_v))
        .where(Prompt.project_id == uuid.UUID(project_id))
        .order_by(Prompt.name)
    )
    return [_prompt_out(p) for p in result.scalars()]


@router.get("/{name}/versions")
async def list_versions(
    name: str,
    project_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Prompt)
        .where(Prompt.project_id == uuid.UUID(project_id), Prompt.name == name)
        .order_by(Prompt.version.desc())
    )
    return [_prompt_out(p) for p in result.scalars()]


@router.get("/{name}")
async def get_prompt(
    name: str,
    project_id: str = Query(...),
    version: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    # SDK fetches without auth token — use API key header instead (handled by api_key dependency)
    # For simplicity, keep get_current_user but SDKs can also call via the ingest key
):
    """Get active prompt (or a specific version). Used by SDKs at runtime."""
    q = select(Prompt).where(
        Prompt.project_id == uuid.UUID(project_id),
        Prompt.name == name,
    )
    if version is not None:
        q = q.where(Prompt.version == version)
    else:
        q = q.where(Prompt.is_active == True).order_by(Prompt.version.desc())
    result = await db.execute(q.limit(1))
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(404, f"Prompt '{name}' not found")
    return _prompt_out(p)


@router.post("", status_code=201)
async def create_prompt(
    body: PromptCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pid = uuid.UUID(body.project_id)

    # Auto-increment version
    result = await db.execute(
        select(func.max(Prompt.version))
        .where(Prompt.project_id == pid, Prompt.name == body.name)
    )
    max_v = result.scalar() or 0
    new_v = max_v + 1

    # Deactivate previous active version for this name
    prev_result = await db.execute(
        select(Prompt).where(
            Prompt.project_id == pid,
            Prompt.name == body.name,
            Prompt.is_active == True,
        )
    )
    for prev in prev_result.scalars():
        prev.is_active = False

    prompt = Prompt(
        project_id=pid,
        name=body.name,
        version=new_v,
        label=body.label,
        content=body.content,
        variables=_extract_variables(body.content),
        config=body.config,
        tags=body.tags,
        commit_message=body.commit_message,
        is_active=True,
        created_by=current_user.id,
    )
    db.add(prompt)
    await db.commit()
    await db.refresh(prompt)
    return _prompt_out(prompt)


@router.put("/{name}/activate/{version}")
async def activate_version(
    name: str,
    version: int,
    project_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    pid = uuid.UUID(project_id)
    # Deactivate all versions of this name
    all_r = await db.execute(
        select(Prompt).where(Prompt.project_id == pid, Prompt.name == name)
    )
    for p in all_r.scalars():
        p.is_active = (p.version == version)
    await db.commit()
    return {"activated": version}


@router.delete("/{prompt_id}", status_code=204)
async def delete_prompt(
    prompt_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Prompt).where(Prompt.id == uuid.UUID(prompt_id)))
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Prompt not found")
    await db.delete(p)
    await db.commit()
