"""
Experiments router — A/B test prompts and models against a dataset.

Endpoints:
  GET    /experiments                     list
  POST   /experiments                     create
  GET    /experiments/{id}               detail + runs
  POST   /experiments/{id}/run           kick off evaluation run
  DELETE /experiments/{id}               delete
"""
import uuid
import httpx
import json
import structlog
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, AsyncSessionLocal
from app.routers.auth import get_current_user
from app.models.user import User
from app.models.experiment import Experiment, ExperimentRun
from app.models.dataset import Dataset, DatasetItem
from app.models.ai_provider import ProjectAIProvider
from app.config import get_settings

router = APIRouter(prefix="/experiments", tags=["experiments"])
logger = structlog.get_logger()
settings = get_settings()


# ── Schemas ───────────────────────────────────────────────────────────────────

class VariantConfig(BaseModel):
    model: str
    system_prompt: str = ""
    label: Optional[str] = None   # display name e.g. "GPT-4o + new prompt"


class CreateExperimentBody(BaseModel):
    project_id: str
    name: str
    description: Optional[str] = None
    dataset_id: Optional[str] = None
    eval_criteria: Optional[str] = None
    variant_a: VariantConfig
    variant_b: VariantConfig


class ExperimentOut(BaseModel):
    id: str
    name: str
    description: Optional[str]
    dataset_id: Optional[str]
    variant_a: dict
    variant_b: dict
    status: str
    result_summary: Optional[dict]
    created_at: str
    completed_at: Optional[str]


class RunDetail(BaseModel):
    id: str
    variant: str
    item_index: int
    input_text: Optional[str]
    response_text: Optional[str]
    score: Optional[float]
    reasoning: Optional[str]
    status: str


class ExperimentDetailOut(ExperimentOut):
    runs: list[RunDetail]


def _exp_to_dict(e: Experiment) -> dict:
    return {
        "id": str(e.id),
        "name": e.name,
        "description": e.description,
        "dataset_id": str(e.dataset_id) if e.dataset_id else None,
        "variant_a": e.variant_a,
        "variant_b": e.variant_b,
        "status": e.status,
        "result_summary": e.result_summary,
        "created_at": e.created_at.isoformat(),
        "completed_at": e.completed_at.isoformat() if e.completed_at else None,
    }


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("")
async def list_experiments(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Experiment)
        .where(Experiment.project_id == uuid.UUID(project_id))
        .order_by(Experiment.created_at.desc())
    )
    return [_exp_to_dict(e) for e in result.scalars().all()]


@router.post("", status_code=201)
async def create_experiment(
    body: CreateExperimentBody,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    exp = Experiment(
        id=uuid.uuid4(),
        project_id=uuid.UUID(body.project_id),
        name=body.name,
        description=body.description,
        dataset_id=uuid.UUID(body.dataset_id) if body.dataset_id else None,
        eval_criteria=body.eval_criteria,
        variant_a=body.variant_a.model_dump(),
        variant_b=body.variant_b.model_dump(),
        status="draft",
    )
    db.add(exp)
    await db.commit()
    await db.refresh(exp)
    return _exp_to_dict(exp)


@router.get("/{experiment_id}")
async def get_experiment(
    experiment_id: str,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    exp = await db.get(Experiment, uuid.UUID(experiment_id))
    if not exp:
        raise HTTPException(404, "Experiment not found")

    runs_result = await db.execute(
        select(ExperimentRun)
        .where(ExperimentRun.experiment_id == exp.id)
        .order_by(ExperimentRun.item_index, ExperimentRun.variant)
    )
    runs = [
        {
            "id": str(r.id),
            "variant": r.variant,
            "item_index": r.item_index,
            "input_text": r.input_text,
            "response_text": r.response_text,
            "score": r.score,
            "reasoning": r.reasoning,
            "status": r.status,
        }
        for r in runs_result.scalars().all()
    ]

    data = _exp_to_dict(exp)
    data["runs"] = runs
    return data


@router.post("/{experiment_id}/run")
async def start_experiment_run(
    experiment_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    exp = await db.get(Experiment, uuid.UUID(experiment_id))
    if not exp:
        raise HTTPException(404, "Experiment not found")
    if exp.status == "running":
        raise HTTPException(409, "Experiment already running")
    if not exp.dataset_id:
        raise HTTPException(400, "Experiment needs a dataset to run")

    exp.status = "running"
    await db.commit()

    background_tasks.add_task(_run_experiment, str(exp.id), str(exp.project_id))
    return {"ok": True, "status": "running"}


@router.delete("/{experiment_id}", status_code=204)
async def delete_experiment(
    experiment_id: str,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    await db.execute(delete(Experiment).where(Experiment.id == uuid.UUID(experiment_id)))
    await db.commit()


# ── Background runner ─────────────────────────────────────────────────────────

async def _call_model(model: str, system: str, user_input: str, api_key: str) -> str:
    """Call any supported model and return the text response."""
    from app.routers.playground import MODEL_TO_PROVIDER, PROVIDER_MODELS

    provider = MODEL_TO_PROVIDER.get(model, "anthropic")

    if provider == "anthropic":
        payload = {
            "model": model, "max_tokens": 1024, "temperature": 0.0,
            "messages": [{"role": "user", "content": user_input}],
        }
        if system:
            payload["system"] = system
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": api_key, "anthropic-version": "2023-06-01"},
                json=payload,
            )
        r.raise_for_status()
        return r.json()["content"][0]["text"]

    elif provider in ("openai", "groq", "together", "mistral"):
        base_urls = {
            "openai": "https://api.openai.com/v1",
            "groq": "https://api.groq.com/openai/v1",
            "together": "https://api.together.xyz/v1",
            "mistral": "https://api.mistral.ai/v1",
        }
        msgs = []
        if system:
            msgs.append({"role": "system", "content": system})
        msgs.append({"role": "user", "content": user_input})
        async with httpx.AsyncClient(timeout=90) as client:
            r = await client.post(
                f"{base_urls[provider]}/chat/completions",
                headers={"Authorization": f"Bearer {api_key}"},
                json={"model": model, "messages": msgs, "max_tokens": 1024, "temperature": 0.0},
            )
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]

    elif provider == "gemini":
        payload = {
            "contents": [{"role": "user", "parts": [{"text": user_input}]}],
            "generationConfig": {"maxOutputTokens": 1024, "temperature": 0.0},
        }
        if system:
            payload["systemInstruction"] = {"parts": [{"text": system}]}
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                params={"key": api_key}, json=payload,
            )
        r.raise_for_status()
        return r.json()["candidates"][0]["content"]["parts"][0]["text"]

    raise ValueError(f"Unknown provider '{provider}'")


async def _score_response(criteria: str, user_input: str, response: str, api_key: str) -> tuple[float, str]:
    """Score a response 0–100 using Claude as judge. Returns (score, reasoning)."""
    judge_prompt = f"""You are an AI evaluator. Score the following response on a scale of 0 to 100.

Criteria: {criteria}

User input:
{user_input}

Response to evaluate:
{response}

Respond ONLY with valid JSON: {{"score": <number 0-100>, "reasoning": "<one sentence>"}}"""

    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": api_key, "anthropic-version": "2023-06-01"},
            json={
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 200,
                "temperature": 0.0,
                "messages": [{"role": "user", "content": judge_prompt}],
            },
        )
    r.raise_for_status()
    text = r.json()["content"][0]["text"]
    try:
        parsed = json.loads(text)
        return float(parsed["score"]), parsed.get("reasoning", "")
    except Exception:
        return 50.0, "Could not parse score"


async def _run_experiment(experiment_id: str, project_id: str):
    """Background task: run both variants against each dataset item and score."""
    async with AsyncSessionLocal() as db:
        exp = await db.get(Experiment, uuid.UUID(experiment_id))
        if not exp:
            return

        try:
            # Get dataset items
            items_result = await db.execute(
                select(DatasetItem)
                .where(DatasetItem.dataset_id == exp.dataset_id)
                .order_by(DatasetItem.created_at)
                .limit(50)   # cap at 50 items per run
            )
            items = list(items_result.scalars().all())
            if not items:
                exp.status = "failed"
                await db.commit()
                return

            # Get API keys for each variant's provider
            from app.routers.playground import MODEL_TO_PROVIDER

            async def get_key(model: str) -> str:
                provider = MODEL_TO_PROVIDER.get(model, "anthropic")
                r = await db.execute(
                    select(ProjectAIProvider).where(
                        ProjectAIProvider.project_id == uuid.UUID(project_id),
                        ProjectAIProvider.provider == provider,
                    )
                )
                row = r.scalar_one_or_none()
                if row:
                    return row.api_key_enc
                if provider == "anthropic" and settings.anthropic_api_key:
                    return settings.anthropic_api_key
                raise ValueError(f"No API key for provider '{provider}'")

            key_a = await get_key(exp.variant_a["model"])
            key_b = await get_key(exp.variant_b["model"])
            judge_key = settings.anthropic_api_key or key_a

            criteria = exp.eval_criteria or "Overall quality, helpfulness, and accuracy of the response."

            scores_a, scores_b = [], []

            for idx, item in enumerate(items):
                # Determine input text
                input_text = item.expected_output or (
                    json.dumps(item.input) if item.input else ""
                ) or (str(item.session_id) if item.session_id else f"Item {idx+1}")

                for variant, key, config in [("a", key_a, exp.variant_a), ("b", key_b, exp.variant_b)]:
                    run = ExperimentRun(
                        id=uuid.uuid4(),
                        experiment_id=exp.id,
                        variant=variant,
                        item_index=idx,
                        input_text=input_text,
                        status="running",
                    )
                    db.add(run)
                    await db.commit()

                    try:
                        response = await _call_model(
                            config["model"],
                            config.get("system_prompt", ""),
                            input_text,
                            key,
                        )
                        score, reasoning = await _score_response(criteria, input_text, response, judge_key)

                        run.response_text = response
                        run.score = score
                        run.reasoning = reasoning
                        run.status = "completed"

                        if variant == "a":
                            scores_a.append(score)
                        else:
                            scores_b.append(score)

                    except Exception as e:
                        run.status = "failed"
                        run.reasoning = str(e)

                    await db.commit()

            # Summarise
            a_avg = sum(scores_a) / len(scores_a) if scores_a else 0.0
            b_avg = sum(scores_b) / len(scores_b) if scores_b else 0.0
            a_wins = sum(1 for a, b in zip(scores_a, scores_b) if a > b)
            b_wins = sum(1 for a, b in zip(scores_a, scores_b) if b > a)
            ties   = len(scores_a) - a_wins - b_wins
            winner = "a" if a_avg > b_avg else ("b" if b_avg > a_avg else "tie")

            exp.result_summary = {
                "a_avg_score": round(a_avg, 1),
                "b_avg_score": round(b_avg, 1),
                "winner": winner,
                "total_items": len(items),
                "a_wins": a_wins,
                "b_wins": b_wins,
                "ties": ties,
            }
            exp.status = "completed"
            exp.completed_at = datetime.now(timezone.utc)
            await db.commit()

        except Exception as e:
            logger.error("experiment_run_failed", experiment_id=experiment_id, error=str(e))
            exp.status = "failed"
            await db.commit()
