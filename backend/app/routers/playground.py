"""
Playground router
=================
Run a prompt against a model directly from the UI.
POST /playground/run  — execute messages, return response + token usage
"""
import httpx
import structlog
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.routers.auth import get_current_user
from app.models.user import User
from app.config import get_settings

router = APIRouter(prefix="/playground", tags=["playground"])
logger = structlog.get_logger()
settings = get_settings()

SUPPORTED_MODELS = {
    # Anthropic
    "claude-sonnet-4-6":            "anthropic",
    "claude-opus-4-6":              "anthropic",
    "claude-haiku-4-5-20251001":    "anthropic",
    # OpenAI — user must supply own key via header (not implemented in MVP)
}


class Message(BaseModel):
    role: str   # "user" | "assistant" | "system"
    content: str


class PlaygroundRunRequest(BaseModel):
    model: str = "claude-sonnet-4-6"
    system: Optional[str] = None
    messages: list[Message]
    temperature: float = 1.0
    max_tokens: int = 1024


class PlaygroundRunResponse(BaseModel):
    content: str
    model: str
    input_tokens: int
    output_tokens: int
    cost_usd: float


# Rough cost per 1M tokens (input, output) for common models
COST_TABLE = {
    "claude-sonnet-4-6":         (3.0,  15.0),
    "claude-opus-4-6":           (15.0, 75.0),
    "claude-haiku-4-5-20251001": (0.8,  4.0),
}


@router.post("/run", response_model=PlaygroundRunResponse)
async def run_playground(
    body: PlaygroundRunRequest,
    _: User = Depends(get_current_user),
):
    provider = SUPPORTED_MODELS.get(body.model)
    if not provider:
        raise HTTPException(400, f"Model '{body.model}' not supported in playground")

    if provider == "anthropic":
        # Separate system message from conversation
        system_text = body.system or ""
        # If first message is system role, pull it out
        msgs = [m for m in body.messages if m.role != "system"]
        extra_system = next((m.content for m in body.messages if m.role == "system"), None)
        if extra_system:
            system_text = (system_text + "\n\n" + extra_system).strip()

        payload: dict = {
            "model": body.model,
            "max_tokens": body.max_tokens,
            "temperature": body.temperature,
            "messages": [{"role": m.role, "content": m.content} for m in msgs],
        }
        if system_text:
            payload["system"] = system_text

        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": settings.anthropic_api_key,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json",
                    },
                    json=payload,
                )
        except Exception as e:
            raise HTTPException(503, f"LLM call failed: {e}")

        if resp.status_code != 200:
            raise HTTPException(502, f"LLM returned {resp.status_code}: {resp.text[:200]}")

        data = resp.json()
        content = data["content"][0]["text"]
        input_tokens = data["usage"]["input_tokens"]
        output_tokens = data["usage"]["output_tokens"]

        rates = COST_TABLE.get(body.model, (3.0, 15.0))
        cost = (input_tokens * rates[0] + output_tokens * rates[1]) / 1_000_000

        return PlaygroundRunResponse(
            content=content,
            model=body.model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_usd=round(cost, 6),
        )

    raise HTTPException(400, "Unsupported provider")
