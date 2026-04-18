"""
Coding Agent Service
====================
Orchestrates: load issue context → fetch relevant files from GitHub
→ call Claude claude-sonnet-4-6 → parse structured patches → update job.

Architecture:
  - Uses Anthropic claude-sonnet-4-6 as default coding model (best code understanding)
  - GitHub files fetched via REST API using the stored PAT
  - Keyword-based file relevance ranking (no embeddings needed for MVP)
  - Structured output via tool_use so patches are machine-readable JSON
"""

import json
import re
import uuid
import httpx
import structlog
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.code_fix import GitHubConfig, CodeFixJob

logger = structlog.get_logger()
settings = get_settings()

# File extensions we're willing to fetch and pass to the LLM
CODE_EXTENSIONS = {
    ".py", ".ts", ".tsx", ".js", ".jsx",
    ".go", ".rs", ".java", ".rb", ".php",
    ".yaml", ".yml", ".toml", ".json", ".env.example",
    ".md",
}

# Max files to load per job (token budget guard)
MAX_FILES = 15
# Max bytes per file
MAX_FILE_BYTES = 40_000


# ── GitHub helpers ────────────────────────────────────────────────────────────

async def _gh_get(url: str, token: str) -> dict | list | None:
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(url, headers={
            "Authorization": f"token {token}",
            "Accept": "application/vnd.github.v3+json",
        })
        if r.status_code == 200:
            return r.json()
        logger.warning("GitHub API error", url=url, status=r.status_code)
        return None


async def _list_repo_files(owner: str, repo: str, branch: str, token: str) -> list[str]:
    """Return flat list of file paths in the repo (up to 1000, recursive tree)."""
    url = f"https://api.github.com/repos/{owner}/{repo}/git/trees/{branch}?recursive=1"
    data = await _gh_get(url, token)
    if not data or "tree" not in data:
        return []
    return [
        item["path"] for item in data["tree"]
        if item["type"] == "blob"
        and any(item["path"].endswith(ext) for ext in CODE_EXTENSIONS)
    ]


async def _fetch_file(owner: str, repo: str, path: str, branch: str, token: str) -> str | None:
    """Fetch raw file content from GitHub."""
    url = f"https://api.github.com/repos/{owner}/{repo}/contents/{path}?ref={branch}"
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(url, headers={
            "Authorization": f"token {token}",
            "Accept": "application/vnd.github.v3.raw",
        })
        if r.status_code == 200:
            content = r.text[:MAX_FILE_BYTES]
            return content
        return None


def _rank_files(all_files: list[str], issue_type: str, issue_context: dict) -> list[str]:
    """
    Score files by keyword relevance to the issue. No embeddings needed.
    Keywords come from issue_type, agent_names, error messages.
    """
    # Extract keywords from issue context
    keywords: list[str] = [issue_type.replace("_", " ")]
    for agent in issue_context.get("agent_names", []):
        # agent names often map to file names
        keywords.append(agent.lower().replace("-", "_").replace(" ", "_"))

    # Common issue → likely file pattern hints
    issue_hints: dict[str, list[str]] = {
        "session_failed":       ["main", "agent", "runner", "orchestrat"],
        "loop_detected":        ["loop", "agent", "runner", "orchestrat", "tools"],
        "high_latency":         ["llm", "client", "model", "call", "timeout"],
        "slow_span":            ["tools", "retriev", "search", "fetch"],
        "high_cost":            ["prompt", "llm", "token", "model"],
        "tool_failure_storm":   ["tools", "tool", "function"],
        "repeated_tool_error":  ["tools", "tool", "error"],
        "excessive_tokens":     ["prompt", "context", "llm", "message"],
        "no_llm_output":        ["llm", "model", "client", "generate"],
        "no_llm_calls":         ["agent", "orchestrat", "runner"],
    }
    keywords.extend(issue_hints.get(issue_type, []))

    def score(path: str) -> int:
        p = path.lower()
        return sum(1 for kw in keywords if kw in p)

    # Always include common entry points if present
    priority_patterns = ["main", "agent", "index", "app", "runner", "orchestrat"]

    def priority(path: str) -> int:
        p = path.lower()
        return sum(2 for pp in priority_patterns if pp in p)

    scored = sorted(all_files, key=lambda f: score(f) + priority(f), reverse=True)
    return scored[:MAX_FILES]


# ── Prompt assembly ───────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are an expert software engineer specializing in AI agent systems.
You will be given:
1. A detected issue type and its context (occurrence count, affected sessions, agent names)
2. Source code files from the user's codebase

Your job is to:
1. Write a concise ROOT CAUSE DIAGNOSIS (2-4 sentences)
2. Generate specific CODE PATCHES to fix the issue

Rules:
- Only patch files that are actually shown to you
- Be surgical — minimal changes that fix the issue
- Do not reformat or refactor unrelated code
- If you cannot find the root cause in the provided files, say so in diagnosis and return empty patches
- Patches must be valid, compilable code
"""

FIX_TOOL = {
    "name": "submit_fix",
    "description": "Submit the root cause diagnosis and code patches",
    "input_schema": {
        "type": "object",
        "properties": {
            "diagnosis": {
                "type": "string",
                "description": "Root cause analysis: why this issue is happening (2-4 sentences)"
            },
            "patches": {
                "type": "array",
                "description": "List of file patches",
                "items": {
                    "type": "object",
                    "properties": {
                        "file_path": {"type": "string", "description": "Relative path of file to patch"},
                        "old_code": {"type": "string", "description": "Exact existing code to replace (must match exactly)"},
                        "new_code": {"type": "string", "description": "Replacement code"},
                        "explanation": {"type": "string", "description": "One sentence: what this change fixes"}
                    },
                    "required": ["file_path", "old_code", "new_code", "explanation"]
                }
            }
        },
        "required": ["diagnosis", "patches"]
    }
}


def _build_user_message(issue_type: str, issue_context: dict, files: dict[str, str]) -> str:
    parts = [
        f"## Issue: {issue_type}",
        f"- Occurrences: {issue_context.get('occurrence_count', 'N/A')}",
        f"- Affected sessions: {issue_context.get('session_count', 'N/A')}",
        f"- Affected agents: {', '.join(issue_context.get('agent_names', []))}",
        f"- Severity: {issue_context.get('severity', 'unknown')}",
        f"- Description: {issue_context.get('title', issue_type)}",
    ]

    if issue_context.get("sample_errors"):
        parts.append("\n### Sample error messages from affected sessions:")
        for err in issue_context["sample_errors"][:3]:
            parts.append(f"  - {err}")

    parts.append("\n## Source Files\n")
    for path, content in files.items():
        parts.append(f"### {path}\n```\n{content}\n```\n")

    parts.append("\nPlease analyze these files and call `submit_fix` with the diagnosis and patches.")
    return "\n".join(parts)


# ── Main agent loop ───────────────────────────────────────────────────────────

async def run_coding_agent(job_id: str, db: AsyncSession) -> None:
    """
    Entry point: runs the full coding agent loop for a CodeFixJob.
    Updates the job record in-place as it progresses.
    """
    # Load the job
    result = await db.execute(select(CodeFixJob).where(CodeFixJob.id == uuid.UUID(job_id)))
    job = result.scalar_one_or_none()
    if not job:
        logger.error("CodeFixJob not found", job_id=job_id)
        return

    # Load GitHub config
    result = await db.execute(
        select(GitHubConfig).where(GitHubConfig.project_id == job.project_id)
    )
    gh = result.scalar_one_or_none()
    if not gh:
        await _fail_job(job, db, "No GitHub integration configured for this project")
        return

    try:
        # Mark running
        job.status = "running"
        job.updated_at = datetime.now(timezone.utc)
        await db.commit()

        # Step 1: List repo files
        logger.info("Fetching repo file tree", owner=gh.repo_owner, repo=gh.repo_name)
        all_files = await _list_repo_files(gh.repo_owner, gh.repo_name, gh.default_branch, gh.access_token)
        if not all_files:
            await _fail_job(job, db, "Could not list repository files. Check GitHub token permissions.")
            return

        # Step 2: Rank and select relevant files
        relevant_paths = _rank_files(all_files, job.issue_type, job.issue_context)
        logger.info("Selected files for context", count=len(relevant_paths), files=relevant_paths)

        # Step 3: Fetch file contents
        files: dict[str, str] = {}
        for path in relevant_paths:
            content = await _fetch_file(gh.repo_owner, gh.repo_name, path, gh.default_branch, gh.access_token)
            if content:
                files[path] = content

        if not files:
            await _fail_job(job, db, "Could not fetch any source files from the repository.")
            return

        job.files_loaded = list(files.keys())
        await db.commit()

        # Step 4: Call Claude
        api_key = settings.anthropic_api_key
        if not api_key:
            await _fail_job(job, db, "ANTHROPIC_API_KEY not configured on this server.")
            return

        user_message = _build_user_message(job.issue_type, job.issue_context, files)
        patches, diagnosis = await _call_claude(api_key, user_message)

        # Step 5: Save results
        job.diagnosis = diagnosis
        job.patches = patches
        job.status = "ready"
        job.updated_at = datetime.now(timezone.utc)
        await db.commit()
        logger.info("Coding agent completed", job_id=job_id, patch_count=len(patches))

    except Exception as e:
        logger.exception("Coding agent failed", job_id=job_id, error=str(e))
        await _fail_job(job, db, str(e))


async def _call_claude(api_key: str, user_message: str) -> tuple[list, str]:
    """Call Claude claude-sonnet-4-6 with tool_use to get structured patches."""
    payload = {
        "model": "claude-sonnet-4-6",
        "max_tokens": 8192,
        "system": SYSTEM_PROMPT,
        "tools": [FIX_TOOL],
        "tool_choice": {"type": "any"},
        "messages": [{"role": "user", "content": user_message}]
    }

    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.post(
            "https://api.anthropic.com/v1/messages",
            json=payload,
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            }
        )
        r.raise_for_status()
        data = r.json()

    # Extract tool use block
    for block in data.get("content", []):
        if block.get("type") == "tool_use" and block.get("name") == "submit_fix":
            inp = block.get("input", {})
            return inp.get("patches", []), inp.get("diagnosis", "")

    # Fallback: try to extract text
    for block in data.get("content", []):
        if block.get("type") == "text":
            return [], block.get("text", "Analysis complete but no structured patches generated.")

    return [], "No response from model."


async def _fail_job(job: CodeFixJob, db: AsyncSession, message: str) -> None:
    job.status = "failed"
    job.error_message = message
    job.updated_at = datetime.now(timezone.utc)
    await db.commit()


# ── GitHub PR creation ────────────────────────────────────────────────────────

async def create_github_pr(job: CodeFixJob, gh: GitHubConfig, pr_title: str, pr_body: str) -> str:
    """
    Apply patches as a new branch + open a PR. Returns PR URL.
    """
    if not job.patches:
        raise ValueError("No patches to apply")

    branch_name = f"dottle-fix/{job.issue_type}-{str(job.id)[:8]}"

    # Get current commit SHA for default branch
    ref_url = f"https://api.github.com/repos/{gh.repo_owner}/{gh.repo_name}/git/ref/heads/{gh.default_branch}"
    ref_data = await _gh_get(ref_url, gh.access_token)
    if not ref_data:
        raise RuntimeError("Could not fetch branch ref from GitHub")
    base_sha = ref_data["object"]["sha"]

    # Create new branch
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"https://api.github.com/repos/{gh.repo_owner}/{gh.repo_name}/git/refs",
            json={"ref": f"refs/heads/{branch_name}", "sha": base_sha},
            headers={
                "Authorization": f"token {gh.access_token}",
                "Accept": "application/vnd.github.v3+json",
            }
        )
        if r.status_code not in (200, 201):
            raise RuntimeError(f"Failed to create branch: {r.text}")

    # Apply each patch as a file update
    for patch in job.patches:
        file_path = patch["file_path"]
        new_code = patch["new_code"]

        # Get current file SHA (needed for update)
        file_url = f"https://api.github.com/repos/{gh.repo_owner}/{gh.repo_name}/contents/{file_path}?ref={branch_name}"
        file_data = await _gh_get(file_url, gh.access_token)

        if file_data and "content" in file_data:
            # File exists — get full content, apply patch, update
            import base64
            current_content = base64.b64decode(file_data["content"]).decode("utf-8")
            old_code = patch.get("old_code", "")
            if old_code and old_code in current_content:
                patched = current_content.replace(old_code, new_code, 1)
            else:
                patched = new_code  # full file replacement fallback

            file_sha = file_data["sha"]
            update_payload = {
                "message": f"fix({job.issue_type}): {patch['explanation']}\n\nGenerated by Dottle Code Fix",
                "content": base64.b64encode(patched.encode()).decode(),
                "sha": file_sha,
                "branch": branch_name,
            }
        else:
            # New file
            import base64
            update_payload = {
                "message": f"fix({job.issue_type}): {patch['explanation']}",
                "content": base64.b64encode(new_code.encode()).decode(),
                "branch": branch_name,
            }

        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.put(
                f"https://api.github.com/repos/{gh.repo_owner}/{gh.repo_name}/contents/{file_path}",
                json=update_payload,
                headers={
                    "Authorization": f"token {gh.access_token}",
                    "Accept": "application/vnd.github.v3+json",
                }
            )
            if r.status_code not in (200, 201):
                raise RuntimeError(f"Failed to update {file_path}: {r.text}")

    # Create PR
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"https://api.github.com/repos/{gh.repo_owner}/{gh.repo_name}/pulls",
            json={
                "title": pr_title,
                "body": pr_body,
                "head": branch_name,
                "base": gh.default_branch,
            },
            headers={
                "Authorization": f"token {gh.access_token}",
                "Accept": "application/vnd.github.v3+json",
            }
        )
        if r.status_code not in (200, 201):
            raise RuntimeError(f"Failed to create PR: {r.text}")
        pr_data = r.json()
        return pr_data["html_url"]
