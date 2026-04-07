from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import SalaryConfig, Discount, OvertimeEntry
from app.schemas import (
    SalaryConfigCreate,
    SalaryConfigUpdate,
    SalaryConfigOut,
    DiscountCreate,
    DiscountOut,
    OvertimeEntryCreate,
    OvertimeEntryOut,
    SalaryCalculationOut,
)

router = APIRouter()


async def get_or_404(db: AsyncSession) -> SalaryConfig:
    result = await db.execute(
        select(SalaryConfig)
        .options(selectinload(SalaryConfig.discounts), selectinload(SalaryConfig.overtime_entries))
        .order_by(SalaryConfig.id.desc())
        .limit(1)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Salary config not found")
    return config


# --- Salary Config ---

@router.get("/config", response_model=SalaryConfigOut | None)
async def get_salary_config(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SalaryConfig)
        .options(selectinload(SalaryConfig.discounts), selectinload(SalaryConfig.overtime_entries))
        .order_by(SalaryConfig.id.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


@router.post("/config", response_model=SalaryConfigOut)
async def create_salary_config(data: SalaryConfigCreate, db: AsyncSession = Depends(get_db)):
    # Only allow one config — update if exists
    result = await db.execute(
        select(SalaryConfig)
        .options(selectinload(SalaryConfig.discounts), selectinload(SalaryConfig.overtime_entries))
        .order_by(SalaryConfig.id.desc())
        .limit(1)
    )
    config = result.scalar_one_or_none()
    if config:
        config.base_salary = data.base_salary
        config.overtime_hour_rate = data.overtime_hour_rate
        config.meal_allowance = data.meal_allowance
        config.health_plan_deduction = data.health_plan_deduction
    else:
        config = SalaryConfig(
            base_salary=data.base_salary,
            overtime_hour_rate=data.overtime_hour_rate,
            meal_allowance=data.meal_allowance,
            health_plan_deduction=data.health_plan_deduction,
        )
        db.add(config)
    await db.commit()
    await db.refresh(config)
    # Reload with relations
    result = await db.execute(
        select(SalaryConfig)
        .options(selectinload(SalaryConfig.discounts), selectinload(SalaryConfig.overtime_entries))
        .where(SalaryConfig.id == config.id)
    )
    return result.scalar_one()


@router.put("/config", response_model=SalaryConfigOut)
async def update_salary_config(data: SalaryConfigUpdate, db: AsyncSession = Depends(get_db)):
    config = await get_or_404(db)
    if data.base_salary is not None:
        config.base_salary = data.base_salary
    if data.overtime_hour_rate is not None:
        config.overtime_hour_rate = data.overtime_hour_rate
    if data.meal_allowance is not None:
        config.meal_allowance = data.meal_allowance
    if data.health_plan_deduction is not None:
        config.health_plan_deduction = data.health_plan_deduction
    await db.commit()
    await db.refresh(config)
    result = await db.execute(
        select(SalaryConfig)
        .options(selectinload(SalaryConfig.discounts), selectinload(SalaryConfig.overtime_entries))
        .where(SalaryConfig.id == config.id)
    )
    return result.scalar_one()


# --- Discounts ---

@router.post("/discounts", response_model=DiscountOut)
async def add_discount(data: DiscountCreate, db: AsyncSession = Depends(get_db)):
    config = await get_or_404(db)
    discount = Discount(
        salary_config_id=config.id,
        name=data.name,
        type=data.type,
        value=data.value,
    )
    db.add(discount)
    await db.commit()
    await db.refresh(discount)
    return discount


@router.delete("/discounts/{discount_id}")
async def remove_discount(discount_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Discount).where(Discount.id == discount_id))
    discount = result.scalar_one_or_none()
    if not discount:
        raise HTTPException(status_code=404, detail="Discount not found")
    await db.delete(discount)
    await db.commit()
    return {"ok": True}


# --- Overtime ---

@router.post("/overtime", response_model=OvertimeEntryOut)
async def add_overtime(data: OvertimeEntryCreate, db: AsyncSession = Depends(get_db)):
    config = await get_or_404(db)
    entry = OvertimeEntry(
        salary_config_id=config.id,
        month=data.month,
        year=data.year,
        hours=data.hours,
        rate_percent=data.rate_percent,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


@router.delete("/overtime/{entry_id}")
async def remove_overtime(entry_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(OvertimeEntry).where(OvertimeEntry.id == entry_id))
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Overtime entry not found")
    await db.delete(entry)
    await db.commit()
    return {"ok": True}


# --- Calculation ---

@router.get("/calculate", response_model=SalaryCalculationOut)
async def calculate_salary(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    config = await get_or_404(db)
    base = config.base_salary
    hour_rate = config.overtime_hour_rate

    # Get overtime entries for this month
    result = await db.execute(
        select(OvertimeEntry).where(
            and_(
                OvertimeEntry.salary_config_id == config.id,
                OvertimeEntry.month == month,
                OvertimeEntry.year == year,
            )
        )
    )
    overtime_entries = result.scalars().all()

    overtime_details = []
    overtime_total = Decimal("0")
    for entry in overtime_entries:
        multiplier = Decimal(str(entry.rate_percent)) / Decimal("100")
        entry_value = entry.hours * hour_rate * (Decimal("1") + multiplier)
        overtime_total += entry_value
        overtime_details.append({
            "id": entry.id,
            "hours": float(entry.hours),
            "rate_percent": entry.rate_percent,
            "value": float(entry_value),
        })

    gross_salary = base + overtime_total

    # Calculate discounts
    discount_details = []
    discounts_total = Decimal("0")
    for d in config.discounts:
        if d.type == "percent":
            amount = gross_salary * d.value / Decimal("100")
        else:
            amount = d.value
        discounts_total += amount
        discount_details.append({
            "id": d.id,
            "name": d.name,
            "type": d.type,
            "value": float(d.value),
            "amount": float(amount),
        })

    net_salary = gross_salary - discounts_total

    return SalaryCalculationOut(
        base_salary=base,
        overtime_total=overtime_total,
        overtime_details=overtime_details,
        gross_salary=gross_salary,
        discounts_total=discounts_total,
        discount_details=discount_details,
        net_salary=net_salary,
    )
