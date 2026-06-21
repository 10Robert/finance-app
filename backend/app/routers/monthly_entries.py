from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models import MonthlyEntry, SalaryConfig, User
from app.schemas import (
    MonthlyEntryCreate,
    MonthlyEntryUpdate,
    MonthlyEntryOut,
    MonthlySummaryOut,
)
from app.services.salary_sync import compute_monthly_summary, sync_salary_transaction

router = APIRouter()


async def _get_salary_config(db: AsyncSession, user_id: int, month: int = None, year: int = None) -> SalaryConfig | None:
    if month and year:
        result = await db.execute(
            select(SalaryConfig)
            .options(selectinload(SalaryConfig.discounts), selectinload(SalaryConfig.overtime_entries))
            .where(
                SalaryConfig.user_id == user_id,
                SalaryConfig.reference_month == month,
                SalaryConfig.reference_year == year,
            )
        )
        config = result.scalar_one_or_none()
        if config:
            return config
    result = await db.execute(
        select(SalaryConfig)
        .options(selectinload(SalaryConfig.discounts), selectinload(SalaryConfig.overtime_entries))
        .where(SalaryConfig.user_id == user_id, SalaryConfig.reference_month.is_(None))
        .order_by(SalaryConfig.id.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


def _validate_payload(data: MonthlyEntryCreate) -> None:
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
    elif t == "medical_certificate":
        if data.days is None or data.days <= 0:
            raise HTTPException(422, "Atestado médico requer 'days' > 0")
    else:
        raise HTTPException(422, f"entry_type inválido: {t}")


@router.get("/", response_model=list[MonthlyEntryOut])
async def list_entries(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(MonthlyEntry)
        .where(
            MonthlyEntry.user_id == current_user.id,
            MonthlyEntry.reference_month == month,
            MonthlyEntry.reference_year == year,
        )
        .order_by(MonthlyEntry.entry_date.desc(), MonthlyEntry.id.desc())
    )
    return result.scalars().all()


@router.post("/", response_model=MonthlyEntryOut, status_code=201)
async def create_entry(
    data: MonthlyEntryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _validate_payload(data)
    entry = MonthlyEntry(
        user_id=current_user.id,
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
    await sync_salary_transaction(db, current_user.id, entry.reference_month, entry.reference_year)
    return entry


@router.put("/{entry_id}", response_model=MonthlyEntryOut)
async def update_entry(
    entry_id: int,
    data: MonthlyEntryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    entry = await db.get(MonthlyEntry, entry_id)
    if not entry or entry.user_id != current_user.id:
        raise HTTPException(404, "Lançamento não encontrado")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(entry, key, value)
    await db.commit()
    await db.refresh(entry)
    await sync_salary_transaction(db, current_user.id, entry.reference_month, entry.reference_year)
    return entry


@router.delete("/{entry_id}", status_code=204)
async def delete_entry(
    entry_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    entry = await db.get(MonthlyEntry, entry_id)
    if not entry or entry.user_id != current_user.id:
        raise HTTPException(404, "Lançamento não encontrado")
    month, year = entry.reference_month, entry.reference_year
    await db.delete(entry)
    await db.commit()
    await sync_salary_transaction(db, current_user.id, month, year)


@router.get("/summary", response_model=MonthlySummaryOut)
async def month_summary(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    config = await _get_salary_config(db, current_user.id, month=month, year=year)
    if not config:
        raise HTTPException(404, "Salary config não encontrada. Configure seu salário primeiro.")

    result = await db.execute(
        select(MonthlyEntry).where(
            MonthlyEntry.user_id == current_user.id,
            MonthlyEntry.reference_month == month,
            MonthlyEntry.reference_year == year,
        )
    )
    entries = result.scalars().all()
    return compute_monthly_summary(config, entries, month, year)
