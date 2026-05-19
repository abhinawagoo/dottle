"""
Datasets router
===============
Test datasets: create, add sessions as items, run evals.

POST /datasets                      — create dataset
GET  /datasets                      — list datasets for project
GET  /datasets/{id}                 — dataset + items + runs
POST /datasets/{id}/items           — add item (from session or manual)
DELETE /datasets/{id}/items/{item_id}
POST /datasets/{id}/runs            — trigger a dataset run (evaluate all items)
GET  /datasets/{id}/runs            — list runs
DELETE /datasets/{id}               — delete dataset
"""
import csv
import io
import json
import uuid
import httpx
import structlog
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, AsyncSessionLocal
from app.models.dataset import Dataset, DatasetItem, DatasetRun
from app.models.session import AgentSession
from app.models.span import Span
from app.models.project import Project
from app.routers.auth import get_current_user
from app.models.user import User
from app.config import get_settings

router = APIRouter(prefix="/datasets", tags=["datasets"])
logger = structlog.get_logger()
settings = get_settings()


# ── Schemas ───────────────────────────────────────────────────────────────────

class DatasetCreate(BaseModel):
    project_id: str
    name: str
    description: Optional[str] = None


class DatasetItemAdd(BaseModel):
    session_id: Optional[str] = None
    input: dict = {}
    expected_output: Optional[str] = None
    metadata: dict = {}


class DatasetRunCreate(BaseModel):
    name: str
    description: Optional[str] = None
    model: Optional[str] = None
    prompt_id: Optional[str] = None
    eval_criteria: Optional[str] = None   # custom criteria for this run


# ── Serializers ───────────────────────────────────────────────────────────────

def _dataset_out(d: Dataset, item_count: int = 0, run_count: int = 0) -> dict:
    return {
        "id": str(d.id),
        "project_id": str(d.project_id),
        "name": d.name,
        "description": d.description,
        "item_count": item_count,
        "run_count": run_count,
        "created_at": d.created_at.isoformat(),
        "updated_at": d.updated_at.isoformat(),
    }


def _item_out(i: DatasetItem) -> dict:
    return {
        "id": str(i.id),
        "dataset_id": str(i.dataset_id),
        "session_id": str(i.session_id) if i.session_id else None,
        "input": i.input,
        "expected_output": i.expected_output,
        "metadata": i.metadata_,
        "created_at": i.created_at.isoformat(),
    }


def _run_out(r: DatasetRun) -> dict:
    return {
        "id": str(r.id),
        "dataset_id": str(r.dataset_id),
        "name": r.name,
        "description": r.description,
        "model": r.model,
        "status": r.status,
        "results": r.results,
        "avg_score": r.avg_score,
        "created_at": r.created_at.isoformat(),
        "completed_at": r.completed_at.isoformat() if r.completed_at else None,
    }


# ── Dataset run worker ────────────────────────────────────────────────────────

async def _execute_dataset_run(run_id: str, eval_criteria: Optional[str]) -> None:
    """Score every item in the dataset using LLM-as-judge."""
    from app.services.cache import get_ai_provider_key

    async with AsyncSessionLocal() as db:
        run_r = await db.execute(select(DatasetRun).where(DatasetRun.id == uuid.UUID(run_id)))
        run = run_r.scalar_one_or_none()
        if not run:
            return

        run.status = "running"
        await db.commit()

        # Resolve org API key — prefer org's configured Anthropic key, fall back to env
        proj_r = await db.execute(select(Project).where(Project.id == run.project_id))
        proj = proj_r.scalar_one_or_none()
        org_id = str(proj.org_id) if proj else None

        api_key = None
        if org_id:
            api_key = await get_ai_provider_key(org_id, "anthropic")
        if not api_key:
            api_key = settings.anthropic_api_key
        if not api_key:
            run.status = "failed"
            await db.commit()
            logger.error("dataset_run_no_api_key", run_id=run_id)
            return

        items_r = await db.execute(
            select(DatasetItem).where(DatasetItem.dataset_id == run.dataset_id)
        )
        items = items_r.scalars().all()

        eval_model = run.model or "claude-haiku-4-5-20251001"
        criteria = eval_criteria or "Evaluate the quality, accuracy and helpfulness of the agent's response. Rate 0-1."
        results = []
        scores = []

        for item in items:
            # Get session context if linked
            context = ""
            if item.session_id:
                spans_r = await db.execute(
                    select(Span).where(Span.session_id == item.session_id).limit(10)
                )
                spans = spans_r.scalars().all()
                context = "\n".join(
                    f"[{s.span_type}] {s.name}: {str(s.output_data or '')[:200]}"
                    for s in spans
                )

            input_str = json.dumps(item.input) if item.input else "(no input)"
            system = f"""You are an evaluator. {criteria}
Return JSON only: {{"score": <0-1>, "reasoning": "<one sentence>"}}"""

            user_msg = f"""Input: {input_str}
Expected output: {item.expected_output or "(none)"}
Actual context/output: {context or input_str}"""

            try:
                async with httpx.AsyncClient(timeout=30) as client:
                    resp = await client.post(
                        "https://api.anthropic.com/v1/messages",
                        headers={
                            "x-api-key": api_key,
                            "anthropic-version": "2023-06-01",
                            "content-type": "application/json",
                        },
                        json={
                            "model": eval_model,
                            "max_tokens": 200,
                            "system": system,
                            "messages": [{"role": "user", "content": user_msg}],
                        },
                    )
                resp.raise_for_status()

                text = resp.json()["content"][0]["text"].strip()
                if text.startswith("```"):
                    text = text.split("```")[1]
                    if text.startswith("json"):
                        text = text[4:]
                parsed = json.loads(text)
                score = float(parsed["score"])
                scores.append(score)
                results.append({
                    "item_id": str(item.id),
                    "session_id": str(item.session_id) if item.session_id else None,
                    "score": score,
                    "reasoning": parsed.get("reasoning", ""),
                    "status": "completed",
                })
            except Exception as e:
                logger.warning("dataset_item_score_failed", run_id=run_id, item_id=str(item.id), error=str(e))
                results.append({
                    "item_id": str(item.id),
                    "session_id": str(item.session_id) if item.session_id else None,
                    "score": None,
                    "reasoning": None,
                    "status": "failed",
                    "error": str(e),
                })

        run.status = "completed"
        run.results = results
        run.avg_score = sum(scores) / len(scores) if scores else None
        run.completed_at = datetime.now(timezone.utc)
        await db.commit()


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("", status_code=201)
async def create_dataset(
    body: DatasetCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    dataset = Dataset(
        project_id=uuid.UUID(body.project_id),
        name=body.name,
        description=body.description,
    )
    db.add(dataset)
    await db.commit()
    await db.refresh(dataset)
    return _dataset_out(dataset)


@router.get("")
async def list_datasets(
    project_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Dataset)
        .where(Dataset.project_id == uuid.UUID(project_id))
        .order_by(Dataset.created_at.desc())
    )
    datasets = result.scalars().all()

    # Batch item/run counts
    ids = [d.id for d in datasets]
    item_counts: dict = {}
    run_counts: dict = {}
    if ids:
        ic = await db.execute(
            select(DatasetItem.dataset_id, func.count(DatasetItem.id).label("cnt"))
            .where(DatasetItem.dataset_id.in_(ids))
            .group_by(DatasetItem.dataset_id)
        )
        item_counts = {row.dataset_id: row.cnt for row in ic}
        rc = await db.execute(
            select(DatasetRun.dataset_id, func.count(DatasetRun.id).label("cnt"))
            .where(DatasetRun.dataset_id.in_(ids))
            .group_by(DatasetRun.dataset_id)
        )
        run_counts = {row.dataset_id: row.cnt for row in rc}

    return [_dataset_out(d, item_counts.get(d.id, 0), run_counts.get(d.id, 0)) for d in datasets]


@router.get("/{dataset_id}")
async def get_dataset(
    dataset_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    d_r = await db.execute(select(Dataset).where(Dataset.id == uuid.UUID(dataset_id)))
    dataset = d_r.scalar_one_or_none()
    if not dataset:
        raise HTTPException(404, "Dataset not found")

    items_r = await db.execute(
        select(DatasetItem).where(DatasetItem.dataset_id == dataset.id).order_by(DatasetItem.created_at.desc())
    )
    runs_r = await db.execute(
        select(DatasetRun).where(DatasetRun.dataset_id == dataset.id).order_by(DatasetRun.created_at.desc())
    )
    return {
        **_dataset_out(dataset),
        "items": [_item_out(i) for i in items_r.scalars()],
        "runs": [_run_out(r) for r in runs_r.scalars()],
    }


@router.post("/{dataset_id}/items", status_code=201)
async def add_item(
    dataset_id: str,
    body: DatasetItemAdd,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    # If session_id provided, auto-populate input from session metadata
    input_data = body.input
    if body.session_id and not input_data:
        session_r = await db.execute(
            select(AgentSession).where(AgentSession.id == uuid.UUID(body.session_id))
        )
        session = session_r.scalar_one_or_none()
        if session:
            input_data = {"agent_name": session.agent_name, "metadata": session.metadata or {}}

    item = DatasetItem(
        dataset_id=uuid.UUID(dataset_id),
        session_id=uuid.UUID(body.session_id) if body.session_id else None,
        input=input_data,
        expected_output=body.expected_output,
        metadata_=body.metadata,
    )
    db.add(item)

    # Update dataset.updated_at
    d_r = await db.execute(select(Dataset).where(Dataset.id == uuid.UUID(dataset_id)))
    d = d_r.scalar_one_or_none()
    if d:
        d.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(item)
    return _item_out(item)


@router.delete("/{dataset_id}/items/{item_id}", status_code=204)
async def delete_item(
    dataset_id: str,
    item_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    r = await db.execute(select(DatasetItem).where(DatasetItem.id == uuid.UUID(item_id)))
    item = r.scalar_one_or_none()
    if not item:
        raise HTTPException(404, "Item not found")
    await db.delete(item)
    await db.commit()


@router.post("/{dataset_id}/runs", status_code=202)
async def create_run(
    dataset_id: str,
    body: DatasetRunCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.arq_pool import enqueue

    d_r = await db.execute(select(Dataset).where(Dataset.id == uuid.UUID(dataset_id)))
    dataset = d_r.scalar_one_or_none()
    if not dataset:
        raise HTTPException(404, "Dataset not found")

    run = DatasetRun(
        dataset_id=dataset.id,
        project_id=dataset.project_id,
        name=body.name,
        description=body.description,
        model=body.model,
        prompt_id=uuid.UUID(body.prompt_id) if body.prompt_id else None,
        status="pending",
        results=[],
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)

    await enqueue("task_execute_dataset_run", run_id=str(run.id), eval_criteria=body.eval_criteria)
    return _run_out(run)


@router.get("/{dataset_id}/runs")
async def list_runs(
    dataset_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(DatasetRun)
        .where(DatasetRun.dataset_id == uuid.UUID(dataset_id))
        .order_by(DatasetRun.created_at.desc())
    )
    return [_run_out(r) for r in result.scalars()]


@router.post("/{dataset_id}/items/import")
async def import_items(
    dataset_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Bulk-import items from a CSV or JSON file.

    CSV: must have an `input` column; `expected_output` is optional.
         Any other columns are stored in metadata.

    JSON: an array of objects with `input` (string or object) and
          optionally `expected_output` (string).
    """
    # ── Read file content ──────────────────────────────────────────────────────
    content = await file.read()
    filename = (file.filename or "").lower()
    is_csv = filename.endswith(".csv") or (file.content_type or "").startswith("text/csv")
    is_json = filename.endswith(".json") or "json" in (file.content_type or "")

    if not is_csv and not is_json:
        # Sniff: if content starts with '[' or '{', treat as JSON
        stripped = content.lstrip()
        if stripped and stripped[0:1] in (b"[", b"{"):
            is_json = True
        else:
            is_csv = True

    # ── Parse rows ─────────────────────────────────────────────────────────────
    rows: list[dict] = []
    parse_errors: list[str] = []

    if is_json:
        try:
            parsed = json.loads(content.decode("utf-8-sig"))
            if isinstance(parsed, dict):
                parsed = [parsed]
            if not isinstance(parsed, list):
                raise ValueError("JSON must be an array of objects")
            rows = parsed
        except Exception as exc:
            raise HTTPException(400, f"Invalid JSON: {exc}")
    else:
        try:
            text = content.decode("utf-8-sig")
            reader = csv.DictReader(io.StringIO(text))
            if "input" not in (reader.fieldnames or []):
                raise HTTPException(400, "CSV must have an 'input' column")
            rows = [dict(row) for row in reader]
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(400, f"Invalid CSV: {exc}")

    # ── Insert items ───────────────────────────────────────────────────────────
    did = uuid.UUID(dataset_id)
    d_r = await db.execute(select(Dataset).where(Dataset.id == did))
    dataset = d_r.scalar_one_or_none()
    if not dataset:
        raise HTTPException(404, "Dataset not found")

    imported = 0
    failed = 0

    for idx, row in enumerate(rows):
        try:
            raw_input = row.get("input", row)
            # If input is a string, try to parse as JSON; otherwise wrap it
            if isinstance(raw_input, str):
                try:
                    input_data = json.loads(raw_input)
                except json.JSONDecodeError:
                    input_data = {"text": raw_input}
            elif isinstance(raw_input, dict):
                input_data = raw_input
            else:
                input_data = {"value": raw_input}

            expected = row.get("expected_output") or None
            if expected and not isinstance(expected, str):
                expected = json.dumps(expected)

            # Everything except input/expected_output goes into metadata
            meta = {k: v for k, v in row.items() if k not in ("input", "expected_output") and v}

            item = DatasetItem(
                dataset_id=did,
                input=input_data,
                expected_output=str(expected) if expected else None,
                metadata_=meta,
            )
            db.add(item)
            imported += 1
        except Exception as exc:
            parse_errors.append(f"Row {idx + 1}: {exc}")
            failed += 1

    dataset.updated_at = datetime.now(timezone.utc)
    await db.commit()

    return {"imported": imported, "failed": failed, "errors": parse_errors[:20]}


@router.delete("/{dataset_id}", status_code=204)
async def delete_dataset(
    dataset_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    r = await db.execute(select(Dataset).where(Dataset.id == uuid.UUID(dataset_id)))
    dataset = r.scalar_one_or_none()
    if not dataset:
        raise HTTPException(404, "Dataset not found")
    await db.delete(dataset)
    await db.commit()
