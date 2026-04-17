import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.alert import AlertRule, AlertEvent
from app.schemas.alert import AlertRuleCreate, AlertRuleUpdate, AlertRuleResponse, AlertEventResponse

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.post("/rules", response_model=AlertRuleResponse, status_code=status.HTTP_201_CREATED)
async def create_alert_rule(body: AlertRuleCreate, db: AsyncSession = Depends(get_db)):
    rule = AlertRule(
        id=uuid.uuid4(),
        **body.model_dump(),
    )
    db.add(rule)
    await db.flush()
    return rule


@router.get("/rules", response_model=list[AlertRuleResponse])
async def list_alert_rules(project_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(AlertRule)
        .where(AlertRule.project_id == project_id)
        .order_by(AlertRule.created_at.desc())
    )
    return result.scalars().all()


@router.get("/rules/{rule_id}", response_model=AlertRuleResponse)
async def get_alert_rule(rule_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AlertRule).where(AlertRule.id == rule_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Alert rule not found")
    return rule


@router.patch("/rules/{rule_id}", response_model=AlertRuleResponse)
async def update_alert_rule(
    rule_id: uuid.UUID,
    body: AlertRuleUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(AlertRule).where(AlertRule.id == rule_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Alert rule not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(rule, field, value)

    await db.flush()
    return rule


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_alert_rule(rule_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AlertRule).where(AlertRule.id == rule_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Alert rule not found")
    await db.delete(rule)


@router.get("/events", response_model=list[AlertEventResponse])
async def list_alert_events(
    project_id: uuid.UUID,
    page: int = 1,
    page_size: int = 50,
    db: AsyncSession = Depends(get_db),
):
    offset = (page - 1) * page_size
    result = await db.execute(
        select(AlertEvent)
        .join(AlertRule, AlertEvent.alert_rule_id == AlertRule.id)
        .where(AlertRule.project_id == project_id)
        .order_by(AlertEvent.fired_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    return result.scalars().all()
