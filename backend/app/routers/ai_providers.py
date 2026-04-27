"""
AI Provider key management — organization-level secrets.

Endpoints:
  GET    /orgs/{org_id}/ai-providers            list all providers (masked keys)
  PUT    /orgs/{org_id}/ai-providers/{provider} upsert a key
  DELETE /orgs/{org_id}/ai-providers/{provider} remove a key
"""
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
import uuid

from app.database import get_db
from app.models.ai_provider import OrgAIProvider
from app.routers.auth import get_current_user
from app.models.user import User

router = APIRouter(prefix="/orgs", tags=["ai-providers"])


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class AIProviderOut(BaseModel):
    provider: str
    env_var: str
    api_key_masked: Optional[str]   # None = not configured
    updated_at: Optional[str]

class UpsertProviderBody(BaseModel):
    api_key: str


# ── Known providers catalogue ─────────────────────────────────────────────────

PROVIDERS = [
    {"provider": "openai",      "env_var": "OPENAI_API_KEY",      "label": "OpenAI"},
    {"provider": "anthropic",   "env_var": "ANTHROPIC_API_KEY",   "label": "Anthropic"},
    {"provider": "gemini",      "env_var": "GEMINI_API_KEY",      "label": "Google Gemini"},
    {"provider": "mistral",     "env_var": "MISTRAL_API_KEY",     "label": "Mistral"},
    {"provider": "together",    "env_var": "TOGETHER_API_KEY",    "label": "Together.ai"},
    {"provider": "fireworks",   "env_var": "FIREWORKS_API_KEY",   "label": "Fireworks"},
    {"provider": "groq",        "env_var": "GROQ_API_KEY",        "label": "Groq"},
    {"provider": "cohere",      "env_var": "COHERE_API_KEY",      "label": "Cohere"},
]

PROVIDER_IDS = {p["provider"] for p in PROVIDERS}


def _mask(key: str) -> str:
    if len(key) <= 8:
        return "••••" + key[-2:]
    return "••••••••" + key[-4:]


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/{org_id}/ai-providers", response_model=list[AIProviderOut])
async def list_providers(
    org_id: str,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(OrgAIProvider).where(OrgAIProvider.org_id == uuid.UUID(org_id))
    )
    stored = {row.provider: row for row in result.scalars().all()}

    return [
        AIProviderOut(
            provider=p["provider"],
            env_var=p["env_var"],
            api_key_masked=_mask(row.api_key_enc) if (row := stored.get(p["provider"])) else None,
            updated_at=row.updated_at.isoformat() if row else None,
        )
        for p in PROVIDERS
    ]


@router.put("/{org_id}/ai-providers/{provider}")
async def upsert_provider(
    org_id: str,
    provider: str,
    body: UpsertProviderBody,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    if provider not in PROVIDER_IDS:
        raise HTTPException(status_code=400, detail=f"Unknown provider '{provider}'")
    if not body.api_key.strip():
        raise HTTPException(status_code=400, detail="api_key cannot be empty")

    oid = uuid.UUID(org_id)
    result = await db.execute(
        select(OrgAIProvider).where(
            OrgAIProvider.org_id == oid,
            OrgAIProvider.provider == provider,
        )
    )
    row = result.scalar_one_or_none()

    if row:
        row.api_key_enc = body.api_key.strip()
        row.updated_at = datetime.utcnow()
    else:
        row = OrgAIProvider(
            id=uuid.uuid4(),
            org_id=oid,
            provider=provider,
            api_key_enc=body.api_key.strip(),
        )
        db.add(row)

    await db.commit()
    return {"ok": True, "provider": provider}


@router.delete("/{org_id}/ai-providers/{provider}")
async def delete_provider(
    org_id: str,
    provider: str,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    await db.execute(
        delete(OrgAIProvider).where(
            OrgAIProvider.org_id == uuid.UUID(org_id),
            OrgAIProvider.provider == provider,
        )
    )
    await db.commit()
    return {"ok": True}
