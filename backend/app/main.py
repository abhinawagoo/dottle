from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import ingest, sessions, metrics, alerts, projects, auth, orgs, issues, code_fixes, slack_oauth
from app.workers.alert_worker import start_alert_worker, stop_alert_worker

settings = get_settings()
logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Dottle backend", version=settings.app_version)
    start_alert_worker(interval_seconds=settings.alert_poll_interval_seconds)
    yield
    stop_alert_worker()
    logger.info("Dottle backend stopped")


app = FastAPI(
    title="Dottle API",
    description="AI Agent Observability Platform — like Sentry, but for AI agents",
    version=settings.app_version,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

_origins = settings.get_cors_origins()
_wildcard = _origins == ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=not _wildcard,   # credentials=True is invalid with wildcard
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router, prefix="/api/v1")
app.include_router(orgs.router, prefix="/api/v1")
app.include_router(projects.router, prefix="/api/v1")
app.include_router(ingest.router, prefix="/api/v1")
app.include_router(sessions.router, prefix="/api/v1")
app.include_router(metrics.router, prefix="/api/v1")
app.include_router(alerts.router, prefix="/api/v1")
app.include_router(issues.router, prefix="/api/v1")
app.include_router(code_fixes.router, prefix="/api/v1")
app.include_router(slack_oauth.router, prefix="/api/v1")


@app.get("/health", tags=["health"])
async def health():
    return {"status": "ok", "version": settings.app_version}
