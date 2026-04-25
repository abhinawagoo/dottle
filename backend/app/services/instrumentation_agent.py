"""
Instrumentation Agent
=====================
Reads a user's GitHub repo, understands their AI agent stack,
and generates Dottle SDK instrumentation patches automatically.

Flow:
  1. Fetch repo file tree via GitHub API
  2. Smart-rank files by relevance (entry points, agent files, LLM calls)
  3. Fetch top N file contents
  4. Build a prompt with questionnaire answers + file contents
  5. Call Claude — structured tool_use output → list of patches + env vars
  6. Save to OnboardingJob
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
from app.models.onboarding import OnboardingJob
from app.models.code_fix import GitHubConfig

logger = structlog.get_logger()
settings = get_settings()

CODE_EXTENSIONS = {
    ".py", ".ts", ".tsx", ".js", ".jsx",
    ".go", ".rs", ".java", ".rb",
    ".yaml", ".yml", ".toml",
    "requirements.txt", "package.json", "pyproject.toml",
}
MAX_FILES = 20
MAX_FILE_BYTES = 30_000

# Priority file name patterns — fetch these first
PRIORITY_PATTERNS = [
    "main", "agent", "run", "app", "bot", "worker",
    "llm", "openai", "anthropic", "langchain", "llamaindex",
    "tools", "tool", "retriev", "search",
    "requirements", "package.json", "pyproject", "setup",
    "README", "readme",
]


# ── GitHub helpers (shared with coding_agent) ─────────────────────────────────

async def _gh_get(url: str, token: str):
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(url, headers={
            "Authorization": f"token {token}",
            "Accept": "application/vnd.github.v3+json",
        })
        if r.status_code == 200:
            return r.json()
        return None


async def _list_repo_files(owner: str, repo: str, branch: str, token: str) -> list[str]:
    url = f"https://api.github.com/repos/{owner}/{repo}/git/trees/{branch}?recursive=1"
    data = await _gh_get(url, token)
    if not data or "tree" not in data:
        return []
    return [
        item["path"] for item in data["tree"]
        if item["type"] == "blob" and (
            any(item["path"].endswith(ext) for ext in CODE_EXTENSIONS)
            or item["path"] in {"requirements.txt", "package.json", "pyproject.toml"}
        )
    ]


async def _fetch_file(owner: str, repo: str, path: str, branch: str, token: str) -> str | None:
    url = f"https://api.github.com/repos/{owner}/{repo}/contents/{path}?ref={branch}"
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(url, headers={
            "Authorization": f"token {token}",
            "Accept": "application/vnd.github.v3.raw",
        })
        if r.status_code == 200:
            return r.text[:MAX_FILE_BYTES]
        return None


def _rank_files(files: list[str], q: dict) -> list[str]:
    """Score files by relevance to an AI agent project."""
    scores: dict[str, int] = {}
    tech = " ".join([
        q.get("framework", ""),
        q.get("llm_provider", ""),
        " ".join(q.get("tool_types", [])),
        q.get("agent_entry_file", ""),
    ]).lower()

    # Extract user-mentioned keywords
    extra_keywords = [w.strip().lower() for w in tech.split() if len(w) > 2]

    for path in files:
        score = 0
        name = path.lower()
        parts = name.replace("/", " ").replace("_", " ").replace("-", " ").replace(".", " ").split()

        # Priority patterns
        for pat in PRIORITY_PATTERNS:
            if pat in parts or pat in name:
                score += 10

        # User-mentioned keywords
        for kw in extra_keywords:
            if kw in name:
                score += 8

        # Penalise deep paths, tests, migrations, generated files
        depth = path.count("/")
        score -= depth * 2
        if any(x in name for x in ["test", "spec", "mock", "__pycache__", ".min.", "dist/", "build/", "node_modules"]):
            score -= 30

        # Boost config/requirements files
        if any(name.endswith(x) for x in ["requirements.txt", "package.json", "pyproject.toml", "setup.py"]):
            score += 15

        scores[path] = score

    return sorted(files, key=lambda p: scores.get(p, 0), reverse=True)


# ── Main analysis function ────────────────────────────────────────────────────

async def run_instrumentation_agent(job_id: str, db: AsyncSession) -> None:
    result = await db.execute(select(OnboardingJob).where(OnboardingJob.id == uuid.UUID(job_id)))
    job = result.scalar_one_or_none()
    if not job:
        logger.error("Onboarding job not found", job_id=job_id)
        return

    async def _fail(msg: str):
        job.status = "failed"
        job.error_message = msg
        job.updated_at = datetime.now(timezone.utc)
        await db.commit()

    # Load GitHub config
    gh_result = await db.execute(
        select(GitHubConfig).where(GitHubConfig.project_id == job.project_id)
    )
    gh = gh_result.scalar_one_or_none()
    if not gh:
        await _fail("GitHub integration not configured. Connect GitHub in Settings first.")
        return

    job.status = "analyzing"
    job.updated_at = datetime.now(timezone.utc)
    await db.commit()

    q = job.questionnaire or {}

    # Step 1: List repo files
    logger.info("Listing repo files", owner=job.repo_owner, repo=job.repo_name)
    all_files = await _list_repo_files(job.repo_owner, job.repo_name, job.default_branch, gh.access_token)
    if not all_files:
        await _fail("Could not list repository files. Check GitHub token permissions.")
        return

    # Step 2: Rank and select top files
    ranked = _rank_files(all_files, q)
    selected = ranked[:MAX_FILES]

    # Step 3: Fetch file contents
    file_contents: dict[str, str] = {}
    for path in selected:
        content = await _fetch_file(job.repo_owner, job.repo_name, path, job.default_branch, gh.access_token)
        if content:
            file_contents[path] = content

    if not file_contents:
        await _fail("Could not fetch any source files from the repository.")
        return

    job.files_analyzed = list(file_contents.keys())
    await db.commit()

    # Step 4: Build prompt
    q_text = _format_questionnaire(q)
    files_text = "\n\n".join(
        f"### {path}\n```\n{content[:8000]}\n```"
        for path, content in file_contents.items()
    )

    system_prompt = """You are an expert AI agent observability engineer. You are given:
1. A questionnaire describing what the user's AI agent does and its tech stack
2. Key source files from their repository

Your job is to add Dottle SDK instrumentation to their codebase so that every LLM call, tool call, and agent session is automatically tracked in the Dottle dashboard.

Dottle Python SDK usage:
```python
import dottle
dottle.configure(api_key=os.environ["DOTTLE_API_KEY"])

# Session wrapper
with dottle.session("agent-name", user_id="...", metadata={}) as sid:
    # LLM call tracking
    with dottle.span("llm", "model-name") as s:
        response = client.chat.completions.create(...)
        s.record_tokens(response.usage.prompt_tokens, response.usage.completion_tokens, "model-name")

    # Tool call tracking
    with dottle.span("tool", "tool-name") as s:
        result = my_tool(args)

    # Retrieval tracking
    with dottle.span("retrieval", "vector-search") as s:
        docs = vectordb.query(embedding)
```

For LangChain:
```python
from dottle.integrations.langchain import DottleCallbackHandler
handler = DottleCallbackHandler()
llm = ChatOpenAI(callbacks=[handler])
agent = AgentExecutor(agent=..., tools=..., callbacks=[handler])
with dottle.session("langchain-agent") as sid:
    result = agent.invoke({"input": query})
```

Rules:
- Add `import dottle` and `dottle.configure(api_key=os.environ["DOTTLE_API_KEY"])` at the top of the main entry point
- Wrap the main agent function/call in `dottle.session()`
- Wrap each LLM call in `dottle.span("llm", model_name)` and record tokens
- Wrap each tool call in `dottle.span("tool", tool_name)`
- For LangChain projects, use DottleCallbackHandler instead of manual spans
- Keep changes minimal — don't restructure existing code
- Make patches that apply cleanly to the original files
- Be specific about exactly what to change (show before/after)"""

    user_prompt = f"""## Questionnaire
{q_text}

## Repository: {job.repo_owner}/{job.repo_name}

## Source files:
{files_text}

Analyze this codebase and generate instrumentation patches. Return structured output using the add_instrumentation tool."""

    # Step 5: Call Claude
    tools = [{
        "name": "add_instrumentation",
        "description": "Return the instrumentation patches and required env vars",
        "input_schema": {
            "type": "object",
            "required": ["summary", "patches", "env_vars_needed"],
            "properties": {
                "summary": {
                    "type": "string",
                    "description": "2-3 sentence summary of what the agent does and what instrumentation was added"
                },
                "patches": {
                    "type": "array",
                    "description": "List of file changes to add Dottle instrumentation",
                    "items": {
                        "type": "object",
                        "required": ["file_path", "original_snippet", "updated_snippet", "explanation"],
                        "properties": {
                            "file_path": {"type": "string", "description": "Relative path to the file"},
                            "original_snippet": {"type": "string", "description": "The exact original code to replace (must match file exactly)"},
                            "updated_snippet": {"type": "string", "description": "The replacement code with Dottle instrumentation added"},
                            "explanation": {"type": "string", "description": "What this change does and why"}
                        }
                    }
                },
                "env_vars_needed": {
                    "type": "array",
                    "description": "Environment variables the user needs to add",
                    "items": {
                        "type": "object",
                        "required": ["name", "description", "example"],
                        "properties": {
                            "name": {"type": "string"},
                            "description": {"type": "string"},
                            "example": {"type": "string"}
                        }
                    }
                }
            }
        }
    }]

    try:
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": settings.anthropic_api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": "claude-sonnet-4-6",
                    "max_tokens": 8000,
                    "system": system_prompt,
                    "tools": tools,
                    "tool_choice": {"type": "any"},
                    "messages": [{"role": "user", "content": user_prompt}],
                },
            )

        if resp.status_code != 200:
            await _fail(f"AI service error: {resp.status_code}")
            return

        data = resp.json()
        tool_use = next((b for b in data.get("content", []) if b.get("type") == "tool_use"), None)
        if not tool_use:
            await _fail("AI did not return structured output. Please try again.")
            return

        result_data = tool_use.get("input", {})

    except Exception as e:
        await _fail(f"AI call failed: {str(e)}")
        return

    # Step 6: Save results
    job.status = "ready"
    job.summary = result_data.get("summary", "")
    job.patches = result_data.get("patches", [])
    job.env_vars_needed = result_data.get("env_vars_needed", [
        {"name": "DOTTLE_API_KEY", "description": "Your Dottle project API key", "example": "dtl_live_..."}
    ])
    job.updated_at = datetime.now(timezone.utc)
    await db.commit()

    logger.info("Instrumentation analysis complete",
                job_id=job_id, patches=len(job.patches or []),
                files=len(job.files_analyzed or []))


def _format_questionnaire(q: dict) -> str:
    lines = []
    labels = {
        "language": "Primary language",
        "framework": "AI framework",
        "llm_provider": "LLM provider(s)",
        "agent_type": "Agent type",
        "tool_types": "Tool types used",
        "agent_description": "What the agent does",
        "entry_file": "Main entry file",
        "multi_agent": "Multi-agent system",
    }
    for key, label in labels.items():
        val = q.get(key)
        if val:
            if isinstance(val, list):
                val = ", ".join(val)
            lines.append(f"- **{label}:** {val}")
    return "\n".join(lines) if lines else "(No questionnaire answers provided)"


# ── PR creation (reuses coding_agent pattern) ─────────────────────────────────

async def create_instrumentation_pr(job: OnboardingJob, gh: GitHubConfig, title: str, body: str) -> str:
    """Push patches as a new branch and open a GitHub PR. Returns PR URL."""
    branch_name = f"dottle-instrument/{str(job.id)[:8]}"
    token = gh.access_token
    owner = job.repo_owner
    repo = job.repo_name
    base_branch = job.default_branch
    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json",
    }

    async with httpx.AsyncClient(timeout=30) as client:
        # Get base SHA
        ref_resp = await client.get(
            f"https://api.github.com/repos/{owner}/{repo}/git/ref/heads/{base_branch}",
            headers=headers,
        )
        if ref_resp.status_code != 200:
            raise RuntimeError(f"Could not get base branch SHA: {ref_resp.status_code}")
        base_sha = ref_resp.json()["object"]["sha"]

        # Create branch
        await client.post(
            f"https://api.github.com/repos/{owner}/{repo}/git/refs",
            headers=headers,
            json={"ref": f"refs/heads/{branch_name}", "sha": base_sha},
        )

        # Apply each patch
        for patch in (job.patches or []):
            file_path = patch.get("file_path", "")
            original = patch.get("original_snippet", "")
            updated = patch.get("updated_snippet", "")
            if not file_path or not updated:
                continue

            # Fetch current file content
            file_resp = await client.get(
                f"https://api.github.com/repos/{owner}/{repo}/contents/{file_path}?ref={branch_name}",
                headers=headers,
            )
            if file_resp.status_code != 200:
                continue

            file_data = file_resp.json()
            import base64
            current_content = base64.b64decode(file_data["sha"] and file_data.get("content", "")).decode("utf-8", errors="replace")
            file_sha = file_data["sha"]

            if original and original in current_content:
                new_content = current_content.replace(original, updated, 1)
            else:
                # Append at end if original not found exactly
                new_content = current_content + "\n\n# --- Dottle instrumentation ---\n" + updated

            encoded = base64.b64encode(new_content.encode()).decode()
            await client.put(
                f"https://api.github.com/repos/{owner}/{repo}/contents/{file_path}",
                headers=headers,
                json={
                    "message": f"dottle: instrument {file_path}",
                    "content": encoded,
                    "sha": file_sha,
                    "branch": branch_name,
                },
            )

        # Open PR
        pr_resp = await client.post(
            f"https://api.github.com/repos/{owner}/{repo}/pulls",
            headers=headers,
            json={
                "title": title,
                "body": body,
                "head": branch_name,
                "base": base_branch,
            },
        )
        if pr_resp.status_code not in (200, 201):
            raise RuntimeError(f"Could not create PR: {pr_resp.status_code} {pr_resp.text[:200]}")

        return pr_resp.json().get("html_url", "")
