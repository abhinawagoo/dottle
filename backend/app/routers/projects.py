import secrets
import uuid
from datetime import datetime, timezone

import httpx
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


# ── Slack Integration ─────────────────────────────────────────────────────────

class SlackConfigInput(BaseModel):
    webhook_url: str
    channel_name: str | None = None


class SlackConfigResponse(BaseModel):
    project_id: uuid.UUID
    webhook_url_masked: str   # show only last 8 chars of the token part
    channel_name: str | None
    workspace_name: str | None


async def _get_project_with_access(project_id: uuid.UUID, user: User, db: AsyncSession) -> Project:
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.org_id:
        await _require_org_access(project.org_id, user, db)
    return project


def _mask_webhook(url: str) -> str:
    """Show only the last 8 chars so users can verify which webhook is saved."""
    return "https://hooks.slack.com/…" + url[-8:] if len(url) > 8 else "****"


@router.get("/{project_id}/slack", response_model=SlackConfigResponse)
async def get_slack_config(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await _get_project_with_access(project_id, current_user, db)
    if not project.slack_webhook_url:
        raise HTTPException(status_code=404, detail="No Slack integration configured")
    return SlackConfigResponse(
        project_id=project.id,
        webhook_url_masked=_mask_webhook(project.slack_webhook_url),
        channel_name=project.slack_channel_name,
        workspace_name=project.slack_workspace_name,
    )


@router.put("/{project_id}/slack", response_model=SlackConfigResponse)
async def save_slack_config(
    project_id: uuid.UUID,
    body: SlackConfigInput,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await _get_project_with_access(project_id, current_user, db)

    # Validate webhook by sending a test payload
    if not body.webhook_url.startswith("https://hooks.slack.com/"):
        raise HTTPException(
            status_code=422,
            detail="Invalid webhook URL — must start with https://hooks.slack.com/"
        )
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(body.webhook_url, json={"text": "✅ Dottle connected to this Slack channel."})
        if resp.status_code != 200 or resp.text != "ok":
            raise HTTPException(
                status_code=422,
                detail=f"Slack rejected the webhook (HTTP {resp.status_code}). Check the URL and try again."
            )

    project.slack_webhook_url = body.webhook_url
    project.slack_channel_name = body.channel_name
    await db.commit()
    return SlackConfigResponse(
        project_id=project.id,
        webhook_url_masked=_mask_webhook(project.slack_webhook_url),
        channel_name=project.slack_channel_name,
        workspace_name=project.slack_workspace_name,
    )


@router.delete("/{project_id}/slack", status_code=status.HTTP_204_NO_CONTENT)
async def delete_slack_config(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await _get_project_with_access(project_id, current_user, db)
    project.slack_webhook_url = None
    project.slack_channel_name = None
    project.slack_workspace_name = None
    await db.commit()


@router.post("/{project_id}/slack/test", status_code=200)
async def test_slack_config(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Send a test alert to the configured Slack webhook."""
    project = await _get_project_with_access(project_id, current_user, db)
    if not project.slack_webhook_url:
        raise HTTPException(status_code=422, detail="No Slack webhook configured")

    payload = {
        "blocks": [
            {"type": "header", "text": {"type": "plain_text", "text": "🚨 Dottle Alert — Test Message"}},
            {"type": "section", "text": {"type": "mrkdwn", "text": f"*Project:* {project.name}\n\nThis is a test notification from Dottle. Your Slack integration is working correctly."}},
            {"type": "context", "elements": [{"type": "mrkdwn", "text": "Sent by Dottle · AI Agent Observability"}]}
        ]
    }
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(project.slack_webhook_url, json=payload)
        if resp.status_code != 200:
            raise HTTPException(status_code=500, detail="Failed to send test message to Slack")
    return {"ok": True, "message": "Test message sent to Slack"}
