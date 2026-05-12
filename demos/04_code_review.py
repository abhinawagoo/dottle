"""
Demo 4: Automated Code Review Agent
=====================================
Industry: DevTools / Engineering Productivity
Agent: Reviews pull requests for security, performance, and code quality

Features demonstrated:
  - wrap_anthropic() for LLM calls
  - Rich tool spans (git, static analysis, security scanning)
  - session metadata linking to PR/repo
  - Mixed results: one PR approved, one blocked on security finding
  - Nested span simulation (review phases)

Run: python 04_code_review.py
     Then open https://app.dottle.dev/sessions
"""

import sys, time
import _config  # loads DOTTLE_API_KEY from env, configures dottle → production
import dottle
from _mock_clients import MockAnthropic

anthropic = dottle.wrap_anthropic(MockAnthropic("code"))

BANNER = "=" * 60

PULL_REQUESTS = [
    {
        "pr_number": 1842,
        "title": "Add user authentication via JWT + refresh tokens",
        "author": "dev_priya",
        "author_email": "priya@acmecorp.com",
        "repo": "acmecorp/backend",
        "files_changed": 12,
        "lines_added": 387,
        "lines_removed": 42,
        "risk_level": "high",
        "outcome": "blocked",  # security issue found
    },
    {
        "pr_number": 1851,
        "title": "Optimize database queries in reporting module",
        "author": "dev_marcus",
        "author_email": "marcus@acmecorp.com",
        "repo": "acmecorp/backend",
        "files_changed": 4,
        "lines_added": 89,
        "lines_removed": 134,
        "risk_level": "medium",
        "outcome": "approved",
    },
]


for pr in PULL_REQUESTS:
    print(BANNER)
    print(f"PR #{pr['pr_number']}: {pr['title']}")
    print(f"Outcome: {pr['outcome'].upper()}")
    print(BANNER)

    with dottle.session(
        "codeguard-review-agent",
        user_id=pr["author"],
        user_email=pr["author_email"],
        tags=["code-review", pr["risk_level"] + "-risk", "pr"],
        agent_version="3.1.0",
        metadata={
            "pr_number": pr["pr_number"],
            "repo": pr["repo"],
            "pr_title": pr["title"],
        },
    ) as sid:
        print(f"  session: {sid}")

        # ── Step 1: Fetch PR metadata ─────────────────────────────────────────
        with dottle.span("tool", "fetch_pr_metadata") as s:
            time.sleep(0.04)
            s.set_attribute("pr_number", pr["pr_number"])
            s.set_attribute("files_changed", pr["files_changed"])
            s.set_attribute("lines_added", pr["lines_added"])
            s.set_attribute("lines_removed", pr["lines_removed"])
            s.set_attribute("base_branch", "main")
            s.set_attribute("merge_conflicts", False)

        # ── Step 2: Fetch diff ────────────────────────────────────────────────
        with dottle.span("tool", "fetch_git_diff") as s:
            time.sleep(0.06)
            s.set_attribute("pr_number", pr["pr_number"])
            s.set_attribute("diff_size_kb", pr["lines_added"] * 0.08)

        # ── Step 3: Run static analysis ───────────────────────────────────────
        with dottle.span("tool", "run_semgrep") as s:
            time.sleep(0.18)
            s.set_attribute("rules_applied", 247)
            s.set_attribute("issues_found", 2 if pr["outcome"] == "blocked" else 0)
            s.set_attribute("severity_critical", 1 if pr["outcome"] == "blocked" else 0)
            s.set_attribute("severity_medium", 1 if pr["outcome"] == "blocked" else 0)

        # ── Step 4: Dependency vulnerability scan ────────────────────────────
        with dottle.span("tool", "scan_dependencies") as s:
            time.sleep(0.10)
            s.set_attribute("packages_scanned", 84)
            s.set_attribute("vulnerabilities", 0)
            s.set_attribute("outdated_packages", 3)

        # ── Step 5: Check test coverage ───────────────────────────────────────
        with dottle.span("tool", "check_test_coverage") as s:
            time.sleep(0.07)
            s.set_attribute("coverage_before_pct", 76)
            s.set_attribute("coverage_after_pct", 79 if pr["outcome"] == "approved" else 71)
            s.set_attribute("new_code_coverage_pct", 84 if pr["outcome"] == "approved" else 55)

        # ── Step 6: AI security review ────────────────────────────────────────
        security_review = anthropic.messages.create(
            model="claude-opus-4-6",
            system="You are a senior security engineer performing a code review. Focus on: authentication/authorization flaws, injection vulnerabilities, data exposure, cryptographic weaknesses. Be specific about line numbers and attack vectors.",
            max_tokens=2048,
            messages=[{"role": "user", "content": f"Review PR #{pr['pr_number']}: '{pr['title']}'. The diff touches authentication middleware and JWT handling across {pr['files_changed']} files. Semgrep found {'2 issues including a critical auth bypass' if pr['outcome'] == 'blocked' else 'no issues'}. Provide detailed security assessment."}]
        )
        print(f"  Security: {security_review.content[0].text[:80]}...")

        # ── Step 7: AI performance review ────────────────────────────────────
        perf_review = anthropic.messages.create(
            model="claude-opus-4-6",
            system="You are a senior backend engineer focused on performance. Look for N+1 queries, missing indexes, inefficient algorithms, and scalability issues.",
            max_tokens=1024,
            messages=[{"role": "user", "content": f"Review PR #{pr['pr_number']} for performance issues. It changes {pr['files_changed']} files with {pr['lines_added']} additions. Focus on database query patterns and caching."}]
        )
        print(f"  Performance: {perf_review.content[0].text[:80]}...")

        # ── Step 8: Final verdict ─────────────────────────────────────────────
        verdict_resp = anthropic.messages.create(
            model="claude-opus-4-6",
            system="You are the tech lead making the final call on a PR. Be decisive. If there are security issues, block it. Format: VERDICT: [APPROVE/REQUEST_CHANGES/BLOCK]. Then list top 3 action items.",
            max_tokens=512,
            messages=[{"role": "user", "content": f"Based on security review ({'critical auth bypass found' if pr['outcome'] == 'blocked' else 'clean'}) and performance analysis ({'N+1 fixed' if pr['outcome'] == 'approved' else 'no issues'}), what is the final verdict for PR #{pr['pr_number']}?"}]
        )

        verdict = "BLOCK" if pr["outcome"] == "blocked" else "APPROVE"
        print(f"  Verdict: {verdict}")

        # ── Step 9: Post review to GitHub ─────────────────────────────────────
        with dottle.span("tool", "post_github_review") as s:
            time.sleep(0.05)
            s.set_attribute("pr_number", pr["pr_number"])
            s.set_attribute("review_state", "CHANGES_REQUESTED" if pr["outcome"] == "blocked" else "APPROVED")
            s.set_attribute("comments_posted", 3 if pr["outcome"] == "blocked" else 1)
            s.set_attribute("blocking", pr["outcome"] == "blocked")

        with dottle.span("tool", "update_pr_status_check") as s:
            time.sleep(0.03)
            s.set_attribute("check_name", "codeguard-ai-review")
            s.set_attribute("status", "failure" if pr["outcome"] == "blocked" else "success")

    print(f"  ✓ Review posted to GitHub\n")


print(BANNER)
print("Code review agent run complete.")
print("Open https://app.dottle.dev/sessions to see review sessions.")
print(BANNER)
