"""
Organizations router — CRUD for orgs, members, and scoped project listing.
"""
from __future__ import annotations

import uuid
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.user import User
from app.models.organization import Organization, OrgMember
from app.routers.auth import get_current_user
from app.services.auth_service import slugify

router = APIRouter(prefix="/orgs", tags=["orgs"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class CreateOrgRequest(BaseModel):
    name: str


class OrgResponse(BaseModel):
    id: str
    name: str
    slug: str
    role: str
    created_at: str


class MemberResponse(BaseModel):
    id: str
    user_id: str
    email: str
    name: str | None
    avatar_url: str | None
    role: str
    joined_at: str


class InviteMemberRequest(BaseModel):
    email: str
    role: str = "member"


class UpdateRoleRequest(BaseModel):
    role: str


# ── List orgs for current user ─────────────────────────────────────────────────

@router.get("", response_model=list[OrgResponse])
async def list_orgs(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(OrgMember)
        .where(OrgMember.user_id == current_user.id)
        .options(selectinload(OrgMember.org))
        .order_by(OrgMember.created_at)
    )
    memberships = result.scalars().all()
    return [
        OrgResponse(
            id=str(m.org.id),
            name=m.org.name,
            slug=m.org.slug,
            role=m.role,
            created_at=m.org.created_at.isoformat(),
        )
        for m in memberships
    ]


# ── Create org ─────────────────────────────────────────────────────────────────

@router.post("", response_model=OrgResponse, status_code=201)
async def create_org(
    body: CreateOrgRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    slug = slugify(body.name)
    org = Organization(name=body.name, slug=slug)
    db.add(org)
    await db.flush()

    member = OrgMember(org_id=org.id, user_id=current_user.id, role="owner")
    db.add(member)
    await db.flush()

    return OrgResponse(id=str(org.id), name=org.name, slug=org.slug, role="owner", created_at=org.created_at.isoformat())


# ── Get single org (must be a member) ─────────────────────────────────────────

async def _require_membership(
    org_id: uuid.UUID,
    current_user: User,
    db: AsyncSession,
    min_role: str = "member",
) -> OrgMember:
    result = await db.execute(
        select(OrgMember).where(
            and_(OrgMember.org_id == org_id, OrgMember.user_id == current_user.id)
        )
    )
    membership = result.scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this organization")
    role_order = {"member": 0, "admin": 1, "owner": 2}
    if role_order.get(membership.role, 0) < role_order.get(min_role, 0):
        raise HTTPException(status_code=403, detail=f"Requires {min_role} role")
    return membership


@router.get("/{org_id}", response_model=OrgResponse)
async def get_org(
    org_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    m = await _require_membership(org_id, current_user, db)
    result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return OrgResponse(id=str(org.id), name=org.name, slug=org.slug, role=m.role, created_at=org.created_at.isoformat())


# ── Update org name ────────────────────────────────────────────────────────────

@router.patch("/{org_id}", response_model=OrgResponse)
async def update_org(
    org_id: uuid.UUID,
    body: CreateOrgRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    m = await _require_membership(org_id, current_user, db, min_role="admin")
    result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    org.name = body.name
    await db.flush()
    return OrgResponse(id=str(org.id), name=org.name, slug=org.slug, role=m.role, created_at=org.created_at.isoformat())


# ── Delete org ─────────────────────────────────────────────────────────────────

@router.delete("/{org_id}", status_code=204)
async def delete_org(
    org_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_membership(org_id, current_user, db, min_role="owner")
    result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = result.scalar_one_or_none()
    if org:
        await db.delete(org)


# ── Members ────────────────────────────────────────────────────────────────────

@router.get("/{org_id}/members", response_model=list[MemberResponse])
async def list_members(
    org_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_membership(org_id, current_user, db)
    result = await db.execute(
        select(OrgMember)
        .where(OrgMember.org_id == org_id)
        .options(selectinload(OrgMember.user))
        .order_by(OrgMember.created_at)
    )
    members = result.scalars().all()
    return [
        MemberResponse(
            id=str(m.id),
            user_id=str(m.user_id),
            email=m.user.email,
            name=m.user.name,
            avatar_url=m.user.avatar_url,
            role=m.role,
            joined_at=m.created_at.isoformat(),
        )
        for m in members
    ]


@router.post("/{org_id}/members", status_code=201)
async def invite_member(
    org_id: uuid.UUID,
    body: InviteMemberRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_membership(org_id, current_user, db, min_role="admin")

    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found — they must register first")

    existing = await db.execute(
        select(OrgMember).where(and_(OrgMember.org_id == org_id, OrgMember.user_id == user.id))
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="User is already a member")

    m = OrgMember(org_id=org_id, user_id=user.id, role=body.role)
    db.add(m)
    await db.flush()
    return {"ok": True, "user_id": str(user.id), "role": body.role}


@router.patch("/{org_id}/members/{member_id}", response_model=dict)
async def update_member_role(
    org_id: uuid.UUID,
    member_id: uuid.UUID,
    body: UpdateRoleRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_membership(org_id, current_user, db, min_role="admin")
    result = await db.execute(select(OrgMember).where(and_(OrgMember.id == member_id, OrgMember.org_id == org_id)))
    m = result.scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="Member not found")
    m.role = body.role
    await db.flush()
    return {"ok": True}


@router.delete("/{org_id}/members/{member_id}", status_code=204)
async def remove_member(
    org_id: uuid.UUID,
    member_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_membership(org_id, current_user, db, min_role="admin")
    result = await db.execute(select(OrgMember).where(and_(OrgMember.id == member_id, OrgMember.org_id == org_id)))
    m = result.scalar_one_or_none()
    if m:
        await db.delete(m)
