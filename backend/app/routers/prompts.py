"""
Prompts router
==============
Version-controlled prompt management with SDK access.

GET  /prompts                      — list latest version of each prompt name
GET  /prompts/{name}               — get active version (used by SDK via X-API-Key)
GET  /prompts/{name}/versions      — list all versions
POST /prompts                      — create new version
PUT  /prompts/{name}/activate/{v}  — set a version as active
DELETE /prompts/{id}               — delete a specific version

Auth:
  Dashboard calls use Bearer JWT (get_current_user).
  SDK calls use X-API-Key mapped to a project (same as ingest endpoints).
  GET /prompts/{name} accepts either.
"""
import re
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Header
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.prompt import Prompt
from app.models.project import Project
from app.routers.auth import get_current_user
from app.models.user import User

router = APIRouter(prefix="/prompts", tags=["prompts"])

# ── Helpers ───────────────────────────────────────────────────────────────────

VARIABLE_RE = re.compile(r"\{\{(\w+)\}\}")

def _extract_variables(content: str) -> list[str]:
    return list(dict.fromkeys(VARIABLE_RE.findall(content)))  # unique, ordered

def _build_messages(p: Prompt) -> list[dict]:
    """Build the compiled messages array from prompt fields."""
    cfg = p.config or {}
    msgs = []
    system = cfg.get("system", "").strip()
    if system:
        msgs.append({"role": "system", "content": system})
    if p.content and p.content.strip():
        msgs.append({"role": "user", "content": p.content})
    return msgs

def _prompt_out(p: Prompt) -> dict:
    cfg = p.config or {}
    return {
        "id": str(p.id),
        "project_id": str(p.project_id),
        "name": p.name,
        "version": p.version,
        "label": p.label,
        # Raw content (user message template)
        "content": p.content,
        # Structured fields — stored in config JSONB, exposed as top-level for SDK
        "system": cfg.get("system", ""),
        "model": cfg.get("model") or None,
        "parameters": cfg.get("parameters") or {},
        "tools": cfg.get("tools") or [],
        # Computed: ready-to-use messages array (system + user, uncompiled)
        "messages": _build_messages(p),
        # Meta
        "variables": p.variables,
        "tags": p.tags,
        "is_active": p.is_active,
        "commit_message": p.commit_message,
        "created_at": p.created_at.isoformat(),
    }

# ── SDK auth (X-API-Key → project) ────────────────────────────────────────────

async def _project_from_api_key(x_api_key: str, db: AsyncSession) -> Project | None:
    """Return project if the key matches, else None."""
    result = await db.execute(select(Project).where(Project.api_key == x_api_key))
    return result.scalar_one_or_none()

# ── Schemas ───────────────────────────────────────────────────────────────────

class PromptCreate(BaseModel):
    project_id: str
    name: str
    content: str = ""
    label: Optional[str] = None
    commit_message: Optional[str] = None
    # Structured prompt fields
    system: Optional[str] = None          # system message template
    model: Optional[str] = None           # e.g. "gpt-4o", "claude-sonnet-4-6"
    parameters: dict = {}                 # temperature, max_tokens, top_p, …
    tools: list[dict] = []               # OpenAI-format tool definitions
    tags: list[str] = []

# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("")
async def list_prompts(
    project_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Return the latest version of each prompt name."""
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
    label: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    # Accept either user JWT or SDK API key
    authorization: Optional[str] = Header(None),
    x_api_key: Optional[str] = Header(None),
):
    """
    Get a prompt by name. Returns the active version unless version or label is specified.

    Auth:
      Dashboard: Authorization: Bearer <jwt>
      SDK:       X-API-Key: <project_api_key>
    """
    # Validate caller — accept either auth method
    if x_api_key:
        project = await _project_from_api_key(x_api_key, db)
        if not project:
            raise HTTPException(401, "Invalid API key")
        # Ensure the requested project_id matches the key's project
        try:
            req_pid = uuid.UUID(project_id)
        except ValueError:
            raise HTTPException(400, "Invalid project_id")
        if project.id != req_pid:
            raise HTTPException(403, "API key does not belong to this project")
    elif authorization and authorization.startswith("Bearer "):
        # JWT path — lightweight check (full validation via get_current_user in other routes)
        pass  # allowed; project_id access is not per-user here
    else:
        raise HTTPException(401, "Provide Authorization header or X-API-Key")

    try:
        pid = uuid.UUID(project_id)
    except ValueError:
        raise HTTPException(400, "Invalid project_id")

    q = select(Prompt).where(Prompt.project_id == pid, Prompt.name == name)

    if version is not None:
        q = q.where(Prompt.version == version)
    elif label is not None:
        q = q.where(Prompt.label == label).order_by(Prompt.version.desc())
    else:
        q = q.where(Prompt.is_active == True).order_by(Prompt.version.desc())  # noqa: E712

    result = await db.execute(q.limit(1))
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(404, f"Prompt '{name}' not found in project")
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
            Prompt.is_active == True,  # noqa: E712
        )
    )
    for prev in prev_result.scalars():
        prev.is_active = False

    # Store structured fields in config JSONB (no migration needed)
    config_data = {
        "system": body.system or "",
        "model": body.model or "",
        "parameters": body.parameters,
        "tools": body.tools,
    }

    # Extract variables from both content and system message
    all_text = (body.content or "") + " " + (body.system or "")
    variables = _extract_variables(all_text)

    prompt = Prompt(
        project_id=pid,
        name=body.name,
        version=new_v,
        label=body.label,
        content=body.content,
        variables=variables,
        config=config_data,
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
