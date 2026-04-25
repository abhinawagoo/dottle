"""
Run once to create a demo user + org + project for local development.

  cd backend
  python seed_demo.py

Login:
  Email:    demo@dottle.dev
  Password: demo1234
"""
import asyncio, uuid, secrets
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import select

# ── inline config so we don't need env vars ───────────────────────────────────
DATABASE_URL = "postgresql+asyncpg://postgres:postgres@localhost:5432/dottle"

from app.services.auth_service import hash_password

async def seed():
    engine = create_async_engine(DATABASE_URL, echo=False)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as db:
        # Lazy imports after engine is ready
        from app.models.user import User
        from app.models.organization import Organization, OrgMember
        from app.models.project import Project

        # ── Check if demo user already exists ─────────────────────────────────
        existing = await db.execute(select(User).where(User.email == "demo@dottle.dev"))
        user = existing.scalar_one_or_none()

        if user:
            print(f"✓ Demo user already exists (id={user.id})")
        else:
            user = User(
                id=uuid.uuid4(),
                name="Demo User",
                email="demo@dottle.dev",
                hashed_password=hash_password("demo1234"),
                onboarding_completed=True,
                onboarding_data={},
                created_at=datetime.now(timezone.utc),
            )
            db.add(user)
            await db.flush()
            print(f"✓ Created demo user (id={user.id})")

        # ── Org ───────────────────────────────────────────────────────────────
        existing_org = await db.execute(select(Organization).where(Organization.name == "Demo Org"))
        org = existing_org.scalar_one_or_none()

        if org:
            print(f"✓ Demo org already exists (id={org.id})")
        else:
            org = Organization(
                id=uuid.uuid4(),
                name="Demo Org",
                slug="demo-org",
                created_by=user.id,
                created_at=datetime.now(timezone.utc),
            )
            db.add(org)
            await db.flush()

            member = OrgMember(
                id=uuid.uuid4(),
                org_id=org.id,
                user_id=user.id,
                role="owner",
                joined_at=datetime.now(timezone.utc),
            )
            db.add(member)
            print(f"✓ Created demo org (id={org.id})")

        # ── Project ───────────────────────────────────────────────────────────
        existing_proj = await db.execute(select(Project).where(Project.org_id == org.id))
        project = existing_proj.scalar_one_or_none()

        if project:
            print(f"✓ Demo project already exists")
            print(f"  API key: {project.api_key}")
        else:
            project = Project(
                id=uuid.uuid4(),
                org_id=org.id,
                created_by=user.id,
                name="demo-agent",
                description="Local development project",
                api_key=f"dtl_live_{secrets.token_urlsafe(32)}",
                created_at=datetime.now(timezone.utc),
            )
            db.add(project)
            print(f"✓ Created demo project")
            print(f"  API key: {project.api_key}")

        await db.commit()

    await engine.dispose()

    print()
    print("─" * 40)
    print("  Local login credentials")
    print("─" * 40)
    print("  URL:      http://localhost:3000/login")
    print("  Email:    demo@dottle.dev")
    print("  Password: demo1234")
    print("─" * 40)

asyncio.run(seed())
