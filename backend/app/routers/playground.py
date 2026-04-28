"""
Playground router
=================
Run a prompt against any configured AI provider directly from the UI.

POST /playground/run
POST /playground/models  — list available models for a project's configured providers
"""
import httpx
import json
import structlog
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.routers.auth import get_current_user
from app.models.user import User
from app.models.ai_provider import OrgAIProvider
from app.database import get_db
from app.config import get_settings

router = APIRouter(prefix="/playground", tags=["playground"])
logger = structlog.get_logger()
settings = get_settings()

# ── Provider catalogue ────────────────────────────────────────────────────────

PROVIDER_MODELS: dict[str, list[dict]] = {
    "anthropic": [
        {"id": "claude-sonnet-4-6",          "label": "Claude Sonnet 4.6"},
        {"id": "claude-opus-4-6",            "label": "Claude Opus 4.6"},
        {"id": "claude-haiku-4-5-20251001",  "label": "Claude Haiku 4.5"},
    ],
    "openai": [
        {"id": "gpt-4o",        "label": "GPT-4o"},
        {"id": "gpt-4o-mini",   "label": "GPT-4o mini"},
        {"id": "o1",            "label": "o1"},
        {"id": "o1-mini",       "label": "o1-mini"},
    ],
    "gemini": [
        {"id": "gemini-2.0-flash",       "label": "Gemini 2.0 Flash"},
        {"id": "gemini-1.5-pro",         "label": "Gemini 1.5 Pro"},
        {"id": "gemini-1.5-flash",       "label": "Gemini 1.5 Flash"},
    ],
    "mistral": [
        {"id": "mistral-large-latest",   "label": "Mistral Large"},
        {"id": "mistral-small-latest",   "label": "Mistral Small"},
        {"id": "open-mixtral-8x7b",      "label": "Mixtral 8x7B"},
    ],
    "groq": [
        {"id": "llama-3.3-70b-versatile",   "label": "Llama 3.3 70B"},
        {"id": "llama-3.1-8b-instant",      "label": "Llama 3.1 8B"},
        {"id": "mixtral-8x7b-32768",        "label": "Mixtral 8x7B (Groq)"},
    ],
    "together": [
        {"id": "meta-llama/Llama-3.3-70B-Instruct-Turbo", "label": "Llama 3.3 70B Turbo"},
        {"id": "mistralai/Mixtral-8x7B-Instruct-v0.1",    "label": "Mixtral 8x7B"},
        {"id": "google/gemma-2-27b-it",                    "label": "Gemma 2 27B"},
    ],
}

# cost per 1M tokens (input, output)
COST_TABLE: dict[str, tuple[float, float]] = {
    "claude-sonnet-4-6":            (3.0,   15.0),
    "claude-opus-4-6":              (15.0,  75.0),
    "claude-haiku-4-5-20251001":    (0.8,   4.0),
    "gpt-4o":                       (5.0,   15.0),
    "gpt-4o-mini":                  (0.15,  0.6),
    "o1":                           (15.0,  60.0),
    "o1-mini":                      (3.0,   12.0),
    "gemini-2.0-flash":             (0.075, 0.3),
    "gemini-1.5-pro":               (3.5,   10.5),
    "gemini-1.5-flash":             (0.075, 0.3),
    "mistral-large-latest":         (3.0,   9.0),
    "mistral-small-latest":         (0.2,   0.6),
    "open-mixtral-8x7b":            (0.7,   0.7),
    "llama-3.3-70b-versatile":      (0.59,  0.79),
    "llama-3.1-8b-instant":         (0.05,  0.08),
    "mixtral-8x7b-32768":           (0.27,  0.27),
}

MODEL_TO_PROVIDER: dict[str, str] = {
    m["id"]: provider
    for provider, models in PROVIDER_MODELS.items()
    for m in models
}


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class Message(BaseModel):
    role: str
    content: str


class PlaygroundRunRequest(BaseModel):
    model: str = "claude-sonnet-4-6"
    system: Optional[str] = None
    messages: list[Message]
    temperature: float = 1.0
    max_tokens: int = 1024
    org_id: Optional[str] = None   # used to look up org-level AI provider keys


class PlaygroundRunResponse(BaseModel):
    content: str
    model: str
    provider: str
    input_tokens: int
    output_tokens: int
    cost_usd: float


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_api_key(provider: str, org_id: Optional[str], db: AsyncSession) -> str:
    """Return stored org-level key for provider, falling back to env var for Anthropic."""
    if org_id:
        import uuid as _uuid
        try:
            oid = _uuid.UUID(org_id)
        except ValueError:
            oid = None
        if oid:
            result = await db.execute(
                select(OrgAIProvider).where(
                    OrgAIProvider.org_id == oid,
                    OrgAIProvider.provider == provider,
                )
            )
            row = result.scalar_one_or_none()
            if row:
                return row.api_key_enc

    raise HTTPException(
        status_code=400,
        detail=f"No API key configured for provider '{provider}'. Add one in Settings → AI Providers.",
    )


def _calc_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    rates = COST_TABLE.get(model, (5.0, 15.0))
    return round((input_tokens * rates[0] + output_tokens * rates[1]) / 1_000_000, 6)


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/models")
async def list_models(
    org_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Return all providers and their models, marking which ones have a key configured."""
    configured: set[str] = set()  # only show providers the org has explicitly configured
    if org_id:
        import uuid as _uuid
        try:
            oid = _uuid.UUID(org_id)
            result = await db.execute(
                select(OrgAIProvider.provider).where(OrgAIProvider.org_id == oid)
            )
            configured.update(r for r, in result.all())
        except ValueError:
            pass

    return [
        {
            "provider": provider,
            "configured": provider in configured,
            "models": models,
        }
        for provider, models in PROVIDER_MODELS.items()
    ]


@router.post("/run", response_model=PlaygroundRunResponse)
async def run_playground(
    body: PlaygroundRunRequest,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    provider = MODEL_TO_PROVIDER.get(body.model)
    if not provider:
        raise HTTPException(400, f"Unknown model '{body.model}'")

    api_key = await _get_api_key(provider, body.org_id, db)

    # ── Anthropic ──
    if provider == "anthropic":
        system_text = body.system or ""
        msgs = [m for m in body.messages if m.role != "system"]
        extra = next((m.content for m in body.messages if m.role == "system"), None)
        if extra:
            system_text = (system_text + "\n\n" + extra).strip()

        payload: dict = {
            "model": body.model,
            "max_tokens": body.max_tokens,
            "temperature": body.temperature,
            "messages": [{"role": m.role, "content": m.content} for m in msgs],
        }
        if system_text:
            payload["system"] = system_text

        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                json=payload,
            )
        if resp.status_code != 200:
            raise HTTPException(502, f"Anthropic returned {resp.status_code}: {resp.text[:300]}")
        data = resp.json()
        content = data["content"][0]["text"]
        in_tok, out_tok = data["usage"]["input_tokens"], data["usage"]["output_tokens"]

    # ── OpenAI / Groq / Together / Mistral (OpenAI-compatible) ──
    elif provider in ("openai", "groq", "together", "mistral"):
        base_urls = {
            "openai":   "https://api.openai.com/v1",
            "groq":     "https://api.groq.com/openai/v1",
            "together": "https://api.together.xyz/v1",
            "mistral":  "https://api.mistral.ai/v1",
        }
        msgs = []
        if body.system:
            msgs.append({"role": "system", "content": body.system})
        msgs.extend({"role": m.role, "content": m.content} for m in body.messages if m.role != "system")

        payload = {
            "model": body.model,
            "messages": msgs,
            "max_tokens": body.max_tokens,
        }
        # o1 models don't support temperature
        if body.model not in ("o1", "o1-mini"):
            payload["temperature"] = body.temperature

        async with httpx.AsyncClient(timeout=90) as client:
            resp = await client.post(
                f"{base_urls[provider]}/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "content-type": "application/json"},
                json=payload,
            )
        if resp.status_code != 200:
            raise HTTPException(502, f"{provider} returned {resp.status_code}: {resp.text[:300]}")
        data = resp.json()
        content = data["choices"][0]["message"]["content"]
        in_tok = data["usage"]["prompt_tokens"]
        out_tok = data["usage"]["completion_tokens"]

    # ── Gemini ──
    elif provider == "gemini":
        gem_msgs = []
        for m in body.messages:
            if m.role == "system":
                continue
            gem_msgs.append({"role": "user" if m.role == "user" else "model", "parts": [{"text": m.content}]})

        payload = {
            "contents": gem_msgs,
            "generationConfig": {"maxOutputTokens": body.max_tokens, "temperature": body.temperature},
        }
        if body.system:
            payload["systemInstruction"] = {"parts": [{"text": body.system}]}

        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{body.model}:generateContent",
                params={"key": api_key},
                headers={"content-type": "application/json"},
                json=payload,
            )
        if resp.status_code != 200:
            raise HTTPException(502, f"Gemini returned {resp.status_code}: {resp.text[:300]}")
        data = resp.json()
        content = data["candidates"][0]["content"]["parts"][0]["text"]
        meta = data.get("usageMetadata", {})
        in_tok = meta.get("promptTokenCount", 0)
        out_tok = meta.get("candidatesTokenCount", 0)

    else:
        raise HTTPException(400, f"Provider '{provider}' not implemented")

    return PlaygroundRunResponse(
        content=content,
        model=body.model,
        provider=provider,
        input_tokens=in_tok,
        output_tokens=out_tok,
        cost_usd=_calc_cost(body.model, in_tok, out_tok),
    )
