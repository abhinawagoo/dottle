"""
Redis cache service
===================
Thin async wrapper around redis.asyncio.

Usage:
    from app.services.cache import cache_get, cache_set, cache_delete_pattern

    # Read
    value = await cache_get("my_key")           # None if miss
    # Write (TTL in seconds)
    await cache_set("my_key", data, ttl=60)
    # Invalidate
    await cache_delete_pattern("sessions_list:proj-123:*")

All values are JSON-serialised so any dict/list/scalar is safe to cache.
Connection is a lazy singleton — first call creates it, subsequent calls reuse.
"""
from __future__ import annotations

import json
import logging
from typing import Any

import redis.asyncio as aioredis

from app.config import get_settings

logger = logging.getLogger(__name__)

_redis: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    """Return (or lazily create) the shared async Redis client."""
    global _redis
    if _redis is None:
        settings = get_settings()
        _redis = aioredis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=2,
            retry_on_timeout=False,
        )
    return _redis


# ── Public helpers ─────────────────────────────────────────────────────────────

async def cache_get(key: str) -> Any | None:
    """Return the deserialised value for *key*, or None on miss / error."""
    try:
        r = await get_redis()
        raw = await r.get(key)
        if raw is None:
            return None
        return json.loads(raw)
    except Exception as exc:
        logger.debug("cache_get miss/error key=%s err=%s", key, exc)
        return None


async def cache_set(key: str, value: Any, ttl: int = 30) -> None:
    """Serialise *value* to JSON and store with *ttl* seconds expiry."""
    try:
        r = await get_redis()
        await r.set(key, json.dumps(value, default=str), ex=ttl)
    except Exception as exc:
        logger.debug("cache_set error key=%s err=%s", key, exc)


async def cache_delete(key: str) -> None:
    """Delete a single key (best-effort, never raises)."""
    try:
        r = await get_redis()
        await r.delete(key)
    except Exception as exc:
        logger.debug("cache_delete error key=%s err=%s", key, exc)


async def cache_delete_pattern(pattern: str) -> None:
    """Delete all keys matching a glob *pattern* using SCAN (safe at any scale)."""
    try:
        r = await get_redis()
        cursor = 0
        while True:
            cursor, keys = await r.scan(cursor=cursor, match=pattern, count=200)
            if keys:
                await r.delete(*keys)
            if cursor == 0:
                break
    except Exception as exc:
        logger.debug("cache_delete_pattern error pattern=%s err=%s", pattern, exc)


async def get_ai_provider_key(org_id: str, provider: str) -> str | None:
    """
    Cached lookup of an org's AI provider API key.
    TTL=300s — provider keys rarely change.
    """
    cache_key = f"ai_provider:{org_id}:{provider}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return cached if cached else None  # empty string means "not found" sentinel

    # DB lookup (import here to avoid circular imports)
    try:
        from sqlalchemy import select
        from app.database import AsyncSessionLocal
        from app.models.ai_provider import OrgAIProvider
        import uuid

        async with AsyncSessionLocal() as db:
            r = await db.execute(
                select(OrgAIProvider).where(
                    OrgAIProvider.org_id == uuid.UUID(org_id),
                    OrgAIProvider.provider == provider,
                )
            )
            row = r.scalar_one_or_none()
            key_val = row.api_key_enc if row else ""

        # Cache the result (empty string = not configured sentinel)
        await cache_set(cache_key, key_val, ttl=300)
        return key_val if key_val else None

    except Exception as exc:
        logger.warning("get_ai_provider_key db error org=%s provider=%s err=%s", org_id, provider, exc)
        return None


async def invalidate_ai_provider_cache(org_id: str) -> None:
    """Call when an org updates its AI provider keys."""
    await cache_delete_pattern(f"ai_provider:{org_id}:*")
