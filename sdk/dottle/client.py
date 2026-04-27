"""
HTTP client with background flush thread.
Batches spans and POSTs them to the Dottle backend.
Fire-and-forget: failed flushes warn but never block the agent.
"""
from __future__ import annotations
import logging
import threading
import time
from collections import deque
from datetime import datetime, timezone
from typing import Any

import httpx

from dottle.config import AgentLoopConfig, get_config
from dottle.models import SpanPayload, SessionStartPayload, SessionEndPayload, SpanIngestPayload

logger = logging.getLogger("dottle")


def _get_git_info() -> dict[str, str]:
    """Auto-detect git branch, SHA, and remote URL. Returns {} on any failure."""
    try:
        import subprocess
        branch = subprocess.check_output(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            stderr=subprocess.DEVNULL, timeout=2,
        ).decode().strip()
        sha = subprocess.check_output(
            ["git", "rev-parse", "HEAD"],
            stderr=subprocess.DEVNULL, timeout=2,
        ).decode().strip()
        info: dict[str, str] = {
            "git_branch": branch,
            "git_sha": sha,
            "git_sha_short": sha[:7],
        }
        try:
            remote = subprocess.check_output(
                ["git", "remote", "get-url", "origin"],
                stderr=subprocess.DEVNULL, timeout=2,
            ).decode().strip()
            # Normalize SSH → HTTPS: git@github.com:owner/repo.git → https://github.com/owner/repo
            if remote.startswith("git@"):
                remote = "https://" + remote[4:].replace(":", "/", 1)
            if remote.endswith(".git"):
                remote = remote[:-4]
            info["git_remote"] = remote
        except Exception:
            pass
        return info
    except Exception:
        return {}


class AgentLoopClient:
    def __init__(self, config: AgentLoopConfig | None = None):
        self._config = config or get_config()
        self._buffer: deque[SpanPayload] = deque()
        self._lock = threading.Lock()
        self._current_session_id: str | None = None
        self._flush_thread: threading.Thread | None = None
        self._stop_event = threading.Event()

        if not self._config.disabled:
            self._start_flush_thread()

    # ── Session lifecycle ────────────────────────────────────────────────────

    def start_session(
        self,
        agent_name: str,
        session_id: str | None = None,
        external_id: str | None = None,
        metadata: dict[str, Any] | None = None,
        user_id: str | None = None,
        user_email: str | None = None,
        tags: list[str] | None = None,
        agent_version: str | None = None,
    ) -> str:
        if self._config.disabled:
            import uuid
            return session_id or str(uuid.uuid4())

        # Auto-detect git info; user-supplied metadata keys take precedence
        git_info = _get_git_info()
        merged_metadata = {**git_info, **(metadata or {})}

        payload = SessionStartPayload(
            session_id=session_id,
            agent_name=agent_name,
            external_id=external_id,
            started_at=datetime.now(timezone.utc),
            metadata=merged_metadata,
            user_id=user_id,
            user_email=user_email,
            tags=tags or [],
            agent_version=agent_version,
        )
        response = self._post("/ingest/session/start", payload.model_dump(mode="json"))
        sid = response.get("session_id", session_id or "")
        self._current_session_id = sid
        return sid

    def end_session(
        self,
        session_id: str,
        status: str = "completed",
        error_message: str | None = None,
        error_type: str | None = None,
        loop_detected: bool = False,
        loop_reason: str | None = None,
        iteration_count: int = 0,
    ) -> None:
        # Flush any buffered spans first
        self._flush(session_id)

        if self._config.disabled:
            return

        payload = SessionEndPayload(
            session_id=session_id,
            status=status,
            ended_at=datetime.now(timezone.utc),
            error_message=error_message,
            error_type=error_type,
            loop_detected=loop_detected,
            loop_reason=loop_reason,
            iteration_count=iteration_count,
        )
        self._post("/ingest/session/end", payload.model_dump(mode="json"))

    # ── Span buffering ───────────────────────────────────────────────────────

    def add_span(self, span: SpanPayload) -> None:
        if self._config.disabled:
            return
        with self._lock:
            self._buffer.append(span)
            if len(self._buffer) >= self._config.max_batch_size:
                # Trigger immediate flush on next opportunity
                pass

    # Alias used by framework integrations (crewai, autogen, agno)
    _buffer_span = add_span

    # ── Flush ────────────────────────────────────────────────────────────────

    def _flush(self, session_id: str | None = None) -> None:
        sid = session_id or self._current_session_id
        if not sid:
            return

        with self._lock:
            if not self._buffer:
                return
            batch = list(self._buffer)
            self._buffer.clear()

        chunks = [batch[i:i+self._config.max_batch_size] for i in range(0, len(batch), self._config.max_batch_size)]
        for chunk in chunks:
            payload = SpanIngestPayload(session_id=sid, spans=chunk)
            try:
                self._post("/ingest/spans", payload.model_dump(mode="json"))
                if self._config.debug:
                    logger.debug(f"Flushed {len(chunk)} spans for session {sid}")
            except Exception as exc:
                logger.warning(f"Dottle flush failed (spans dropped): {exc}")

    def _start_flush_thread(self) -> None:
        interval_s = self._config.flush_interval_ms / 1000.0

        def _loop():
            while not self._stop_event.is_set():
                self._stop_event.wait(timeout=interval_s)
                self._flush()

        self._flush_thread = threading.Thread(target=_loop, daemon=True, name="dottle-flush")
        self._flush_thread.start()

    def shutdown(self) -> None:
        self._stop_event.set()
        if self._flush_thread:
            self._flush_thread.join(timeout=5)
        self._flush()   # final flush

    # ── HTTP ─────────────────────────────────────────────────────────────────

    def _post(self, path: str, data: dict) -> dict:
        url = self._config.api_url.rstrip("/") + path
        headers = {"X-API-Key": self._config.api_key, "Content-Type": "application/json"}
        try:
            with httpx.Client(timeout=self._config.timeout_s) as client:
                resp = client.post(url, json=data, headers=headers)
                resp.raise_for_status()
                return resp.json()
        except httpx.HTTPStatusError as exc:
            logger.warning(f"Dottle API error {exc.response.status_code}: {exc.response.text}")
            raise
        except Exception as exc:
            logger.warning(f"Dottle network error: {exc}")
            raise


# ── Singleton client ──────────────────────────────────────────────────────────
_client: AgentLoopClient | None = None


def get_client() -> AgentLoopClient:
    global _client
    if _client is None:
        _client = AgentLoopClient()
    return _client


def reset_client() -> None:
    global _client
    if _client:
        _client.shutdown()
    _client = None
