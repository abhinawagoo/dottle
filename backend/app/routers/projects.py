import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.project import Project
from app.models.organization import OrgMember
from app.models.user import User
from app.routers.auth import get_current_user

router = APIRouter(prefix="/projects", tags=["projects"])


class ProjectCreate(BaseModel):
    name: str
    description: str | None = None
    org_id: uuid.UUID


class ProjectResponse(BaseModel):
    id: uuid.UUID
    org_id: uuid.UUID | None
    name: str
    description: str | None
    api_key: str
    created_at: datetime

    model_config = {"from_attributes": True}


async def _require_org_access(org_id: uuid.UUID, user: User, db: AsyncSession, min_role: str = "member") -> OrgMember:
    result = await db.execute(
        select(OrgMember).where(and_(OrgMember.org_id == org_id, OrgMember.user_id == user.id))
    )
    m = result.scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=403, detail="Not a member of this organization")
    role_order = {"member": 0, "admin": 1, "owner": 2}
    if role_order.get(m.role, 0) < role_order.get(min_role, 0):
        raise HTTPException(status_code=403, detail=f"Requires {min_role} role")
    return m


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    body: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_org_access(body.org_id, current_user, db, min_role="admin")

    project = Project(
        id=uuid.uuid4(),
        org_id=body.org_id,
        created_by=current_user.id,
        name=body.name,
        description=body.description,
        api_key=f"dtl_live_{secrets.token_urlsafe(32)}",
        created_at=datetime.now(timezone.utc),
    )
    db.add(project)
    await db.flush()
    return project


@router.get("", response_model=list[ProjectResponse])
async def list_projects(
    org_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_org_access(org_id, current_user, db)
    result = await db.execute(
        select(Project).where(Project.org_id == org_id).order_by(Project.created_at.desc())
    )
    return result.scalars().all()


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.org_id:
        await _require_org_access(project.org_id, current_user, db)
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.org_id:
        await _require_org_access(project.org_id, current_user, db, min_role="admin")
    await db.delete(project)


@router.post("/{project_id}/regenerate-key", response_model=ProjectResponse)
async def regenerate_api_key(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.org_id:
        await _require_org_access(project.org_id, current_user, db, min_role="admin")
    project.api_key = f"dtl_live_{secrets.token_urlsafe(32)}"
    await db.flush()
    return project
