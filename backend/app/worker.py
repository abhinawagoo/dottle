"""
ARQ worker — all background tasks execute here, isolated from the web process.

Start the worker:
    arq app.worker.WorkerSettings

The web process only enqueues via app.arq_pool.enqueue().
This module is never imported by the web process.

Scheduled jobs (cron):
  task_alert_check        — every 60 s  (replaces APScheduler alert_evaluator)
  task_monitor_check      — every 5 min (replaces APScheduler semantic_monitor_evaluator)
  task_reap_stale_sessions— every 5 min (replaces APScheduler stale_session_reaper)

One-shot jobs (enqueued by web process):
  task_score_session       — auto quality scoring after session/end
  task_trigger_evals       — run all active LLM eval configs for a session
  task_invalidate_caches   — clear sessions_list + metrics Redis caches
  task_run_eval_for_session— manual single eval trigger
  task_run_experiment      — A/B experiment run
  task_execute_dataset_run — dataset evaluation run
  task_run_code_fix        — AI coding agent fix job
"""
import logging
import uuid

import structlog
from arq import cron
from arq.connections import RedisSettings

from app.config import get_settings

settings = get_settings()
logger = structlog.get_logger()


# ── Startup / shutdown ─────────────────────────────────────────────────────────

async def startup(ctx: dict) -> None:
    logger.info("arq_worker_started")


async def shutdown(ctx: dict) -> None:
    logger.info("arq_worker_stopped")


# ── One-shot tasks ─────────────────────────────────────────────────────────────

async def task_score_session(
    ctx: dict,
    *,
    session_id: str,
    project_id: str,
    org_id: str,
    agent_name: str,
    status: str,
    duration_ms: int | None,
    total_tokens: int | None,
    iteration_count: int,
    loop_detected: bool,
    error_message: str | None,
    spans: list[dict],
) -> None:
    """Auto quality scoring for a completed session."""
    from app.database import AsyncSessionLocal
    from app.services.auto_quality import score_session

    async with AsyncSessionLocal() as db:
        await score_session(
            session_id=uuid.UUID(session_id),
            project_id=uuid.UUID(project_id),
            org_id=uuid.UUID(org_id),
            agent_name=agent_name,
            status=status,
            duration_ms=duration_ms,
            total_tokens=total_tokens,
            iteration_count=iteration_count,
            loop_detected=loop_detected,
            error_message=error_message,
            spans=spans,
            db=db,
        )


async def task_trigger_evals(
    ctx: dict,
    *,
    session_id: str,
    project_id: str,
) -> None:
    """Run all active LLM evaluator configs for a completed session."""
    from app.routers.evals import _run_evals_for_session
    await _run_evals_for_session(session_id=session_id, project_id=project_id)


async def task_invalidate_caches(
    ctx: dict,
    *,
    project_id: str,
) -> None:
    """Invalidate sessions-list and metrics caches for a project."""
    from app.services.cache import cache_delete_pattern
    await cache_delete_pattern(f"sessions_list:{project_id}:*")
    await cache_delete_pattern(f"metrics:{project_id}:*")


async def task_run_eval_for_session(
    ctx: dict,
    *,
    config_id: str,
    session_id: str,
) -> None:
    """Run a single eval config against a session (manual trigger)."""
    from app.routers.evals import _run_eval_for_session
    await _run_eval_for_session(config_id=config_id, session_id=session_id)


async def task_run_experiment(
    ctx: dict,
    *,
    experiment_id: str,
    project_id: str,
) -> None:
    """Run an A/B experiment against its dataset."""
    from app.routers.experiments import _run_experiment
    await _run_experiment(experiment_id=experiment_id, project_id=project_id)


async def task_execute_dataset_run(
    ctx: dict,
    *,
    run_id: str,
    eval_criteria: str | None,
) -> None:
    """Execute a dataset evaluation run (LLM-as-judge over all items)."""
    from app.routers.datasets import _execute_dataset_run
    await _execute_dataset_run(run_id=run_id, eval_criteria=eval_criteria)


async def task_run_code_fix(
    ctx: dict,
    *,
    job_id: str,
) -> None:
    """Run the AI coding agent for an issue fix job."""
    from app.database import AsyncSessionLocal
    from app.services.coding_agent import run_coding_agent

    async with AsyncSessionLocal() as db:
        await run_coding_agent(job_id=job_id, db=db)


# ── Scheduled / cron tasks ─────────────────────────────────────────────────────

async def task_alert_check(ctx: dict) -> None:
    """Evaluate all enabled alert rules (runs every 60 s)."""
    from app.database import AsyncSessionLocal
    from app.services.alert_service import evaluate_all_rules

    try:
        async with AsyncSessionLocal() as db:
            await evaluate_all_rules(db)
    except Exception as exc:
        logger.error("alert_check_failed", error=str(exc))


async def task_monitor_check(ctx: dict) -> None:
    """Evaluate all semantic monitors (runs every 5 min)."""
    from app.database import AsyncSessionLocal
    from app.services.semantic_monitor_service import evaluate_all_monitors

    try:
        async with AsyncSessionLocal() as db:
            await evaluate_all_monitors(db)
    except Exception as exc:
        logger.error("monitor_check_failed", error=str(exc))


async def task_reap_stale_sessions(ctx: dict) -> None:
    """Mark sessions stuck in 'running' as timed_out (runs every 5 min)."""
    from app.workers.stale_session_reaper import reap_stale_sessions

    try:
        count = await reap_stale_sessions()
        if count:
            logger.info("stale_sessions_reaped", count=count)
    except Exception as exc:
        logger.error("stale_session_reaper_failed", error=str(exc))


# ── Worker settings ────────────────────────────────────────────────────────────

class WorkerSettings:
    """
    ARQ WorkerSettings — passed to `arq app.worker.WorkerSettings`.
    Cron schedules match the previous APScheduler intervals exactly.
    """

    functions = [
        task_score_session,
        task_trigger_evals,
        task_invalidate_caches,
        task_run_eval_for_session,
        task_run_experiment,
        task_execute_dataset_run,
        task_run_code_fix,
        # Cron tasks are also registered here so they can be called on-demand
        task_alert_check,
        task_monitor_check,
        task_reap_stale_sessions,
    ]

    cron_jobs = [
        # Every 60 seconds — matches alert_poll_interval_seconds=60
        cron(task_alert_check, second=0),

        # Every 5 minutes — matches the old 300 s APScheduler intervals
        cron(
            task_monitor_check,
            minute={0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55},
            second=0,
        ),
        cron(
            task_reap_stale_sessions,
            minute={0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55},
            second=0,
        ),
    ]

    redis_settings = RedisSettings.from_dsn(settings.redis_url)

    # Worker concurrency + timeouts
    max_jobs = 20
    job_timeout = 600          # 10 min hard limit per job
    keep_result = 3600         # keep job result in Redis for 1 hour
    keep_result_forever = False
    max_tries = 1              # no retries — tasks are not idempotent by default

    on_startup = startup
    on_shutdown = shutdown
