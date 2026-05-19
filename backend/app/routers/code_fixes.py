"""
Code Fixes Router
=================
Endpoints:
  GET  /projects/{project_id}/github           - get GitHub config (token masked)
  PUT  /projects/{project_id}/github           - save/update GitHub config
  DELETE /projects/{project_id}/github         - remove GitHub config

  POST /issues/{issue_type}/fix                - create a CodeFixJob, trigger agent
  GET  /fix/jobs/{job_id}                      - poll job status + results
  POST /fix/jobs/{job_id}/create-pr            - push branch + open GitHub PR
"""

import asyncio
import re
import uuid
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.code_fix import GitHubConfig, CodeFixJob
from app.models.project import Project
from app.routers.auth import get_current_user
from app.models.user import User
from app.services.coding_agent import run_coding_agent, create_github_pr

router = APIRouter(tags=["code-fixes"])


# ── Auth helpers ──────────────────────────────────────────────────────────────

async def _get_project(project_id: uuid.UUID, db: AsyncSession) -> Project:
    r = await db.execute(select(Project).where(Project.id == project_id))
    project = r.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


# ── Schemas ───────────────────────────────────────────────────────────────────

class GitHubConfigInput(BaseModel):
    repo_url: str          # e.g. https://github.com/owner/repo
    access_token: str      # GitHub PAT
    default_branch: str = "main"


class GitHubConfigResponse(BaseModel):
    project_id: uuid.UUID
    repo_url: str
    repo_owner: str
    repo_name: str
    default_branch: str
    token_masked: str      # show only last 4 chars

    model_config = {"from_attributes": True}


class CodeFixJobResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    issue_type: str
    status: str
    diagnosis: str | None
    patches: list | None
    pr_url: str | None
    pr_branch: str | None
    files_loaded: list | None
    error_message: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CreatePRInput(BaseModel):
    title: str | None = None
    body: str | None = None


# ── GitHub Config endpoints ───────────────────────────────────────────────────

def _parse_repo_url(url: str) -> tuple[str, str]:
    """Extract owner and repo from GitHub URL."""
    # Handles https://github.com/owner/repo and git@github.com:owner/repo.git
    m = re.search(r"github\.com[:/]([^/]+)/([^/.]+?)(?:\.git)?$", url)
    if not m:
        raise HTTPException(status_code=400, detail=f"Invalid GitHub repo URL: {url}")
    return m.group(1), m.group(2)


@router.get("/projects/{project_id}/github", response_model=GitHubConfigResponse)
async def get_github_config(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_project(project_id, db)
    r = await db.execute(select(GitHubConfig).where(GitHubConfig.project_id == project_id))
    gh = r.scalar_one_or_none()
    if not gh:
        raise HTTPException(status_code=404, detail="No GitHub integration configured")
    return GitHubConfigResponse(
        project_id=gh.project_id,
        repo_url=gh.repo_url,
        repo_owner=gh.repo_owner,
        repo_name=gh.repo_name,
        default_branch=gh.default_branch,
        token_masked="****" + gh.access_token[-4:],
    )


@router.put("/projects/{project_id}/github", response_model=GitHubConfigResponse)
async def save_github_config(
    project_id: uuid.UUID,
    body: GitHubConfigInput,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_project(project_id, db)
    owner, repo = _parse_repo_url(body.repo_url)

    # ── Validate token against GitHub API ────────────────────────────────────
    gh_headers = {
        "Authorization": f"token {body.access_token}",
        "Accept": "application/vnd.github.v3+json",
    }
    async with httpx.AsyncClient(timeout=10) as client:
        auth_resp = await client.get("https://api.github.com/user", headers=gh_headers)
        if auth_resp.status_code == 401:
            raise HTTPException(
                status_code=422,
                detail="Invalid GitHub token — authentication failed. Make sure the token has the 'repo' scope.",
            )
        if auth_resp.status_code not in (200, 403):
            raise HTTPException(
                status_code=422,
                detail=f"GitHub API returned {auth_resp.status_code}. Check the token and try again.",
            )
        repo_resp = await client.get(
            f"https://api.github.com/repos/{owner}/{repo}", headers=gh_headers
        )
        if repo_resp.status_code == 404:
            raise HTTPException(
                status_code=422,
                detail=f"Repository {owner}/{repo} not found or the token lacks access.",
            )
        if repo_resp.status_code not in (200, 403):
            raise HTTPException(
                status_code=422,
                detail=f"Could not verify repo access (GitHub {repo_resp.status_code}).",
            )

    r = await db.execute(select(GitHubConfig).where(GitHubConfig.project_id == project_id))
    gh = r.scalar_one_or_none()

    if gh:
        gh.repo_url = body.repo_url
        gh.repo_owner = owner
        gh.repo_name = repo
        gh.default_branch = body.default_branch
        gh.access_token = body.access_token
        gh.updated_at = datetime.now(timezone.utc)
    else:
        gh = GitHubConfig(
            id=uuid.uuid4(),
            project_id=project_id,
            repo_url=body.repo_url,
            repo_owner=owner,
            repo_name=repo,
            default_branch=body.default_branch,
            access_token=body.access_token,
        )
        db.add(gh)

    await db.commit()
    return GitHubConfigResponse(
        project_id=gh.project_id,
        repo_url=gh.repo_url,
        repo_owner=gh.repo_owner,
        repo_name=gh.repo_name,
        default_branch=gh.default_branch,
        token_masked="****" + gh.access_token[-4:],
    )


@router.delete("/projects/{project_id}/github", status_code=status.HTTP_204_NO_CONTENT)
async def delete_github_config(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_project(project_id, db)
    r = await db.execute(select(GitHubConfig).where(GitHubConfig.project_id == project_id))
    gh = r.scalar_one_or_none()
    if gh:
        await db.delete(gh)
        await db.commit()


# ── Code Fix Job endpoints ────────────────────────────────────────────────────

class CreateFixJobInput(BaseModel):
    project_id: uuid.UUID
    # Caller passes the issue context so agent has full info without extra DB queries
    issue_context: dict = {}


@router.post("/issues/{issue_type}/fix", response_model=CodeFixJobResponse, status_code=status.HTTP_202_ACCEPTED)
async def create_fix_job(
    issue_type: str,
    body: CreateFixJobInput,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a CodeFixJob and kick off the coding agent via ARQ worker."""
    from app.arq_pool import enqueue

    await _get_project(body.project_id, db)

    # Check GitHub is configured
    r = await db.execute(select(GitHubConfig).where(GitHubConfig.project_id == body.project_id))
    if not r.scalar_one_or_none():
        raise HTTPException(
            status_code=422,
            detail="GitHub integration not configured. Add a GitHub repository in Settings first."
        )

    job = CodeFixJob(
        id=uuid.uuid4(),
        project_id=body.project_id,
        issue_type=issue_type,
        issue_context=body.issue_context,
        status="pending",
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    await enqueue("task_run_code_fix", job_id=str(job.id))
    return job


@router.get("/fix/jobs/{job_id}", response_model=CodeFixJobResponse)
async def get_fix_job(
    job_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    r = await db.execute(select(CodeFixJob).where(CodeFixJob.id == job_id))
    job = r.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Fix job not found")
    return job


@router.get("/projects/{project_id}/fix/jobs", response_model=list[CodeFixJobResponse])
async def list_fix_jobs(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List recent fix jobs for a project."""
    await _get_project(project_id, db)
    r = await db.execute(
        select(CodeFixJob)
        .where(CodeFixJob.project_id == project_id)
        .order_by(CodeFixJob.created_at.desc())
        .limit(50)
    )
    return r.scalars().all()


@router.post("/fix/jobs/{job_id}/create-pr", response_model=CodeFixJobResponse)
async def create_pr(
    job_id: uuid.UUID,
    body: CreatePRInput,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Push patches as a new branch and open a GitHub PR."""
    r = await db.execute(select(CodeFixJob).where(CodeFixJob.id == job_id))
    job = r.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Fix job not found")
    if job.status != "ready":
        raise HTTPException(status_code=422, detail=f"Job is not ready (status: {job.status})")
    if not job.patches:
        raise HTTPException(status_code=422, detail="No patches to apply")

    r = await db.execute(select(GitHubConfig).where(GitHubConfig.project_id == job.project_id))
    gh = r.scalar_one_or_none()
    if not gh:
        raise HTTPException(status_code=422, detail="GitHub integration not configured")

    pr_title = body.title or f"fix({job.issue_type}): Dottle auto-fix"
    patch_lines = "\n".join(
        f"- `{p['file_path']}`: {p['explanation']}" for p in (job.patches or [])
    )
    pr_body = body.body or (
        f"## Root Cause\n\n{job.diagnosis}\n\n"
        f"## Changes\n\n{patch_lines}\n\n"
        f"---\n_Generated by [Dottle](https://dottle.dev) Code Fix for issue `{job.issue_type}`_"
    )

    try:
        pr_url = await create_github_pr(job, gh, pr_title, pr_body)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    branch_name = f"dottle-fix/{job.issue_type}-{str(job.id)[:8]}"
    job.pr_url = pr_url
    job.pr_branch = branch_name
    job.status = "applied"
    job.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(job)
    return job
