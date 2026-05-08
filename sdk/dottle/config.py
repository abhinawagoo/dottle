from __future__ import annotations
import os
from dataclasses import dataclass, field


@dataclass
class AgentLoopConfig:
    api_url: str = field(default_factory=lambda: os.environ.get(
        "DOTTLE_API_URL",
        os.environ.get("AGENTLOOP_API_URL", "https://dottle-production.up.railway.app/api/v1")
    ))
    api_key: str = field(default_factory=lambda: os.environ.get(
        "DOTTLE_API_KEY",
        os.environ.get("AGENTLOOP_API_KEY", "")
    ))
    project_id: str = field(default_factory=lambda: os.environ.get("DOTTLE_PROJECT_ID", ""))
    flush_interval_ms: int = 2000       # background thread flush interval
    max_batch_size: int = 50
    timeout_s: int = 5
    disabled: bool = False              # set True in tests to suppress all HTTP calls
    debug: bool = False                 # log span events to stdout
    redact_pii: bool = False            # scrub emails, phones, card numbers from prompts

    def validate(self) -> None:
        if not self.api_key:
            raise ValueError(
                "Dottle API key not set. "
                "Set DOTTLE_API_KEY env var or pass api_key= to dottle.configure()"
            )
        if not self.api_url:
            raise ValueError("Dottle API URL not set.")


# Global default config — overridable via AgentLoop(config=...)
_default_config = AgentLoopConfig()


def configure(
    api_url: str | None = None,
    api_key: str | None = None,
    project_id: str | None = None,
    flush_interval_ms: int | None = None,
    disabled: bool = False,
    debug: bool = False,
    redact_pii: bool = False,
) -> AgentLoopConfig:
    """
    Configure the global SDK settings.
    Call once at application startup.
    """
    global _default_config
    _default_config = AgentLoopConfig(
        api_url=api_url or _default_config.api_url,
        api_key=api_key or _default_config.api_key,
        project_id=project_id or _default_config.project_id,
        flush_interval_ms=flush_interval_ms or _default_config.flush_interval_ms,
        disabled=disabled,
        debug=debug,
        redact_pii=redact_pii,
    )
    return _default_config


def get_config() -> AgentLoopConfig:
    return _default_config
