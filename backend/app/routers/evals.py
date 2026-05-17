"""
Evals router
============
LLM-as-judge evaluation configs + triggering + results.

POST /evals/configs              — create eval config
GET  /evals/configs              — list configs for project
PUT  /evals/configs/{id}         — update config
DELETE /evals/configs/{id}       — delete config
POST /evals/configs/{id}/run/{session_id} — manually run eval on one session
GET  /evals/results              — list results (filterable by session / config)
"""
import uuid
import random
import httpx
import structlog
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, AsyncSessionLocal
from app.models.eval_config import EvalConfig, EvalResult
from app.models.session import AgentSession
from app.models.span import Span
from app.models.score import Score
from app.routers.auth import get_current_user
from app.models.user import User
from app.config import get_settings

router = APIRouter(prefix="/evals", tags=["evals"])
logger = structlog.get_logger()
settings = get_settings()


# ── Schemas ───────────────────────────────────────────────────────────────────

class EvalConfigCreate(BaseModel):
    project_id: str
    name: str
    description: Optional[str] = None
    evaluator_model: str = "claude-sonnet-4-6"
    criteria: str
    score_name: str
    score_range_min: float = 0.0
    score_range_max: float = 1.0
    run_on: str = "all"
    sample_rate: float = 1.0
    active: bool = True


class EvalConfigUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    criteria: Optional[str] = None
    evaluator_model: Optional[str] = None
    score_name: Optional[str] = None
    run_on: Optional[str] = None
    sample_rate: Optional[float] = None
    active: Optional[bool] = None


def _config_out(c: EvalConfig) -> dict:
    return {
        "id": str(c.id),
        "project_id": str(c.project_id),
        "name": c.name,
        "description": c.description,
        "evaluator_model": c.evaluator_model,
        "criteria": c.criteria,
        "score_name": c.score_name,
        "score_range_min": c.score_range_min,
        "score_range_max": c.score_range_max,
        "run_on": c.run_on,
        "sample_rate": c.sample_rate,
        "active": c.active,
        "created_at": c.created_at.isoformat(),
    }


def _result_out(r: EvalResult) -> dict:
    return {
        "id": str(r.id),
        "eval_config_id": str(r.eval_config_id),
        "session_id": str(r.session_id),
        "score_value": r.score_value,
        "reasoning": r.reasoning,
        "status": r.status,
        "error": r.error,
        "created_at": r.created_at.isoformat(),
    }


# ── LLM-as-judge core ─────────────────────────────────────────────────────────

async def _run_eval_for_session(config_id: str, session_id: str) -> None:
    """Run an eval config against a session — called in background."""
    async with AsyncSessionLocal() as db:
        config_r = await db.execute(select(EvalConfig).where(EvalConfig.id == uuid.UUID(config_id)))
        config = config_r.scalar_one_or_none()
        if not config or not config.active:
            return

        session_r = await db.execute(select(AgentSession).where(AgentSession.id == uuid.UUID(session_id)))
        session = session_r.scalar_one_or_none()
        if not session:
            return

        # Create pending result
        result_row = EvalResult(
            eval_config_id=config.id,
            session_id=session.id,
            project_id=config.project_id,
            status="pending",
        )
        db.add(result_row)
        await db.commit()
        await db.refresh(result_row)

        # Build context from session spans
        spans_r = await db.execute(
            select(Span)
            .where(Span.session_id == session.id)
            .order_by(Span.started_at)
            .limit(30)
        )
        spans = spans_r.scalars().all()

        span_summary = "\n".join(
            f"- [{s.span_type}] {s.name}: input={str(s.input_data or '')[:300]} output={str(s.output_data or '')[:300]}"
            for s in spans
        ) or "(no spans recorded)"

        system = f"""You are an impartial evaluator. Score the following AI agent session based on this criteria:

{config.criteria}

Score must be a number between {config.score_range_min} and {config.score_range_max}.
Return JSON only: {{"score": <number>, "reasoning": "<1-2 sentences>"}}"""

        user_msg = f"""Agent: {session.agent_name}
Status: {session.status}
Duration: {session.duration_ms or "?"}ms
Tokens: {session.total_tokens or "?"}
Cost: ${float(session.total_cost_usd or 0):.4f}

Spans:
{span_summary}"""

        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": settings.anthropic_api_key,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json",
                    },
                    json={
                        "model": config.evaluator_model,
                        "max_tokens": 256,
                        "system": system,
                        "messages": [{"role": "user", "content": user_msg}],
                    },
                )

            if resp.status_code != 200:
                raise RuntimeError(f"LLM returned {resp.status_code}")

            import json
            text = resp.json()["content"][0]["text"].strip()
            # Strip markdown code fences if present
            if text.startswith("```"):
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
            parsed = json.loads(text)
            score_val = float(parsed["score"])
            reasoning = parsed.get("reasoning", "")

            # Clamp to range
            score_val = max(config.score_range_min, min(config.score_range_max, score_val))

            result_row.score_value = score_val
            result_row.reasoning = reasoning
            result_row.status = "completed"

            # Also write a Score row so it shows up in session scores
            score = Score(
                project_id=config.project_id,
                session_id=session.id,
                name=config.score_name,
                value=score_val,
                comment=reasoning,
                source="model",
                model_name=config.evaluator_model,
            )
            db.add(score)

        except Exception as e:
            result_row.status = "failed"
            result_row.error = str(e)
            logger.error("Eval run failed", config_id=config_id, session_id=session_id, error=str(e))

        await db.commit()


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/configs", status_code=201)
async def create_eval_config(
    body: EvalConfigCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    from app.services.cache import cache_delete
    config = EvalConfig(
        project_id=uuid.UUID(body.project_id),
        name=body.name,
        description=body.description,
        evaluator_model=body.evaluator_model,
        criteria=body.criteria,
        score_name=body.score_name,
        score_range_min=body.score_range_min,
        score_range_max=body.score_range_max,
        run_on=body.run_on,
        sample_rate=body.sample_rate,
        active=body.active,
    )
    db.add(config)
    await db.commit()
    await db.refresh(config)
    await cache_delete(f"eval_configs:{body.project_id}")
    return _config_out(config)


@router.get("/configs")
async def list_eval_configs(
    project_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(EvalConfig)
        .where(EvalConfig.project_id == uuid.UUID(project_id))
        .order_by(EvalConfig.created_at.desc())
    )
    return [_config_out(c) for c in result.scalars()]


@router.put("/configs/{config_id}")
async def update_eval_config(
    config_id: str,
    body: EvalConfigUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    from app.services.cache import cache_delete
    result = await db.execute(select(EvalConfig).where(EvalConfig.id == uuid.UUID(config_id)))
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(404, "Eval config not found")
    for field, val in body.model_dump(exclude_none=True).items():
        setattr(config, field, val)
    config.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await cache_delete(f"eval_configs:{config.project_id}")
    return _config_out(config)


@router.delete("/configs/{config_id}", status_code=204)
async def delete_eval_config(
    config_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    from app.services.cache import cache_delete
    result = await db.execute(select(EvalConfig).where(EvalConfig.id == uuid.UUID(config_id)))
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(404, "Eval config not found")
    project_id = str(config.project_id)
    await db.delete(config)
    await db.commit()
    await cache_delete(f"eval_configs:{project_id}")


@router.post("/configs/{config_id}/run/{session_id}", status_code=202)
async def run_eval_on_session(
    config_id: str,
    session_id: str,
    background_tasks: BackgroundTasks,
    _: User = Depends(get_current_user),
):
    """Manually trigger an eval on a specific session."""
    background_tasks.add_task(_run_eval_for_session, config_id, session_id)
    return {"queued": True}


@router.get("/results")
async def list_eval_results(
    project_id: str = Query(...),
    session_id: Optional[str] = Query(None),
    config_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = select(EvalResult).where(EvalResult.project_id == uuid.UUID(project_id))
    if session_id:
        q = q.where(EvalResult.session_id == uuid.UUID(session_id))
    if config_id:
        q = q.where(EvalResult.eval_config_id == uuid.UUID(config_id))
    q = q.order_by(EvalResult.created_at.desc()).limit(500)
    result = await db.execute(q)
    return [_result_out(r) for r in result.scalars()]


# ── Hook: run active evals when a session completes ───────────────────────────

async def _run_evals_for_session(session_id: str, project_id: str) -> None:
    """
    Fire-and-forget coroutine — runs all active eval configs for a project
    against the given session. Each eval runs in its own isolated async context.
    Called from ingest.py via asyncio.ensure_future.
    """
    from app.services.cache import cache_get, cache_set
    import json as _json

    cache_key = f"eval_configs:{project_id}"
    cached = await cache_get(cache_key)

    if cached is not None:
        configs_data = cached
    else:
        async with AsyncSessionLocal() as db:
            configs_r = await db.execute(
                select(EvalConfig).where(
                    EvalConfig.project_id == uuid.UUID(project_id),
                    EvalConfig.active == True,
                )
            )
            raw = configs_r.scalars().all()
            configs_data = [
                {"id": str(c.id), "run_on": c.run_on, "sample_rate": c.sample_rate}
                for c in raw
            ]
        await cache_set(cache_key, configs_data, ttl=60)

    for cfg in configs_data:
        if cfg["run_on"] == "sample" and random.random() > cfg["sample_rate"]:
            continue
        try:
            await _run_eval_for_session(cfg["id"], session_id)
        except Exception as exc:
            logger.warning("eval_trigger_failed config=%s session=%s err=%s",
                           cfg["id"], session_id, exc)


async def trigger_evals_for_session(session_id: str, project_id: str, background_tasks: BackgroundTasks):
    """
    BackgroundTasks-based trigger (used by manual API routes).
    For automatic triggering from ingest, use _run_evals_for_session directly.
    """
    async with AsyncSessionLocal() as db:
        configs_r = await db.execute(
            select(EvalConfig).where(
                EvalConfig.project_id == uuid.UUID(project_id),
                EvalConfig.active == True,
            )
        )
        configs = configs_r.scalars().all()

    for config in configs:
        if config.run_on == "sample" and random.random() > config.sample_rate:
            continue
        background_tasks.add_task(_run_eval_for_session, str(config.id), session_id)
