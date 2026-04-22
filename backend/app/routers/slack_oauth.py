"""
Slack OAuth Router
==================
Handles the Slack OAuth 2.0 flow for connecting a Slack workspace.

Flow:
  1. GET /slack/oauth/start?project_id={id}
       → builds the Slack authorize URL and redirects the browser there.

  2. Slack redirects to GET /slack/oauth/callback?code=...&state={project_id}
       → exchanges the code for an access token + incoming webhook URL
       → saves webhook_url, channel_name, workspace_name to the project
       → redirects browser to {frontend_url}/settings?slack=connected
         (or /settings?slack=error on failure)
"""

import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models.project import Project

router = APIRouter(prefix="/slack", tags=["slack-oauth"])
settings = get_settings()

SLACK_AUTHORIZE_URL = "https://slack.com/oauth/v2/authorize"
SLACK_TOKEN_URL = "https://slack.com/api/oauth.v2.access"

# Scopes needed for incoming webhooks
SLACK_SCOPES = "incoming-webhook"


@router.get("/oauth/start")
async def slack_oauth_start(project_id: uuid.UUID = Query(...)):
    """Redirect user to Slack's OAuth authorization page."""
    if not settings.slack_client_id:
        raise HTTPException(
            status_code=503,
            detail="Slack OAuth is not configured on this server. Set SLACK_CLIENT_ID and SLACK_CLIENT_SECRET."
        )

    params = (
        f"client_id={settings.slack_client_id}"
        f"&scope={SLACK_SCOPES}"
        f"&redirect_uri={settings.slack_redirect_uri}"
        f"&state={project_id}"
    )
    return RedirectResponse(f"{SLACK_AUTHORIZE_URL}?{params}")


@router.get("/oauth/callback")
async def slack_oauth_callback(
    code: str | None = Query(None),
    state: str | None = Query(None),
    error: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Handle Slack's redirect after user authorization."""
    frontend_settings = f"{settings.frontend_url}/settings"

    # User denied access
    if error:
        return RedirectResponse(f"{frontend_settings}?slack=error&reason={error}")

    if not code or not state:
        return RedirectResponse(f"{frontend_settings}?slack=error&reason=missing_params")

    try:
        project_id = uuid.UUID(state)
    except ValueError:
        return RedirectResponse(f"{frontend_settings}?slack=error&reason=invalid_state")

    # Exchange code for token
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            SLACK_TOKEN_URL,
            data={
                "client_id": settings.slack_client_id,
                "client_secret": settings.slack_client_secret,
                "code": code,
                "redirect_uri": settings.slack_redirect_uri,
            },
        )
        data = resp.json()

    if not data.get("ok"):
        reason = data.get("error", "unknown")
        return RedirectResponse(f"{frontend_settings}?slack=error&reason={reason}")

    # Extract webhook info
    webhook = data.get("incoming_webhook", {})
    webhook_url = webhook.get("url", "")
    channel_name = webhook.get("channel", "")
    workspace_name = data.get("team", {}).get("name", "")

    if not webhook_url:
        return RedirectResponse(f"{frontend_settings}?slack=error&reason=no_webhook")

    # Save to project
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        return RedirectResponse(f"{frontend_settings}?slack=error&reason=project_not_found")

    project.slack_webhook_url = webhook_url
    project.slack_channel_name = channel_name.lstrip("#")
    project.slack_workspace_name = workspace_name
    await db.commit()

    return RedirectResponse(f"{frontend_settings}?slack=connected&workspace={workspace_name}")
