"""
Demo 11: AI DevOps & Platform Engineering Agent
=================================================
Industry: Platform Engineering / SRE / Cloud Infrastructure
Agent: AI DevOps agent handling deployments, incident response,
       infrastructure cost optimization, and CI/CD pipeline management.

Features demonstrated:
  ★ Deployment pipeline as span waterfall (build → test → canary → rollout)
  ★ Incident response: P1 alert, root cause, remediation, post-mortem
  ★ Infrastructure cost analysis with multi-cloud data
  ★ Auto-scaling event with real metrics (latency, error rate, concurrency)
  ★ Error: deployment rollback triggered (failed health checks)
  ★ Loop: agent waiting for pod readiness (readiness probe polling)
  ★ record_prompt() with realistic infra data and LLM runbooks
  ★ Ops-flavored tags: prod, staging, incident, sre, cost-opt

Run: python 11_ai_devops_agent.py
     Then open https://app.dottle.dev/sessions
"""

import sys, time, random
import _config
import dottle
from _mock_clients import MockOpenAI, MockAnthropic

BANNER = "=" * 60


# ── Deployment 1: Blue-Green Production Release ───────────────────────────────

print(BANNER)
print("Deployment 1: Blue-Green — v2.4.1 → production")
print("  Full pipeline with canary hold and traffic shift")
print(BANNER)

client = MockOpenAI("devops_deploy")
oai = dottle.wrap_openai(client)

deploys = [
    ("sre_alice",  "alice@platform.co",  "v2.4.1", "api-gateway",       "blue-green"),
    ("sre_bob",    "bob@platform.co",    "v2.0.0", "payment-service",   "rolling"),
    ("sre_carol",  "carol@platform.co",  "v1.9.3", "user-auth-service", "canary"),
]

for user_id, email, version, service, strategy in deploys:
    deploy_client = MockOpenAI("devops_deploy")
    deploy_oai = dottle.wrap_openai(deploy_client)

    with dottle.session(
        "ai-devops-agent",
        user_id=user_id,
        user_email=email,
        tags=["prod", "deployment", strategy, service, "v3.0"],
        agent_version="3.0.0",
    ) as sid:
        print(f"  [{strategy}] {service} {version}… session: {sid}")

        # Pipeline waterfall spans
        steps = [
            ("build_docker_image",    0.08, {"image": f"{service}:{version}", "size_mb": random.randint(180, 340), "cache_hit": True}),
            ("run_unit_tests",        0.12, {"tests_passed": random.randint(280, 490), "tests_failed": 0, "coverage_pct": round(random.uniform(81, 94), 1)}),
            ("run_integration_tests", 0.14, {"tests_passed": random.randint(42, 88), "tests_failed": 0, "db_migrations_dry_run": True}),
            ("sast_security_scan",    0.09, {"tool": "Snyk", "critical": 0, "high": 0, "medium": random.randint(0, 2)}),
            ("push_to_registry",      0.05, {"registry": "ECR", "digest": f"sha256:{random.randint(100000,999999):x}"}),
        ]

        for span_name, duration, attrs in steps:
            with dottle.span("tool", span_name) as s:
                time.sleep(duration)
                for k, v in attrs.items():
                    s.set_attribute(k, v)

        # LLM: deployment plan validation
        resp = deploy_oai.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are an AI deployment orchestrator. Validate deployment readiness, execute rollout strategy, monitor health metrics, and report status."},
                {"role": "user", "content": f"Deploy {service}:{version} to production using {strategy} strategy. All pre-deployment checks passed. Execute and report."},
            ]
        )

        with dottle.span("tool", "execute_rollout") as s:
            time.sleep(0.10)
            s.set_attribute("strategy", strategy)
            s.set_attribute("pods_updated", random.randint(4, 12))
            s.set_attribute("rollout_duration_s", random.randint(45, 180))
            s.set_attribute("zero_downtime", True)

        with dottle.span("tool", "validate_health_checks") as s:
            time.sleep(0.06)
            s.set_attribute("health_endpoint", f"/{service}/health")
            s.set_attribute("p99_latency_ms", random.randint(120, 165))
            s.set_attribute("error_rate_pct", round(random.uniform(0.001, 0.02), 3))
            s.set_attribute("all_pods_healthy", True)

        with dottle.span("tool", "notify_slack") as s:
            time.sleep(0.02)
            s.set_attribute("channel", "#deployments")
            s.set_attribute("message", f"✅ {service} {version} deployed successfully")

        print(f"    → {resp.choices[0].message.content[:80]}...")

    time.sleep(0.3)

print("  ✓ 3 deployment sessions created\n")


# ── Incident Response ─────────────────────────────────────────────────────────

print(BANNER)
print("Incident Response: P1 Alerts")
print("  Detection → root cause → remediation → post-mortem")
print(BANNER)

incidents = [
    ("sre_dave",  "dave@platform.co",  "P1", "payments-5xx-spike",       "cert_expiry",       "payment-processor-internal"),
    ("sre_eve",   "eve@platform.co",   "P2", "worker-heap-memory-high",   "log_buffer_flush",  "prod-worker-07"),
    ("sre_frank", "frank@platform.co", "P1", "api-latency-p95-breach",    "db_connection_pool","rds-primary"),
]

for user_id, email, severity, alert_name, root_cause, component in incidents:
    incident_client = MockOpenAI("devops_incident") if severity == "P2" else MockAnthropic("devops_incident")

    with dottle.session(
        "ai-devops-agent",
        user_id=user_id,
        user_email=email,
        tags=["prod", "incident", severity.lower(), "sre", "v3.0"],
        agent_version="3.0.0",
    ) as sid:
        print(f"  [{severity}] {alert_name}… session: {sid}")

        with dottle.span("tool", "receive_pagerduty_alert") as s:
            time.sleep(0.03)
            s.set_attribute("alert_name", alert_name)
            s.set_attribute("severity", severity)
            s.set_attribute("component", component)
            s.set_attribute("triggered_at", "2026-05-17T14:32:00Z")

        with dottle.span("tool", "query_metrics_backend") as s:
            time.sleep(0.07)
            s.set_attribute("source", "Datadog")
            s.set_attribute("error_rate_pct", round(random.uniform(8, 40), 1) if severity == "P1" else round(random.uniform(0.5, 5), 1))
            s.set_attribute("affected_users_est", random.randint(200, 2500))
            s.set_attribute("dashboards_checked", 3)

        with dottle.span("tool", "fetch_recent_logs") as s:
            time.sleep(0.06)
            s.set_attribute("log_lines_analyzed", random.randint(2000, 8000))
            s.set_attribute("error_pattern_found", True)
            s.set_attribute("root_cause_hint", root_cause)

        if severity == "P2":
            resp_obj = incident_client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": "You are a senior SRE AI handling incident response. Analyze metrics and logs, identify root cause, apply remediation, and prepare post-mortem summary."},
                    {"role": "user", "content": f"Incident: {alert_name} on {component}. Root cause hint: {root_cause}. Analyze and remediate."},
                ]
            )
            response_text = resp_obj.choices[0].message.content
        else:
            resp_obj = incident_client.messages.create(
                model="claude-sonnet-4-6",
                system="You are a senior SRE AI handling critical incidents. Analyze root cause, apply immediate remediation, assess blast radius, and generate post-mortem timeline.",
                messages=[{"role": "user", "content": f"P1 incident: {alert_name} on {component}. Root cause hint: {root_cause}. Provide full incident analysis and remediation."}],
                max_tokens=700,
            )
            response_text = resp_obj.content[0].text

        with dottle.span("tool", "apply_remediation") as s:
            time.sleep(0.08)
            s.set_attribute("action", root_cause.replace("_", " ").title())
            s.set_attribute("success", True)
            s.set_attribute("time_to_mitigate_min", random.randint(8, 28))

        with dottle.span("tool", "validate_recovery") as s:
            time.sleep(0.05)
            s.set_attribute("error_rate_pct_post", round(random.uniform(0.01, 0.04), 3))
            s.set_attribute("all_services_green", True)

        with dottle.span("tool", "create_postmortem_ticket") as s:
            time.sleep(0.03)
            s.set_attribute("ticket_id", f"INC-2026-{random.randint(400,499)}")
            s.set_attribute("postmortem_scheduled", True)
            s.set_attribute("stakeholders_notified", True)

        print(f"    → {response_text[:80]}...")

    time.sleep(0.3)

print("  ✓ 3 incident response sessions created\n")


# ── Infrastructure Cost Optimization ─────────────────────────────────────────

print(BANNER)
print("Infrastructure Cost Optimization")
print("  Multi-cloud spend analysis + savings recommendations")
print(BANNER)

cost_cases = [
    ("finops_grace", "grace@platform.co", "monthly_cost_report",        ["prod", "finops", "aws"]),
    ("finops_henry", "henry@platform.co", "k8s_rightsizing_analysis",   ["prod", "finops", "kubernetes"]),
    ("finops_iris",  "iris@platform.co",  "ci_pipeline_cost_breakdown",  ["prod", "finops", "ci-cd"]),
]

for user_id, email, analysis_type, tags in cost_cases:
    cost_client = MockOpenAI("devops_infra") if "finops" in user_id else MockOpenAI("devops_ci")
    cost_oai = dottle.wrap_openai(cost_client)

    with dottle.session(
        "ai-devops-agent",
        user_id=user_id,
        user_email=email,
        tags=tags + ["cost-optimization", "v3.0"],
        agent_version="3.0.0",
    ) as sid:
        print(f"  [{analysis_type}]… session: {sid}")

        with dottle.span("tool", "fetch_cloud_billing_data") as s:
            time.sleep(0.07)
            s.set_attribute("provider", "AWS" if "aws" in tags else "GCP")
            s.set_attribute("period", "2026-05")
            s.set_attribute("total_spend_usd", random.randint(28000, 52000))
            s.set_attribute("line_items_analyzed", random.randint(240, 890))

        with dottle.span("tool", "run_utilization_analysis") as s:
            time.sleep(0.08)
            s.set_attribute("resources_scanned", random.randint(180, 640))
            s.set_attribute("underutilized_pct", round(random.uniform(18, 34), 1))
            s.set_attribute("savings_opportunities", random.randint(4, 12))

        resp = cost_oai.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are a FinOps AI analyst. Analyze cloud spend, identify waste, and recommend specific cost optimizations with projected savings."},
                {"role": "user", "content": f"Analyze {analysis_type}. Identify top cost drivers, underutilized resources, and recommend savings actions with specific dollar amounts."},
            ]
        )

        with dottle.span("llm", "gpt-4o: cost optimization report") as s:
            time.sleep(0.16)
            s.record_tokens(random.randint(820, 1640), random.randint(280, 440), "gpt-4o")
            s.set_attribute("recommendations_generated", random.randint(4, 9))
            s.set_attribute("projected_savings_usd_monthly", random.randint(3200, 9800))

        with dottle.span("tool", "create_jira_tickets") as s:
            time.sleep(0.04)
            s.set_attribute("tickets_created", random.randint(3, 7))
            s.set_attribute("assignee", "platform-team")

        print(f"    → {resp.choices[0].message.content[:80]}...")

    time.sleep(0.3)

print("  ✓ 3 cost optimization sessions created\n")


# ── Pod Readiness Loop ────────────────────────────────────────────────────────

print(BANNER)
print("Deployment: Pod Readiness Polling [LOOP SCENARIO]")
print("  Agent waits for pods to become ready after new deploy")
print(BANNER)

with dottle.session(
    "ai-devops-agent",
    user_id="sre_loop",
    user_email="ops@platform.co",
    tags=["prod", "deployment", "rolling", "readiness", "v3.0"],
    agent_version="3.0.0",
) as sid:
    print(f"  session: {sid}")

    with dottle.span("tool", "trigger_rolling_update") as s:
        time.sleep(0.05)
        s.set_attribute("service", "ml-inference-service")
        s.set_attribute("replicas", 8)
        s.set_attribute("new_image", "ml-inference:v3.1.0")

    for attempt in range(1, 9):
        with dottle.span("tool", "check_pod_readiness") as s:
            time.sleep(0.08)
            pods_ready = min(attempt * 1, 8)
            s.set_attribute("attempt", attempt)
            s.set_attribute("pods_ready", pods_ready)
            s.set_attribute("pods_total", 8)
            s.set_attribute("all_ready", pods_ready >= 8)

        if pods_ready >= 8:
            with dottle.span("tool", "complete_deployment") as s:
                time.sleep(0.04)
                s.set_attribute("deployment_complete", True)
                s.set_attribute("total_wait_s", attempt * 8)
            break

        time.sleep(0.12)

    print(f"  All pods ready after {attempt} readiness checks (loop visible in dashboard)\n")


# ── Deployment Rollback (Error) ───────────────────────────────────────────────

print(BANNER)
print("Deployment: Rollback Triggered — Failed Health Checks [ERROR]")
print(BANNER)

try:
    with dottle.session(
        "ai-devops-agent",
        user_id="sre_dave",
        user_email="dave@platform.co",
        tags=["prod", "deployment", "rollback", "v3.0"],
        agent_version="3.0.0",
    ) as sid:
        print(f"  session: {sid}")

        with dottle.span("tool", "start_deployment") as s:
            time.sleep(0.05)
            s.set_attribute("service", "recommendation-engine")
            s.set_attribute("version", "v4.0.0-beta.1")
            s.set_attribute("strategy", "rolling")

        with dottle.span("tool", "run_smoke_tests") as s:
            time.sleep(0.07)
            s.set_attribute("smoke_tests_passed", 14)
            s.set_attribute("smoke_tests_failed", 0)

        with dottle.span("tool", "monitor_canary_metrics") as s:
            time.sleep(0.09)
            s.set_attribute("canary_traffic_pct", 10)
            s.set_attribute("canary_error_rate_pct", 8.4)
            s.set_attribute("threshold_pct", 1.0)
            s.set_attribute("threshold_exceeded", True)
            # Critical: error rate too high during canary
            raise RuntimeError(
                "Canary error rate 8.4% exceeds threshold 1.0% — "
                "recommendation-engine:v4.0.0-beta.1 has OOM errors on GPU nodes. "
                "Triggering automatic rollback to v3.9.2."
            )

except RuntimeError:
    pass

print("  ✓ Rollback triggered — failed session captured with error span\n")


# ── Summary ───────────────────────────────────────────────────────────────────

print(BANNER)
print("Demo 11 complete — AI DevOps & Platform Engineering Agent")
print()
print("Sessions created:")
print("  3 × Production deployments   (blue-green, rolling, canary strategies)")
print("  3 × Incident response        (P1 TLS expiry, P2 memory, P1 DB pool)")
print("  3 × Cost optimization        (AWS spend, k8s rightsizing, CI/CD cost)")
print("  1 × Pod readiness loop       (8 readiness polls, loop badge)")
print("  1 × Deployment rollback      (failed session, canary health check error)")
print()
print("Tags to filter by:")
print("  incident · sre · deployment · canary · rollback · finops · cost-optimization")
print(BANNER)
