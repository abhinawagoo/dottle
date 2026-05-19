"""
ARQ Redis pool — shared singleton for the web process.

The web process only enqueues jobs here; the worker process executes them.

Usage:
    from app.arq_pool import enqueue

    await enqueue("task_score_session", session_id=str(sid), ...)
"""
from __future__ import annotations

import logging
from typing import Any

from arq import create_pool
from arq.connections import ArqRedis, RedisSettings

from app.config import get_settings

logger = logging.getLogger(__name__)

_pool: ArqRedis | None = None


async def get_arq_pool() -> ArqRedis:
    """Return (or lazily create) the shared ArqRedis connection pool."""
    global _pool
    if _pool is None:
        settings = get_settings()
        _pool = await create_pool(
            RedisSettings.from_dsn(settings.redis_url),
        )
    return _pool


async def close_arq_pool() -> None:
    """Close the pool on shutdown."""
    global _pool
    if _pool is not None:
        await _pool.aclose()
        _pool = None


async def enqueue(job_name: str, **kwargs: Any) -> None:
    """
    Enqueue a job by name.  Never raises — logs on failure so ingest never breaks.
    """
    try:
        pool = await get_arq_pool()
        await pool.enqueue_job(job_name, **kwargs)
    except Exception as exc:
        logger.error("arq_enqueue_failed job=%s err=%s", job_name, exc)
