from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import MonthlyEntry, SalaryConfig
from app.schemas import (
    MonthlyEntryCreate,
    MonthlyEntryUpdate,
    MonthlyEntryOut,
    MonthlySummaryOut,
)
from app.services.salary_calculator import calculate_inss, calculate_irrf

router = APIRouter()

TWO_PLACES = Decimal("0.01")
HOURS_PER_MONTH = Decimal("220")
DAYS_PER_MONTH = Decimal("30")


async def _get_salary_config(db: AsyncSession) -> SalaryConfig | None:
    result = await db.execute(
        select(SalaryConfig)
        .options(selectinload(SalaryConfig.discounts), selectinload(SalaryConfig.overtime_entries))
        .order_by(SalaryConfig.id.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


def _validate_payload(data: MonthlyEntryCreate) -> None:
    """Ensure the right fields are present for the entry type."""
    t = data.entry_type
    if t == "overtime":
        if data.hours is None or data.hours <= 0:
            raise HTTPException(422, "Horas extras requer 'hours' > 0")
        if data.overtime_multiplier is None:
            raise HTTPException(422, "Horas extras requer 'overtime_multiplier'")
    elif t == "refund":
        if data.amount is None or data.amount <= 0:
            raise HTTPException(422, "Reembolso requer 'amount' > 0")
    elif t == "late":
        if data.hours is None or data.hours <= 0:
            raise HTTPException(422, "Atraso requer 'hours' > 0")
    elif t == "absence":
        if data.days is None or data.days <= 0:
            raise HTTPException(422, "Falta requer 'days' > 0")
    else:
        raise HTTPException(422, f"entry_type inválido: {t}")


@router.get("/", response_model=list[MonthlyEntryOut])
async def list_entries(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(MonthlyEntry)
        .where(MonthlyEntry.reference_month == month, MonthlyEntry.reference_year == year)
        .order_by(MonthlyEntry.entry_date.desc(), MonthlyEntry.id.desc())
    )
    return result.scalars().all()


@router.post("/", response_model=MonthlyEntryOut, status_code=201)
async def create_entry(data: MonthlyEntryCreate, db: AsyncSession = Depends(get_db)):
    _validate_payload(data)
    entry = MonthlyEntry(
        reference_month=data.reference_month,
        reference_year=data.reference_year,
        entry_type=data.entry_type,
        entry_date=data.entry_date or date.today(),
        description=data.description,
        amount=data.amount,
        hours=data.hours,
        overtime_multiplier=data.overtime_multiplier,
        days=data.days,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


@router.put("/{entry_id}", response_model=MonthlyEntryOut)
async def update_entry(entry_id: int, data: MonthlyEntryUpdate, db: AsyncSession = Depends(get_db)):
    entry = await db.get(MonthlyEntry, entry_id)
    if not entry:
        raise HTTPException(404, "Lançamento não encontrado")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(entry, key, value)
    await db.commit()
    await db.refresh(entry)
    return entry


@router.delete("/{entry_id}", status_code=204)
async def delete_entry(entry_id: int, db: AsyncSession = Depends(get_db)):
    entry = await db.get(MonthlyEntry, entry_id)
    if not entry:
        raise HTTPException(404, "Lançamento não encontrado")
    await db.delete(entry)
    await db.commit()


@router.get("/summary", response_model=MonthlySummaryOut)
async def month_summary(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    config = await _get_salary_config(db)
    if not config:
        raise HTTPException(404, "Salary config não encontrada. Configure seu salário primeiro.")

    base_salary = config.base_salary
    meal_allowance = config.meal_allowance
    health = config.health_plan_deduction
    dental = config.dental_plan_deduction
    fgts = config.fgts_balance

    # Aggregate entries for the period
    result = await db.execute(
        select(MonthlyEntry).where(
            MonthlyEntry.reference_month == month,
            MonthlyEntry.reference_year == year,
        )
    )
    entries = result.scalars().all()

    hourly_rate = base_salary / HOURS_PER_MONTH
    daily_rate = base_salary / DAYS_PER_MONTH

    overtime_hours_total = Decimal("0")
    overtime_value = Decimal("0")
    refunds_total = Decimal("0")
    late_hours_total = Decimal("0")
    late_value = Decimal("0")
    absence_days_total = 0
    absence_value = Decimal("0")

    for e in entries:
        if e.entry_type == "overtime" and e.hours:
            mult = e.overtime_multiplier or Decimal("0")
            overtime_hours_total += e.hours
            overtime_value += e.hours * hourly_rate * (Decimal("1") + mult)
        elif e.entry_type == "refund" and e.amount:
            refunds_total += e.amount
        elif e.entry_type == "late" and e.hours:
            late_hours_total += e.hours
            late_value += e.hours * hourly_rate
        elif e.entry_type == "absence" and e.days:
            absence_days_total += e.days
            absence_value += Decimal(e.days) * daily_rate

    overtime_value = overtime_value.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
    late_value = late_value.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
    absence_value = absence_value.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
    discounts_absences_value = (late_value + absence_value).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)

    # INSS / IRRF base: salary + overtime (meal allowance excluded by Brazilian law)
    inss_base = base_salary + overtime_value
    inss = calculate_inss(inss_base)
    irrf = calculate_irrf(inss_base - inss)

    transport_voucher_value = Decimal("0")
    if config.transport_voucher_enabled:
        transport_voucher_value = (base_salary * config.transport_voucher_percent / Decimal("100")).quantize(
            TWO_PLACES, rounding=ROUND_HALF_UP
        )

    total_gross = (base_salary + meal_allowance + overtime_value + refunds_total).quantize(
        TWO_PLACES, rounding=ROUND_HALF_UP
    )
    total_deductions = (
        inss + irrf + health + dental + transport_voucher_value + discounts_absences_value
    ).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
    net_salary = (total_gross - total_deductions).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)

    return MonthlySummaryOut(
        reference_month=month,
        reference_year=year,
        base_salary=base_salary,
        meal_allowance=meal_allowance,
        overtime_hours_total=overtime_hours_total,
        overtime_value=overtime_value,
        refunds_total=refunds_total,
        late_hours_total=late_hours_total,
        late_value=late_value,
        absence_days_total=absence_days_total,
        absence_value=absence_value,
        discounts_absences_value=discounts_absences_value,
        health_plan_deduction=health,
        dental_plan_deduction=dental,
        transport_voucher_value=transport_voucher_value,
        inss=inss,
        irrf=irrf,
        total_gross=total_gross,
        total_deductions=total_deductions,
        net_salary=net_salary,
        fgts_balance=fgts,
    )
