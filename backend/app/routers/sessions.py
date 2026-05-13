import asyncio
import csv
import io
import json
import textwrap
import uuid
from datetime import datetime

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.session import AgentSession
from app.models.span import Span
from app.models.issue import SessionIssue
from app.models.score import Score
from app.schemas.session import SessionResponse, SessionDetailResponse, SessionListResponse, SpanResponse, IssueResponse

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get("", response_model=SessionListResponse)
async def list_sessions(
    project_id: uuid.UUID,
    status: str | None = None,
    agent_name: str | None = None,
    search: str | None = None,
    loop_detected: bool | None = None,
    user_id: str | None = None,
    user_email: str | None = None,
    agent_version: str | None = None,
    tag: str | None = None,
    from_: datetime | None = Query(None, alias="from"),
    to: datetime | None = None,
    page: int = 1,
    page_size: int = 50,
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import cast
    from sqlalchemy.dialects.postgresql import ARRAY, TEXT

    conditions = [AgentSession.project_id == project_id]
    if status:
        conditions.append(AgentSession.status == status)
    if agent_name:
        conditions.append(AgentSession.agent_name == agent_name)
    if search:
        conditions.append(AgentSession.agent_name.ilike(f"%{search}%"))
    if loop_detected is not None:
        conditions.append(AgentSession.loop_detected == loop_detected)
    if user_id:
        conditions.append(AgentSession.user_id == user_id)
    if user_email:
        conditions.append(AgentSession.user_email.ilike(f"%{user_email}%"))
    if agent_version:
        conditions.append(AgentSession.agent_version == agent_version)
    if tag:
        conditions.append(AgentSession.tags.contains(cast([tag], ARRAY(TEXT))))
    if from_:
        conditions.append(AgentSession.started_at >= from_)
    if to:
        conditions.append(AgentSession.started_at <= to)

    count_result = await db.execute(
        select(func.count(AgentSession.id)).where(and_(*conditions))
    )
    total = count_result.scalar() or 0

    offset = (page - 1) * page_size
    result = await db.execute(
        select(AgentSession)
        .where(and_(*conditions))
        .order_by(AgentSession.started_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    sessions = result.scalars().all()

    # Fetch issue counts + quality scores for all sessions in one pass each
    session_ids = [s.id for s in sessions]
    issue_counts: dict[uuid.UUID, int] = {}
    quality_scores: dict[uuid.UUID, float] = {}

    if session_ids:
        ic_result = await db.execute(
            select(SessionIssue.session_id, func.count(SessionIssue.id).label("cnt"))
            .where(SessionIssue.session_id.in_(session_ids))
            .group_by(SessionIssue.session_id)
        )
        issue_counts = {row.session_id: row.cnt for row in ic_result}

        # Latest auto_quality score per session
        sq_result = await db.execute(
            select(Score.session_id, Score.value)
            .where(
                Score.session_id.in_(session_ids),
                Score.name == "auto_quality",
            )
            .order_by(Score.session_id, Score.created_at.desc())
            .distinct(Score.session_id)
        )
        quality_scores = {row.session_id: row.value for row in sq_result}

    return SessionListResponse(
        total=total,
        page=page,
        page_size=page_size,
        items=[
            _to_session_response(s, issue_counts.get(s.id, 0), quality_scores.get(s.id))
            for s in sessions
        ],
    )


@router.get("/export")
async def export_sessions(
    project_id: uuid.UUID,
    format: str = Query("csv", pattern="^(csv|json)$"),
    status: str | None = None,
    agent_name: str | None = None,
    search: str | None = None,
    loop_detected: bool | None = None,
    user_id: str | None = None,
    user_email: str | None = None,
    agent_version: str | None = None,
    tag: str | None = None,
    from_: datetime | None = Query(None, alias="from"),
    to: datetime | None = None,
    limit: int = Query(1000, le=5000),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import cast
    from sqlalchemy.dialects.postgresql import ARRAY, TEXT

    conditions = [AgentSession.project_id == project_id]
    if status:
        conditions.append(AgentSession.status == status)
    if agent_name:
        conditions.append(AgentSession.agent_name == agent_name)
    if search:
        conditions.append(AgentSession.agent_name.ilike(f"%{search}%"))
    if loop_detected is not None:
        conditions.append(AgentSession.loop_detected == loop_detected)
    if user_id:
        conditions.append(AgentSession.user_id == user_id)
    if user_email:
        conditions.append(AgentSession.user_email.ilike(f"%{user_email}%"))
    if agent_version:
        conditions.append(AgentSession.agent_version == agent_version)
    if tag:
        conditions.append(AgentSession.tags.contains(cast([tag], ARRAY(TEXT))))
    if from_:
        conditions.append(AgentSession.started_at >= from_)
    if to:
        conditions.append(AgentSession.started_at <= to)

    result = await db.execute(
        select(AgentSession)
        .where(and_(*conditions))
        .order_by(AgentSession.started_at.desc())
        .limit(limit)
    )
    sessions = result.scalars().all()

    FIELDS = [
        "id", "agent_name", "status", "started_at", "ended_at", "duration_ms",
        "total_cost_usd", "total_tokens", "input_tokens", "output_tokens",
        "iteration_count", "loop_detected", "loop_reason",
        "error_type", "error_message",
        "user_id", "user_email", "agent_version", "tags",
        "external_id", "created_at",
    ]

    def row(s: AgentSession) -> dict:
        return {
            "id": str(s.id),
            "agent_name": s.agent_name,
            "status": s.status,
            "started_at": s.started_at.isoformat() if s.started_at else None,
            "ended_at": s.ended_at.isoformat() if s.ended_at else None,
            "duration_ms": s.duration_ms,
            "total_cost_usd": float(s.total_cost_usd) if s.total_cost_usd else None,
            "total_tokens": s.total_tokens,
            "input_tokens": s.input_tokens,
            "output_tokens": s.output_tokens,
            "iteration_count": s.iteration_count,
            "loop_detected": s.loop_detected,
            "loop_reason": s.loop_reason,
            "error_type": s.error_type,
            "error_message": s.error_message,
            "user_id": s.user_id,
            "user_email": s.user_email,
            "agent_version": s.agent_version,
            "tags": ",".join(s.tags or []),
            "external_id": s.external_id,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }

    rows = [row(s) for s in sessions]

    if format == "json":
        content = json.dumps(rows, indent=2)
        return StreamingResponse(
            iter([content]),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=sessions.json"},
        )

    # CSV
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=FIELDS)
    writer.writeheader()
    writer.writerows(rows)

    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=sessions.csv"},
    )


@router.get("/{session_id}", response_model=SessionDetailResponse)
async def get_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AgentSession)
        .where(AgentSession.id == session_id)
        .options(selectinload(AgentSession.spans))
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    spans = sorted(session.spans, key=lambda s: s.started_at)

    issues_result = await db.execute(
        select(SessionIssue)
        .where(SessionIssue.session_id == session_id)
        .order_by(SessionIssue.created_at)
    )
    issues = issues_result.scalars().all()

    response = _to_session_response(session)
    return SessionDetailResponse(
        **response.model_dump(),
        spans=[SpanResponse.model_validate(s) for s in spans],
        issues=[IssueResponse.model_validate(i) for i in issues],
    )


@router.get("/{session_id}/fixture")
async def get_session_fixture(
    session_id: uuid.UUID,
    lang: str = Query("python", pattern="^(python|typescript)$"),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate a deterministic test fixture from a recorded session.

    Replays all LLM spans using their recorded outputs as mocks — making a
    nondeterministic agent run reproducible as an automated test.
    """
    from fastapi.responses import PlainTextResponse

    result = await db.execute(
        select(AgentSession)
        .where(AgentSession.id == session_id)
        .options(selectinload(AgentSession.spans))
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    spans = sorted(session.spans, key=lambda s: s.started_at)
    llm_spans = [s for s in spans if s.span_type == "llm"]
    tool_spans = [s for s in spans if s.span_type == "tool"]

    if lang == "python":
        code = _generate_python_fixture(session, llm_spans, tool_spans)
    else:
        code = _generate_typescript_fixture(session, llm_spans, tool_spans)

    return PlainTextResponse(code, media_type="text/plain")


def _py_str(s: str | None, max_len: int = 200) -> str:
    if not s:
        return '""'
    truncated = s[:max_len] + ("..." if len(s) > max_len else "")
    return '"""' + truncated.replace('"""', "'''") + '"""'


def _generate_python_fixture(session, llm_spans: list, tool_spans: list) -> str:
    agent_name = session.agent_name
    sid = str(session.id)
    status = session.status

    lines = [
        f'"""',
        f'Deterministic fixture for session {sid}',
        f'Agent: {agent_name} | Status: {status}',
        f'Generated by Dottle — replays recorded LLM outputs as mocks.',
        f'"""',
        f'import pytest',
        f'from unittest.mock import patch, MagicMock',
        f'',
        f'# Recorded LLM responses from session {sid[:8]}...',
        f'RECORDED_LLM_RESPONSES = [',
    ]
    for i, sp in enumerate(llm_spans):
        out = (sp.output_text or "").replace('"""', "'''")[:300]
        inp = (sp.input_text or "").replace('"""', "'''")[:200]
        lines.append(f'    # Span {i+1}: {sp.name}')
        lines.append(f'    {{')
        lines.append(f'        "model": {json.dumps(sp.model or "gpt-4o")},')
        lines.append(f'        "input_tokens": {sp.input_tokens or 0},')
        lines.append(f'        "output_tokens": {sp.output_tokens or 0},')
        lines.append(f'        "input": """{inp}""",')
        lines.append(f'        "output": """{out}""",')
        lines.append(f'    }},')
    lines.append(f']')
    lines.append(f'')
    lines.append(f'_llm_call_index = 0')
    lines.append(f'')
    lines.append(f'def mock_llm_create(**kwargs):')
    lines.append(f'    global _llm_call_index')
    lines.append(f'    resp = RECORDED_LLM_RESPONSES[_llm_call_index % len(RECORDED_LLM_RESPONSES)]')
    lines.append(f'    _llm_call_index += 1')
    lines.append(f'    mock = MagicMock()')
    lines.append(f'    mock.choices = [MagicMock(message=MagicMock(content=resp["output"]))]')
    lines.append(f'    mock.usage = MagicMock(prompt_tokens=resp["input_tokens"], completion_tokens=resp["output_tokens"])')
    lines.append(f'    mock.model = resp["model"]')
    lines.append(f'    return mock')
    lines.append(f'')
    lines.append(f'')
    lines.append(f'def test_{agent_name.replace("-", "_")}_session():')
    lines.append(f'    """Replay of session {sid[:8]} — expected status: {status}"""')
    lines.append(f'    global _llm_call_index')
    lines.append(f'    _llm_call_index = 0')
    lines.append(f'')
    lines.append(f'    with patch("openai.resources.chat.completions.Completions.create", side_effect=mock_llm_create):')
    lines.append(f'        # TODO: call your agent here')
    lines.append(f'        # result = run_my_agent(user_input="...")')
    lines.append(f'')
    if status == "failed":
        lines.append(f'        # This session originally FAILED — assert the error is handled')
        lines.append(f'        # with pytest.raises(YourAgentError):')
        lines.append(f'        #     result = run_my_agent(...)')
    elif status == "looping":
        lines.append(f'        # This session originally triggered a LOOP — assert your agent detects it')
        lines.append(f'        # assert result.status == "stopped" or result.loop_detected')
    else:
        lines.append(f'        # This session succeeded — assert the expected output')
        lines.append(f'        # assert result is not None')
    lines.append(f'        pass  # Remove this once you wire up your agent call')
    lines.append(f'')
    if tool_spans:
        lines.append(f'    # Tool calls recorded in this session:')
        for sp in tool_spans[:5]:
            lines.append(f'    # [{sp.status}] {sp.name}' + (f' — {sp.error_message}' if sp.error_message else ''))
    lines.append(f'')
    lines.append(f'    # Dottle: instrument your agent and assert session metrics')
    lines.append(f'    # assert_session_metrics(session_id, max_cost=0.01, max_iterations=10)')

    return "\n".join(lines)


def _generate_typescript_fixture(session, llm_spans: list, tool_spans: list) -> str:
    agent_name = session.agent_name
    sid = str(session.id)
    status = session.status

    lines = [
        f'/**',
        f' * Deterministic fixture for session {sid}',
        f' * Agent: {agent_name} | Status: {status}',
        f' * Generated by Dottle — replays recorded LLM outputs as mocks.',
        f' */',
        f'import {{ describe, it, expect, vi }} from "vitest";',
        f'',
        f'// Recorded LLM responses from session {sid[:8]}...',
        f'const RECORDED_LLM_RESPONSES = [',
    ]
    for i, sp in enumerate(llm_spans):
        out = (sp.output_text or "")[:300].replace("`", "'").replace("\\", "\\\\")
        lines.append(f'  // Span {i+1}: {sp.name}')
        lines.append(f'  {{')
        lines.append(f'    model: {json.dumps(sp.model or "gpt-4o")},')
        lines.append(f'    inputTokens: {sp.input_tokens or 0},')
        lines.append(f'    outputTokens: {sp.output_tokens or 0},')
        lines.append(f'    output: `{out}`,')
        lines.append(f'  }},')
    lines.append(f'];')
    lines.append(f'')
    lines.append(f'let _llmCallIndex = 0;')
    lines.append(f'')
    lines.append(f'function mockLlmCreate(params: {{ model: string; messages: unknown[] }}) {{')
    lines.append(f'  const resp = RECORDED_LLM_RESPONSES[_llmCallIndex++ % RECORDED_LLM_RESPONSES.length];')
    lines.append(f'  return Promise.resolve({{')
    lines.append(f'    choices: [{{ message: {{ content: resp.output }} }}],')
    lines.append(f'    usage: {{ prompt_tokens: resp.inputTokens, completion_tokens: resp.outputTokens }},')
    lines.append(f'    model: resp.model,')
    lines.append(f'  }});')
    lines.append(f'}}')
    lines.append(f'')
    lines.append(f'describe("{agent_name}", () => {{')
    lines.append(f'  it("replays session {sid[:8]} — expected: {status}", async () => {{')
    lines.append(f'    _llmCallIndex = 0;')
    lines.append(f'    // Mock the OpenAI client')
    lines.append(f'    vi.mock("openai", () => ({{')
    lines.append(f'      default: class {{ chat = {{ completions: {{ create: mockLlmCreate }} }} }}')
    lines.append(f'    }}));')
    lines.append(f'')
    lines.append(f'    // TODO: call your agent here')
    lines.append(f'    // const result = await runMyAgent({{ input: "..." }});')
    if status == "failed":
        lines.append(f'    // This session originally FAILED')
        lines.append(f'    // await expect(runMyAgent(...)).rejects.toThrow();')
    elif status == "looping":
        lines.append(f'    // This session triggered a LOOP')
        lines.append(f'    // expect(result.loopDetected).toBe(true);')
    else:
        lines.append(f'    // expect(result).toBeDefined();')
    lines.append(f'    expect(true).toBe(true); // Remove once agent is wired up')
    lines.append(f'  }});')
    lines.append(f'}});')

    return "\n".join(lines)


# ── AI Session Diagnosis Chat ─────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str   # "user" | "assistant"
    content: str

class ChatInput(BaseModel):
    message: str
    history: list[ChatMessage] = []


_DIAGNOSIS_SYSTEM = """You are an expert AI agent debugging assistant embedded in Dottle, an agent observability platform.

You are given full context about a specific agent session: its metadata, all recorded spans (LLM calls, tool calls, errors), and any detected behavioral issues.

Your job is to help the developer understand:
- Why the session failed or behaved unexpectedly
- What caused any loops, high costs, or errors
- What the agent was trying to do at each step
- How to fix the issue in their code

Be specific, reference actual span names, error messages, token counts, and tool names from the context. Format responses with markdown — use **bold** for key findings, `code` for function/tool names and values, and bullet points for multi-part explanations. Keep answers concise but complete."""


def _build_session_context(session: AgentSession, spans: list, issues: list) -> str:
    """Build a compact but complete context string from session data."""
    lines = [
        "# Session Context",
        f"- Agent: {session.agent_name}",
        f"- Status: {session.status}",
        f"- Duration: {session.duration_ms}ms" if session.duration_ms else "- Duration: unknown",
        f"- Total cost: ${float(session.total_cost_usd):.6f}" if session.total_cost_usd else "- Total cost: $0",
        f"- Tokens: {session.total_tokens} (in: {session.input_tokens}, out: {session.output_tokens})",
        f"- Iterations: {session.iteration_count}",
        f"- Loop detected: {session.loop_detected}" + (f" — {session.loop_reason}" if session.loop_reason else ""),
    ]
    if session.user_email or session.user_id:
        lines.append(f"- User: {session.user_email or session.user_id}")
    if session.agent_version:
        lines.append(f"- Version: {session.agent_version}")
    if session.error_message:
        lines.append(f"- Error ({session.error_type}): {session.error_message}")
    if session.tags:
        lines.append(f"- Tags: {', '.join(session.tags)}")

    # Issues
    if issues:
        lines.append("\n## Detected Issues")
        for iss in issues:
            lines.append(f"- **[{iss.severity.upper()}] {iss.issue_type}**: {iss.title}")
            if iss.description:
                # Truncate long descriptions
                desc = iss.description[:300]
                lines.append(f"  {desc}")

    # Spans — LLM calls first, then tool errors, then rest
    if spans:
        lines.append(f"\n## Spans ({len(spans)} total)")
        sorted_spans = sorted(spans, key=lambda s: s.started_at)

        for sp in sorted_spans:
            dur = f"{sp.duration_ms}ms" if sp.duration_ms else "?"
            cost = f"${float(sp.cost_usd):.6f}" if sp.cost_usd else ""
            tokens = f"{sp.input_tokens}→{sp.output_tokens} tok" if sp.input_tokens else ""
            status_marker = "❌" if sp.status == "error" else "✓"
            model_part = f" [{sp.model}]" if sp.model else ""

            lines.append(f"\n### {status_marker} {sp.span_type.upper()} · `{sp.name}`{model_part} ({dur}{', ' + cost if cost else ''}{', ' + tokens if tokens else ''})")

            if sp.error_message:
                lines.append(f"**Error** ({sp.error_type}): {sp.error_message[:400]}")

            # Include prompt/response for LLM spans (truncated)
            if sp.span_type == "llm":
                if sp.input_text:
                    truncated = sp.input_text[:600]
                    lines.append(f"**Prompt** (first 600 chars):\n```\n{truncated}\n```")
                if sp.output_text:
                    truncated = sp.output_text[:600]
                    lines.append(f"**Response** (first 600 chars):\n```\n{truncated}\n```")
            elif sp.span_type == "tool" and sp.input_text:
                lines.append(f"**Tool input**: `{sp.input_text[:200]}`")
                if sp.output_text:
                    lines.append(f"**Tool output**: `{sp.output_text[:200]}`")

    return "\n".join(lines)


@router.post("/{session_id}/ai-chat")
async def ai_chat_session(
    session_id: uuid.UUID,
    body: ChatInput,
    db: AsyncSession = Depends(get_db),
):
    """Stream an AI diagnosis response about a session using Claude."""
    from app.config import get_settings
    settings = get_settings()

    if not settings.anthropic_api_key:
        raise HTTPException(
            status_code=422,
            detail="ANTHROPIC_API_KEY not configured. Add it to your .env file."
        )

    # Load session with spans
    result = await db.execute(
        select(AgentSession)
        .options(selectinload(AgentSession.spans))
        .where(AgentSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Load issues separately (no relationship on model)
    issues_result = await db.execute(
        select(SessionIssue).where(SessionIssue.session_id == session_id)
    )
    issues = issues_result.scalars().all()

    context = _build_session_context(session, session.spans, issues)

    # Build message list for Claude
    messages = []
    # Inject context as first user turn if no history yet
    if not body.history:
        messages.append({
            "role": "user",
            "content": f"Here is the session context:\n\n{context}\n\nMy question: {body.message}"
        })
    else:
        # First turn already has context — just replay history + new message
        first = body.history[0]
        messages.append({
            "role": first.role,
            "content": f"Here is the session context:\n\n{context}\n\nMy question: {first.content}"
        })
        for msg in body.history[1:]:
            messages.append({"role": msg.role, "content": msg.content})
        messages.append({"role": "user", "content": body.message})

    payload = {
        "model": "claude-sonnet-4-6",
        "max_tokens": 2048,
        "system": _DIAGNOSIS_SYSTEM,
        "stream": True,
        "messages": messages,
    }

    async def generate():
        async with httpx.AsyncClient(timeout=120) as client:
            async with client.stream(
                "POST",
                "https://api.anthropic.com/v1/messages",
                json=payload,
                headers={
                    "x-api-key": settings.anthropic_api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
            ) as resp:
                if resp.status_code != 200:
                    body_text = await resp.aread()
                    yield f"data: {json.dumps({'error': body_text.decode()})}\n\n"
                    return

                async for line in resp.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    raw = line[5:].strip()
                    if raw == "[DONE]":
                        yield "data: [DONE]\n\n"
                        return
                    try:
                        event = json.loads(raw)
                        if event.get("type") == "content_block_delta":
                            delta = event.get("delta", {})
                            if delta.get("type") == "text_delta":
                                text = delta.get("text", "")
                                yield f"data: {json.dumps({'text': text})}\n\n"
                    except json.JSONDecodeError:
                        pass

        yield "data: [DONE]\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ── One-shot AI Root Cause Analysis ──────────────────────────────────────────

class DiagnoseResponse(BaseModel):
    root_cause: str
    suggestions: list[str]
    severity: str  # "critical" | "high" | "medium" | "low"


@router.post("/{session_id}/diagnose", response_model=DiagnoseResponse)
async def diagnose_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """One-shot AI root cause analysis. Returns structured root_cause + suggestions."""
    from app.config import get_settings
    settings = get_settings()

    if not settings.anthropic_api_key:
        raise HTTPException(
            status_code=422,
            detail="ANTHROPIC_API_KEY not configured. Add it to your .env file.",
        )

    result = await db.execute(
        select(AgentSession)
        .options(selectinload(AgentSession.spans))
        .where(AgentSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    issues_result = await db.execute(
        select(SessionIssue).where(SessionIssue.session_id == session_id)
    )
    issues = issues_result.scalars().all()

    context = _build_session_context(session, session.spans, issues)

    prompt = f"""Analyze this AI agent session and provide a concise root cause analysis.

{context}

Respond with ONLY a JSON object in this exact format (no markdown, no extra text):
{{
  "root_cause": "One clear sentence explaining the primary cause of failure or unexpected behavior",
  "suggestions": [
    "Specific actionable fix number 1",
    "Specific actionable fix number 2",
    "Specific actionable fix number 3"
  ],
  "severity": "critical"
}}

severity must be one of: critical, high, medium, low.
Be specific — reference actual span names, error messages, and values from the context."""

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            json={
                "model": "claude-sonnet-4-6",
                "max_tokens": 1024,
                "messages": [{"role": "user", "content": prompt}],
            },
            headers={
                "x-api-key": settings.anthropic_api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Claude API error: {resp.text}")

    data = resp.json()
    raw_text = data["content"][0]["text"].strip()

    # Strip optional markdown code fence if Claude adds one
    if raw_text.startswith("```"):
        raw_text = raw_text.split("\n", 1)[1].rsplit("```", 1)[0].strip()

    try:
        parsed = json.loads(raw_text)
        return DiagnoseResponse(
            root_cause=parsed.get("root_cause", "Unknown root cause"),
            suggestions=parsed.get("suggestions", []),
            severity=parsed.get("severity", "medium"),
        )
    except (json.JSONDecodeError, KeyError, ValueError):
        return DiagnoseResponse(
            root_cause=raw_text[:500] if raw_text else "Unable to analyze session",
            suggestions=[
                "Check the session spans for error details",
                "Review the error message and stack trace",
                "Enable debug logging in your agent",
            ],
            severity="medium",
        )


def _to_session_response(
    session: AgentSession,
    issue_count: int = 0,
    quality_score: float | None = None,
) -> SessionResponse:
    return SessionResponse(
        id=session.id,
        project_id=session.project_id,
        agent_name=session.agent_name,
        external_id=session.external_id,
        status=session.status,
        started_at=session.started_at,
        ended_at=session.ended_at,
        duration_ms=session.duration_ms,
        total_cost_usd=float(session.total_cost_usd) if session.total_cost_usd else None,
        total_tokens=session.total_tokens,
        input_tokens=session.input_tokens,
        output_tokens=session.output_tokens,
        iteration_count=session.iteration_count,
        loop_detected=session.loop_detected,
        loop_reason=session.loop_reason,
        error_message=session.error_message,
        error_type=session.error_type,
        metadata=session.metadata_ or {},
        created_at=session.created_at,
        user_id=session.user_id,
        user_email=session.user_email,
        tags=session.tags or [],
        agent_version=session.agent_version,
        issue_count=issue_count,
        quality_score=quality_score,
    )
