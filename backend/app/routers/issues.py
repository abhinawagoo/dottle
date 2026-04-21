"""
Issues Board — aggregated behavioral signals across all sessions.
Turns per-session issues into project-level patterns.
"""
import uuid
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func, text, and_, distinct, insert
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.issue import SessionIssue
from app.models.issue_workflow import IssueWorkflow, IssueComment
from app.models.session import AgentSession
from app.schemas.metrics import IssueGroup, IssuesBoardResponse

router = APIRouter(prefix="/issues", tags=["issues"])


# Human-readable display names for issue types
ISSUE_TYPE_LABELS = {
    "session_failed":       "Session Failure",
    "loop_detected":        "Agent Loop",
    "high_latency":         "High Latency",
    "slow_span":            "Slow Operation",
    "high_cost":            "High Cost",
    "tool_failure_storm":   "Tool Failure Storm",
    "repeated_tool_error":  "Repeated Tool Error",
    "excessive_tokens":     "Excessive Token Usage",
    "no_llm_output":        "Missing LLM Output",
    "no_llm_calls":         "No LLM Calls Recorded",
}


@router.get("", response_model=IssuesBoardResponse)
async def list_issues(
    project_id: uuid.UUID,
    severity: str | None = None,
    issue_type: str | None = None,
    agent_name: str | None = None,
    from_: datetime | None = Query(None, alias="from"),
    to: datetime | None = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Return all issue types detected in this project, aggregated with
    occurrence counts, affected sessions, affected users, and agent names.
    """
    to = to or datetime.now(timezone.utc)
    from_ = from_ or (to - timedelta(days=30))

    # Base filter on issues
    issue_conditions = [
        SessionIssue.project_id == project_id,
        SessionIssue.created_at >= from_,
        SessionIssue.created_at <= to,
    ]
    if severity:
        issue_conditions.append(SessionIssue.severity == severity)
    if issue_type:
        issue_conditions.append(SessionIssue.issue_type == issue_type)

    # Subquery: session metadata we need (agent_name, user_id)
    # Join session_issues → agent_sessions to get user + agent info
    session_join_conditions = [
        AgentSession.id == SessionIssue.session_id,
    ]
    if agent_name:
        session_join_conditions.append(AgentSession.agent_name == agent_name)

    result = await db.execute(
        select(
            SessionIssue.issue_type,
            SessionIssue.severity,
            # Most-used title for this issue type (arbitrary but stable)
            func.min(SessionIssue.title).label("title"),
            func.count(SessionIssue.id).label("occurrence_count"),
            func.count(distinct(SessionIssue.session_id)).label("session_count"),
            func.count(distinct(AgentSession.user_id)).filter(
                AgentSession.user_id.isnot(None)
            ).label("user_count"),
            func.min(SessionIssue.created_at).label("first_seen"),
            func.max(SessionIssue.created_at).label("last_seen"),
            # Aggregate agent names as comma-separated (PostgreSQL array_agg)
            func.array_agg(distinct(AgentSession.agent_name)).label("agent_names"),
        )
        .join(AgentSession, and_(*session_join_conditions))
        .where(and_(*issue_conditions))
        .group_by(SessionIssue.issue_type, SessionIssue.severity)
        .order_by(func.count(SessionIssue.id).desc())
    )
    rows = result.fetchall()

    groups = []
    for row in rows:
        # Clean agent_names list (remove Nones, deduplicate)
        raw_agents = row.agent_names or []
        agent_names = sorted(set(a for a in raw_agents if a))

        groups.append(IssueGroup(
            issue_type=row.issue_type,
            severity=row.severity,
            title=ISSUE_TYPE_LABELS.get(row.issue_type, row.title),
            occurrence_count=row.occurrence_count,
            session_count=row.session_count,
            user_count=row.user_count or 0,
            agent_names=agent_names,
            first_seen=row.first_seen.isoformat(),
            last_seen=row.last_seen.isoformat(),
            source="instrumented",
        ))

    return IssuesBoardResponse(
        total_signals=len(groups),
        groups=groups,
    )


@router.get("/{issue_type}/sessions")
async def get_issue_sessions(
    issue_type: str,
    project_id: uuid.UUID,
    from_: datetime | None = Query(None, alias="from"),
    to: datetime | None = None,
    page: int = 1,
    page_size: int = 25,
    db: AsyncSession = Depends(get_db),
):
    """
    Return all sessions that have a specific issue type.
    Used to drill down from the Issues Board into affected sessions.
    """
    to = to or datetime.now(timezone.utc)
    from_ = from_ or (to - timedelta(days=30))

    # Find session IDs with this issue type
    subq = (
        select(distinct(SessionIssue.session_id))
        .where(
            SessionIssue.project_id == project_id,
            SessionIssue.issue_type == issue_type,
            SessionIssue.created_at >= from_,
            SessionIssue.created_at <= to,
        )
        .scalar_subquery()
    )

    total_result = await db.execute(
        select(func.count(AgentSession.id)).where(
            AgentSession.id.in_(subq)
        )
    )
    total = total_result.scalar() or 0

    offset = (page - 1) * page_size
    result = await db.execute(
        select(AgentSession)
        .where(AgentSession.id.in_(subq))
        .order_by(AgentSession.started_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    sessions = result.scalars().all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "issue_type": issue_type,
        "items": [
            {
                "id": str(s.id),
                "agent_name": s.agent_name,
                "status": s.status,
                "started_at": s.started_at.isoformat(),
                "duration_ms": s.duration_ms,
                "total_cost_usd": float(s.total_cost_usd) if s.total_cost_usd else None,
                "user_email": s.user_email,
                "user_id": s.user_id,
                "tags": s.tags or [],
                "agent_version": s.agent_version,
            }
            for s in sessions
        ],
    }


# ── Issue Workflow ────────────────────────────────────────────────────────────

class WorkflowUpdate(BaseModel):
    status: str | None = None    # open | in_review | resolved
    assignee: str | None = None  # email or name; pass "" to clear

class CommentCreate(BaseModel):
    author: str
    body: str


@router.get("/{issue_type}/workflow")
async def get_workflow(
    issue_type: str,
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get current workflow state + comment thread for an issue type."""
    wf_result = await db.execute(
        select(IssueWorkflow).where(
            IssueWorkflow.project_id == project_id,
            IssueWorkflow.issue_type == issue_type,
        )
    )
    wf = wf_result.scalar_one_or_none()

    comments_result = await db.execute(
        select(IssueComment)
        .where(
            IssueComment.project_id == project_id,
            IssueComment.issue_type == issue_type,
        )
        .order_by(IssueComment.created_at.asc())
    )
    comments = comments_result.scalars().all()

    return {
        "status": wf.status if wf else "open",
        "assignee": wf.assignee if wf else None,
        "updated_at": wf.updated_at.isoformat() if wf else None,
        "comments": [
            {
                "id": str(c.id),
                "author": c.author,
                "body": c.body,
                "created_at": c.created_at.isoformat(),
            }
            for c in comments
        ],
    }


@router.patch("/{issue_type}/workflow")
async def update_workflow(
    issue_type: str,
    project_id: uuid.UUID,
    body: WorkflowUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Upsert the workflow status/assignee for an issue type."""
    wf_result = await db.execute(
        select(IssueWorkflow).where(
            IssueWorkflow.project_id == project_id,
            IssueWorkflow.issue_type == issue_type,
        )
    )
    wf = wf_result.scalar_one_or_none()

    if wf is None:
        wf = IssueWorkflow(
            project_id=project_id,
            issue_type=issue_type,
            status=body.status or "open",
            assignee=body.assignee or None,
        )
        db.add(wf)
    else:
        if body.status is not None:
            wf.status = body.status
        if body.assignee is not None:
            wf.assignee = body.assignee or None
        wf.updated_at = datetime.now(timezone.utc)

    await db.flush()
    return {"status": wf.status, "assignee": wf.assignee}


@router.post("/{issue_type}/workflow/comments")
async def add_comment(
    issue_type: str,
    project_id: uuid.UUID,
    body: CommentCreate,
    db: AsyncSession = Depends(get_db),
):
    """Add a comment to an issue type's thread."""
    if not body.body.strip():
        raise HTTPException(status_code=422, detail="Comment body cannot be empty")

    comment = IssueComment(
        project_id=project_id,
        issue_type=issue_type,
        author=body.author.strip() or "Anonymous",
        body=body.body.strip(),
    )
    db.add(comment)
    await db.flush()
    return {
        "id": str(comment.id),
        "author": comment.author,
        "body": comment.body,
        "created_at": comment.created_at.isoformat(),
    }
