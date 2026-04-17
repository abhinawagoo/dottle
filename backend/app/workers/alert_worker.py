"""
APScheduler background worker — evaluates alert rules every 60 seconds.
Started/stopped inside FastAPI lifespan.
"""
import asyncio
import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.database import AsyncSessionLocal
from app.services.alert_service import evaluate_all_rules

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


async def _run_alert_check():
    try:
        async with AsyncSessionLocal() as db:
            await evaluate_all_rules(db)
    except Exception as exc:
        logger.error(f"Alert worker error: {exc}")


def start_alert_worker(interval_seconds: int = 60):
    scheduler.add_job(
        _run_alert_check,
        trigger="interval",
        seconds=interval_seconds,
        id="alert_evaluator",
        replace_existing=True,
        max_instances=1,
    )
    scheduler.start()
    logger.info(f"Alert worker started (interval={interval_seconds}s)")


def stop_alert_worker():
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Alert worker stopped")
