"""
Ingest router — SDK writes here.
All endpoints require X-API-Key header mapped to a project.
"""
import hashlib
import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.project import Project
from app.models.session import AgentSession
from app.models.span import Span
from app.models.tool_call import ToolCall
from app.schemas.ingest import SessionStartRequest, SessionEndRequest, SpanIngestRequest
from app.services.cost import compute_cost
from app.services.loop_detector import analyze_spans
from app.services.issue_detector import detect_all, SessionSnapshot
from app.models.issue import SessionIssue

router = APIRouter(prefix="/ingest", tags=["ingest"])


async def get_project_from_api_key(
    x_api_key: str = Header(...),
    db: AsyncSession = Depends(get_db),
) -> Project:
    result = await db.execute(select(Project).where(Project.api_key == x_api_key))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return project


@router.post("/session/start", status_code=status.HTTP_201_CREATED)
async def start_session(
    body: SessionStartRequest,
    project: Project = Depends(get_project_from_api_key),
    db: AsyncSession = Depends(get_db),
):
    session_id = body.session_id or uuid.uuid4()
    session = AgentSession(
        id=session_id,
        project_id=project.id,
        agent_name=body.agent_name,
        external_id=body.external_id,
        status="running",
        started_at=body.started_at,
        metadata_=body.metadata,
        user_id=body.user_id,
        user_email=body.user_email,
        tags=body.tags or [],
        agent_version=body.agent_version,
    )
    db.add(session)
    await db.flush()
    return {"session_id": str(session.id)}


@router.post("/session/end")
async def end_session(
    body: SessionEndRequest,
    project: Project = Depends(get_project_from_api_key),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AgentSession).where(
            AgentSession.id == body.session_id,
            AgentSession.project_id == project.id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    duration_ms = None
    if body.ended_at and session.started_at:
        duration_ms = int((body.ended_at - session.started_at).total_seconds() * 1000)

    session.status = body.status
    session.ended_at = body.ended_at
    session.duration_ms = duration_ms
    session.error_message = body.error_message
    session.error_type = body.error_type
    session.iteration_count = body.iteration_count
    session.loop_detected = body.loop_detected
    session.loop_reason = body.loop_reason

    await db.flush()

    # Load spans for issue detection (eager, within same transaction)
    from sqlalchemy.orm import selectinload
    await db.refresh(session, ["spans"])
    span_dicts = [
        {
            "id": str(sp.id),
            "span_type": sp.span_type,
            "name": sp.name,
            "status": sp.status,
            "duration_ms": sp.duration_ms,
            "input_tokens": sp.input_tokens,
            "output_tokens": sp.output_tokens,
            "input_text": sp.input_text,
            "output_text": sp.output_text,
            "error_message": sp.error_message,
            "error_type": sp.error_type,
        }
        for sp in session.spans
    ]

    snapshot = SessionSnapshot(
        session_id=session.id,
        project_id=session.project_id,
        status=session.status,
        duration_ms=session.duration_ms,
        total_cost_usd=float(session.total_cost_usd) if session.total_cost_usd else None,
        total_tokens=session.total_tokens,
        iteration_count=session.iteration_count,
        loop_detected=session.loop_detected,
        loop_reason=session.loop_reason,
        error_message=session.error_message,
        error_type=session.error_type,
        spans=span_dicts,
    )

    issues = detect_all(snapshot)
    for issue in issues:
        db.add(SessionIssue(
            session_id=session.id,
            project_id=session.project_id,
            issue_type=issue.issue_type,
            severity=issue.severity,
            title=issue.title,
            description=issue.description,
            span_id=issue.span_id,
        ))

    await db.flush()
    return {"ok": True, "issues_detected": len(issues)}


@router.post("/spans", status_code=status.HTTP_202_ACCEPTED)
async def ingest_spans(
    body: SpanIngestRequest,
    project: Project = Depends(get_project_from_api_key),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AgentSession).where(
            AgentSession.id == body.session_id,
            AgentSession.project_id == project.id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    total_cost = 0.0
    total_input_tokens = 0
    total_output_tokens = 0
    llm_span_count = 0
    new_spans: list[Span] = []
    new_tool_calls: list[ToolCall] = []

    for sp in body.spans:
        # Compute cost for LLM spans
        cost_usd = None
        if sp.span_type == "llm" and sp.model and sp.input_tokens and sp.output_tokens:
            cost_usd = compute_cost(sp.model, sp.input_tokens, sp.output_tokens)
            total_cost += cost_usd
            total_input_tokens += sp.input_tokens or 0
            total_output_tokens += sp.output_tokens or 0
            llm_span_count += 1

        # Compute duration if not provided
        duration_ms = sp.duration_ms
        if duration_ms is None and sp.ended_at:
            duration_ms = int((sp.ended_at - sp.started_at).total_seconds() * 1000)

        span = Span(
            id=sp.span_id,
            session_id=body.session_id,
            project_id=project.id,
            parent_span_id=sp.parent_span_id,
            span_type=sp.span_type,
            name=sp.name,
            status=sp.status,
            started_at=sp.started_at,
            ended_at=sp.ended_at,
            duration_ms=duration_ms,
            model=sp.model,
            input_tokens=sp.input_tokens,
            output_tokens=sp.output_tokens,
            cost_usd=cost_usd,
            input_text=sp.input_text,
            output_text=sp.output_text,
            error_message=sp.error_message,
            error_type=sp.error_type,
            attributes=sp.attributes,
        )
        new_spans.append(span)

        # Denormalize tool calls
        if sp.span_type == "tool":
            input_hash = sp.attributes.get("input_hash")
            if not input_hash and sp.attributes:
                try:
                    raw = json.dumps(sp.attributes, sort_keys=True)
                    input_hash = hashlib.md5(raw.encode()).hexdigest()[:16]
                except Exception:
                    pass

            tool_call = ToolCall(
                id=uuid.uuid4(),
                span_id=sp.span_id,
                session_id=body.session_id,
                project_id=project.id,
                tool_name=sp.name,
                status=sp.status,
                duration_ms=duration_ms,
                error_type=sp.error_type,
                error_message=sp.error_message,
                input_hash=input_hash,
                called_at=sp.started_at,
            )
            new_tool_calls.append(tool_call)

    db.add_all(new_spans)
    db.add_all(new_tool_calls)

    # Update session aggregates
    if total_cost > 0 or llm_span_count > 0:
        session.total_cost_usd = (float(session.total_cost_usd or 0)) + total_cost
        session.input_tokens = (session.input_tokens or 0) + total_input_tokens
        session.output_tokens = (session.output_tokens or 0) + total_output_tokens
        session.total_tokens = (session.total_tokens or 0) + total_input_tokens + total_output_tokens
        session.iteration_count = (session.iteration_count or 0) + llm_span_count

    # Server-side loop detection
    loop_result = analyze_spans(body.spans, session.iteration_count - llm_span_count)
    if loop_result.detected and not session.loop_detected:
        session.loop_detected = True
        session.loop_reason = loop_result.reason
        session.status = "looping"

    await db.flush()
    return {"accepted": len(body.spans)}
