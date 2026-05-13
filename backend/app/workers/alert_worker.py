"""
APScheduler background worker — evaluates alert rules every 60 seconds.
Started/stopped inside FastAPI lifespan.
"""
import asyncio
import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.database import AsyncSessionLocal
from app.services.alert_service import evaluate_all_rules
from app.services.semantic_monitor_service import evaluate_all_monitors

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


async def _run_alert_check():
    try:
        async with AsyncSessionLocal() as db:
            await evaluate_all_rules(db)
    except Exception as exc:
        logger.error(f"Alert worker error: {exc}")


async def _run_monitor_check():
    try:
        async with AsyncSessionLocal() as db:
            await evaluate_all_monitors(db)
    except Exception as exc:
        logger.error(f"Semantic monitor worker error: {exc}")


def start_alert_worker(interval_seconds: int = 60):
    from app.workers.stale_session_reaper import start_reaper
    scheduler.add_job(
        _run_alert_check,
        trigger="interval",
        seconds=interval_seconds,
        id="alert_evaluator",
        replace_existing=True,
        max_instances=1,
    )
    # Semantic monitors run every 5 minutes
    scheduler.add_job(
        _run_monitor_check,
        trigger="interval",
        seconds=300,
        id="semantic_monitor_evaluator",
        replace_existing=True,
        max_instances=1,
    )
    start_reaper(scheduler)
    scheduler.start()
    logger.info(f"Alert worker started (interval={interval_seconds}s)")


def stop_alert_worker():
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Alert worker stopped")
