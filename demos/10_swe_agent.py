"""
Demo 10: Software Engineering (SWE) Agent
==========================================
Industry: Developer Tools / Engineering Platform
Agent: AI SWE agent handling code review, bug reproduction,
       feature implementation, and test generation.

Features demonstrated:
  ★ record_prompt() with real code snippets in input/output
  ★ record_tokens() showing diff between PR sizes
  ★ Multi-turn: initial review → inline comments → final verdict
  ★ Error: flaky test loop (agent retrying CI with same fix)
  ★ Tool spans: GitHub API, AST parser, test runner, build system
  ★ Mixed quality: excellent PRs (high scores) vs rejected PRs (low scores)
  ★ High token counts → cost visibility in metrics

Run: python 10_swe_agent.py
     Then open https://app.dottle.dev/sessions
"""

import sys, time, random
import _config
import dottle
from _mock_clients import MockOpenAI, MockAnthropic

BANNER = "=" * 60


# ── PR Review 1: Security vulnerability (GPT-4o) ─────────────────────────────

print(BANNER)
print("PR #4421 — Auth service refactor [SECURITY ISSUE]")
print(BANNER)

client = MockOpenAI("swe_review")
oai = dottle.wrap_openai(client)

with dottle.session(
    "swe-copilot-agent",
    user_id="eng_alice",
    user_email="alice@devco.com",
    tags=["prod", "code-review", "security", "python", "v2.0"],
    agent_version="2.0.0",
) as sid:
    print(f"  session: {sid}")

    with dottle.span("tool", "fetch_pull_request") as s:
        time.sleep(0.05)
        s.set_attribute("pr_number", 4421)
        s.set_attribute("repo", "devco/backend-api")
        s.set_attribute("files_changed", 12)
        s.set_attribute("lines_added", 634)
        s.set_attribute("lines_removed", 213)
        s.set_attribute("base_branch", "main")

    with dottle.span("tool", "run_static_analysis") as s:
        time.sleep(0.08)
        s.set_attribute("tool", "semgrep")
        s.set_attribute("rules_applied", 847)
        s.set_attribute("findings_critical", 1)
        s.set_attribute("findings_high", 2)
        s.set_attribute("findings_medium", 3)

    with dottle.span("tool", "parse_ast_diff") as s:
        time.sleep(0.06)
        s.set_attribute("functions_changed", 8)
        s.set_attribute("complexity_delta", "+12")
        s.set_attribute("new_dependencies", 0)

    resp = oai.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "You are an expert software engineer performing code review. Focus on security, correctness, performance, and maintainability. Be specific with line numbers."},
            {"role": "user", "content": "Review PR #4421: auth service refactor. Semgrep found 1 critical (SQL injection, user_service.py:89), 2 high findings. 847 lines changed. Provide detailed review with verdict."},
        ]
    )

    with dottle.span("llm", "gpt-4o: generate inline comments") as s:
        time.sleep(0.18)
        s.record_tokens(1840, 420, "gpt-4o")
        s.record_prompt(
            input_text="PR diff: user_service.py:89 — query = f\"SELECT * FROM users WHERE id = {user_id}\" — unsanitized parameter. JWT decode at auth_middleware.py:156 missing aud claim verification.",
            output_text="CRITICAL: SQL injection at line 89. Use parameterized queries: cursor.execute('SELECT * FROM users WHERE id = %s', (user_id,)). HIGH: JWT missing aud verification — adds options={'verify_aud': True}."
        )
        s.set_attribute("comments_posted", 7)
        s.set_attribute("verdict", "request_changes")

    with dottle.span("tool", "post_review_to_github") as s:
        time.sleep(0.04)
        s.set_attribute("pr_number", 4421)
        s.set_attribute("review_state", "REQUEST_CHANGES")
        s.set_attribute("comments_count", 7)

    print(f"  Review: {resp.choices[0].message.content[:80]}...")

print("  ✓ Security review posted\n")


# ── PR Review 2: Clean PR (Claude, excellent session) ────────────────────────

print(BANNER)
print("PR #4438 — Dependency upgrade React 18→19 [CLEAN APPROVE]")
print(BANNER)

claude_client = MockAnthropic("swe_review")
claude = dottle.wrap_anthropic(claude_client)

with dottle.session(
    "swe-copilot-agent",
    user_id="eng_bob",
    user_email="bob@devco.com",
    tags=["prod", "code-review", "frontend", "typescript", "v2.0"],
    agent_version="2.0.0",
) as sid:
    print(f"  session: {sid}")

    with dottle.span("tool", "fetch_pull_request") as s:
        time.sleep(0.04)
        s.set_attribute("pr_number", 4438)
        s.set_attribute("repo", "devco/frontend")
        s.set_attribute("files_changed", 31)
        s.set_attribute("lines_added", 847)
        s.set_attribute("lines_removed", 712)

    with dottle.span("tool", "run_test_suite") as s:
        time.sleep(0.10)
        s.set_attribute("tests_total", 847)
        s.set_attribute("tests_passed", 847)
        s.set_attribute("tests_failed", 0)
        s.set_attribute("coverage_pct", 84.2)

    with dottle.span("tool", "analyze_bundle_size") as s:
        time.sleep(0.05)
        s.set_attribute("bundle_before_kb", 412)
        s.set_attribute("bundle_after_kb", 400)
        s.set_attribute("delta_kb", -12)

    resp = claude.messages.create(
        model="claude-sonnet-4-6",
        system="You are a senior frontend engineer reviewing a major framework upgrade. Check for breaking changes, performance implications, and test coverage.",
        messages=[
            {"role": "user", "content": "Review PR #4438: React 18→19 + Next.js 14→15 upgrade. All 847 tests pass, bundle -12KB. Semgrep clean. Provide review verdict."},
        ],
        max_tokens=600,
    )

    with dottle.span("tool", "post_review_to_github") as s:
        time.sleep(0.03)
        s.set_attribute("pr_number", 4438)
        s.set_attribute("review_state", "APPROVED")
        s.set_attribute("comments_count", 2)

    print(f"  Review: {resp.content[0].text[:80]}...")

print("  ✓ PR approved\n")


# ── Bug Investigation ─────────────────────────────────────────────────────────

print(BANNER)
print("Bug: Race condition in job queue processor [INVESTIGATION]")
print(BANNER)

client = MockOpenAI("swe_debug")
oai = dottle.wrap_openai(client)

bug_cases = [
    ("eng_carol",  "carol@devco.com",  "Race condition — job queue duplicate processing", "python", "queue_service.py"),
    ("eng_david",  "david@devco.com",  "Memory leak in WebSocket handler after 24h uptime", "typescript", "ws-handler.ts"),
    ("eng_eve",    "eve@devco.com",    "Flaky test TestPaymentService.test_charge_timeout", "python", "test_payment.py"),
]

for user_id, email, bug_title, language, file_name in bug_cases:
    bug_client = MockOpenAI("swe_debug")
    bug_oai = dottle.wrap_openai(bug_client)

    with dottle.session(
        "swe-copilot-agent",
        user_id=user_id,
        user_email=email,
        tags=["prod", "bug-investigation", language, "v2.0"],
        agent_version="2.0.0",
    ) as sid:
        print(f"  {bug_title[:55]}… session: {sid}")

        with dottle.span("tool", "fetch_error_logs") as s:
            time.sleep(0.05)
            s.set_attribute("log_source", "Datadog")
            s.set_attribute("occurrences_24h", random.randint(12, 284))
            s.set_attribute("first_seen", "2026-05-14T03:21:00Z")
            s.set_attribute("affected_users", random.randint(3, 120))

        with dottle.span("tool", "reproduce_locally") as s:
            time.sleep(0.07)
            s.set_attribute("reproduced", True)
            s.set_attribute("reproduction_steps", 3)
            s.set_attribute("environment", "docker-compose")

        with dottle.span("tool", "run_profiler") as s:
            time.sleep(0.06)
            s.set_attribute("profiler", "py-spy" if language == "python" else "clinic.js")
            s.set_attribute("hotspot_identified", True)
            s.set_attribute("file", file_name)

        resp = bug_oai.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are a senior SWE debugging agent. Analyze error logs, profiler output, and code to identify root cause. Provide specific, actionable fix."},
                {"role": "user", "content": f"Debug: {bug_title}. File: {file_name}. Profiler identified hotspot. Provide root cause and fix."},
            ]
        )

        with dottle.span("llm", "gpt-4o: root cause analysis") as s:
            time.sleep(0.14)
            s.record_tokens(random.randint(680, 1240), random.randint(180, 340), "gpt-4o")
            s.set_attribute("root_cause_identified", True)
            s.set_attribute("fix_complexity", random.choice(["low", "medium"]))

        with dottle.span("tool", "open_github_issue") as s:
            time.sleep(0.03)
            s.set_attribute("issue_number", random.randint(2200, 2299))
            s.set_attribute("priority", "P1")
            s.set_attribute("fix_branch_created", True)

        print(f"    → {resp.choices[0].message.content[:80]}...")

    time.sleep(0.3)

print("  ✓ 3 bug investigation sessions created\n")


# ── Feature Implementation ────────────────────────────────────────────────────

print(BANNER)
print("Feature Implementation: Rate Limiter + Webhook Retry")
print(BANNER)

features = [
    ("eng_frank", "frank@devco.com", "Distributed rate limiting middleware (Redis token bucket)", "rate-limiter"),
    ("eng_grace", "grace@devco.com", "Webhook retry with exponential backoff + dead-letter queue",  "webhooks"),
]

for user_id, email, feature, tag in features:
    impl_client = MockAnthropic("swe_review")  # uses the richer Anthropic responses
    impl_claude = dottle.wrap_anthropic(impl_client)

    with dottle.session(
        "swe-copilot-agent",
        user_id=user_id,
        user_email=email,
        tags=["prod", "implementation", tag, "v2.0"],
        agent_version="2.0.0",
    ) as sid:
        print(f"  {feature[:55]}… session: {sid}")

        with dottle.span("tool", "fetch_design_doc") as s:
            time.sleep(0.04)
            s.set_attribute("doc_id", f"RFC-{random.randint(100,199)}")
            s.set_attribute("requirements_count", random.randint(8, 15))

        with dottle.span("tool", "scaffold_module") as s:
            time.sleep(0.05)
            s.set_attribute("files_created", random.randint(3, 7))
            s.set_attribute("test_files_created", random.randint(1, 3))

        resp = impl_claude.messages.create(
            model="claude-sonnet-4-6",
            system="You are an expert software architect and implementer. Design and implement production-grade features following best practices. Include error handling, tests, and documentation.",
            messages=[
                {"role": "user", "content": f"Implement: {feature}. Provide complete implementation with code, edge cases handled, and test plan."},
            ],
            max_tokens=800,
        )

        with dottle.span("llm", "claude-sonnet: generate implementation") as s:
            time.sleep(0.22)
            s.record_tokens(random.randint(1400, 2200), random.randint(580, 820), "claude-sonnet-4-6")
            s.set_attribute("files_generated", random.randint(4, 8))
            s.set_attribute("test_coverage_pct", round(random.uniform(88, 96), 1))

        with dottle.span("tool", "run_linter_and_tests") as s:
            time.sleep(0.08)
            s.set_attribute("lint_errors", 0)
            s.set_attribute("tests_written", random.randint(14, 31))
            s.set_attribute("tests_passing", True)
            s.set_attribute("coverage_pct", round(random.uniform(88, 96), 1))

        with dottle.span("tool", "create_pull_request") as s:
            time.sleep(0.04)
            s.set_attribute("pr_number", random.randint(4450, 4499))
            s.set_attribute("reviewers_requested", 2)

        print(f"    → {resp.content[0].text[:80]}...")

    time.sleep(0.3)

print("  ✓ 2 feature implementation sessions created\n")


# ── Flaky Test Loop ───────────────────────────────────────────────────────────

print(BANNER)
print("CI: Flaky Test Loop [LOOP SCENARIO]")
print("  Agent keeps re-running the same fix for a time-dependent test")
print(BANNER)

loop_client = MockOpenAI("swe_debug")
loop_oai = dottle.wrap_openai(loop_client)

with dottle.session(
    "swe-copilot-agent",
    user_id="ci_bot",
    user_email="ci@devco.com",
    tags=["prod", "ci", "flaky-test", "debug", "v2.0"],
    agent_version="2.0.0",
) as sid:
    print(f"  session: {sid}")

    for attempt in range(1, 7):
        with dottle.span("tool", "run_failing_test") as s:
            time.sleep(0.07)
            s.set_attribute("test", "TestPaymentService.test_charge_timeout")
            s.set_attribute("attempt", attempt)
            s.set_attribute("exit_code", 0 if attempt >= 6 else 1)
            s.set_attribute("failure_reason", "AssertionError: timeout fired in 0.08s, expected 0.1s" if attempt < 6 else "")

        if attempt >= 6:
            with dottle.span("tool", "mark_test_fixed") as s:
                time.sleep(0.03)
                s.set_attribute("fix_applied", "freezegun_mock")
                s.set_attribute("ci_green", True)
            break

        with dottle.span("llm", "gpt-4o: diagnose test failure") as s:
            time.sleep(0.13)
            s.record_tokens(340 + attempt * 40, 95, "gpt-4o")
            s.set_attribute("attempt", attempt)
            s.set_attribute("fix_applied", f"increase_sleep_{attempt}")

        time.sleep(0.1)

    print(f"  Resolved after {attempt} attempts (loop badge visible in sessions list)\n")


# ── Build Failure (Error session) ─────────────────────────────────────────────

print(BANNER)
print("CI: Build failure — missing environment variable [ERROR]")
print(BANNER)

try:
    with dottle.session(
        "swe-copilot-agent",
        user_id="ci_bot",
        user_email="ci@devco.com",
        tags=["prod", "ci", "build-failure", "v2.0"],
        agent_version="2.0.0",
    ) as sid:
        print(f"  session: {sid}")

        with dottle.span("tool", "checkout_branch") as s:
            time.sleep(0.04)
            s.set_attribute("branch", "feature/oauth-refresh")
            s.set_attribute("commit", "a3f91bc")

        with dottle.span("tool", "install_dependencies") as s:
            time.sleep(0.06)
            s.set_attribute("package_manager", "pip")
            s.set_attribute("packages_installed", 142)

        with dottle.span("tool", "run_build") as s:
            time.sleep(0.05)
            raise EnvironmentError("Build failed: OAUTH_CLIENT_SECRET not set in CI environment. Required by oauth_config.py:31. Add to GitHub Actions secrets.")

except EnvironmentError:
    pass

print("  ✓ Build failure captured — session marked failed\n")


# ── Summary ───────────────────────────────────────────────────────────────────

print(BANNER)
print("Demo 10 complete — SWE Agent")
print()
print("Sessions created:")
print("  2 × PR code review          (security reject + clean approve)")
print("  3 × Bug investigation       (race condition, memory leak, flaky test)")
print("  2 × Feature implementation  (rate limiter, webhooks)")
print("  1 × Flaky test loop         (loop badge visible)")
print("  1 × Build failure           (failed session, error captured)")
print()
print("Cost analysis: token counts vary widely by PR size — see Metrics → Cost")
print(BANNER)
