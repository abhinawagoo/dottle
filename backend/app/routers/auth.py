"""
Auth router — register, login, Google SSO, /me
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, status, Header
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models.user import User
from app.models.organization import Organization, OrgMember
from app.services.auth_service import hash_password, verify_password, create_token, decode_token, slugify

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"


# ── Schemas ────────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    token: str
    user: dict


# ── Dependency: get current user from Bearer token ─────────────────────────────

async def get_current_user(
    authorization: str = Header(...),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")
    token = authorization.removeprefix("Bearer ").strip()
    try:
        payload = decode_token(token)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# ── Register ───────────────────────────────────────────────────────────────────

@router.post("/register", response_model=AuthResponse, status_code=201)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        email=body.email,
        name=body.name,
        password_hash=hash_password(body.password),
        last_login_at=datetime.now(timezone.utc),
    )
    db.add(user)
    await db.flush()

    token = create_token(user.id, user.email)
    return AuthResponse(token=token, user=_user_dict(user))


# ── Login ──────────────────────────────────────────────────────────────────────

@router.post("/login", response_model=AuthResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if not user or not user.password_hash:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    user.last_login_at = datetime.now(timezone.utc)
    token = create_token(user.id, user.email)
    return AuthResponse(token=token, user=_user_dict(user))


# ── /me ────────────────────────────────────────────────────────────────────────

@router.get("/me")
async def me(current_user: User = Depends(get_current_user)):
    return _user_dict(current_user)


# ── Google OAuth ───────────────────────────────────────────────────────────────

@router.get("/google")
async def google_login():
    if not settings.google_client_id:
        raise HTTPException(status_code=501, detail="Google OAuth not configured")

    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "select_account",
    }
    return RedirectResponse(f"{GOOGLE_AUTH_URL}?{urlencode(params)}")


@router.get("/google/callback")
async def google_callback(code: str, db: AsyncSession = Depends(get_db)):
    if not settings.google_client_id:
        raise HTTPException(status_code=501, detail="Google OAuth not configured")

    # Exchange code → access token
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(GOOGLE_TOKEN_URL, data={
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "redirect_uri": settings.google_redirect_uri,
            "grant_type": "authorization_code",
            "code": code,
        })
        token_resp.raise_for_status()
        token_data = token_resp.json()

        # Get user info
        userinfo_resp = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {token_data['access_token']}"},
        )
        userinfo_resp.raise_for_status()
        info = userinfo_resp.json()

    google_id = info["sub"]
    email = info["email"]
    name = info.get("name", email.split("@")[0])
    avatar_url = info.get("picture")

    # Find existing user by google_id or email
    result = await db.execute(select(User).where(User.google_id == google_id))
    user = result.scalar_one_or_none()

    if not user:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

    if user:
        # Update google_id if not set
        if not user.google_id:
            user.google_id = google_id
        user.avatar_url = avatar_url
        user.last_login_at = datetime.now(timezone.utc)
    else:
        # Create new user
        user = User(
            email=email,
            name=name,
            avatar_url=avatar_url,
            google_id=google_id,
            last_login_at=datetime.now(timezone.utc),
        )
        db.add(user)
        await db.flush()

    token = create_token(user.id, user.email)
    # Redirect to frontend with token
    return RedirectResponse(f"{settings.frontend_url}/auth/callback?token={token}")


# ── Helpers ────────────────────────────────────────────────────────────────────

def _user_dict(user: User) -> dict:
    return {
        "id": str(user.id),
        "email": user.email,
        "name": user.name,
        "avatar_url": user.avatar_url,
        "created_at": user.created_at.isoformat(),
    }
