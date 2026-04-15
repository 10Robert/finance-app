"""Salary -> Transactions sync."""

from datetime import date
from decimal import Decimal
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Category, MonthlyEntry, MonthlySalarySnapshot, SalaryConfig, Transaction
from app.schemas import MonthlySummaryOut
from app.services.salary_calculator import calculate_inss, calculate_irrf, money

HOURS_PER_MONTH = Decimal("220")
DAYS_PER_MONTH = Decimal("30")
SALARY_AUTO_SOURCE = "salary_auto"
SALARY_CATEGORY_NAME = "Salário"


def _snapshot_from_config(config: SalaryConfig, month: int, year: int) -> MonthlySalarySnapshot:
    return MonthlySalarySnapshot(
        reference_month=month,
        reference_year=year,
        base_salary=config.base_salary,
        overtime_hour_rate=config.overtime_hour_rate,
        meal_allowance=config.meal_allowance,
        health_plan_deduction=config.health_plan_deduction,
        dental_plan_deduction=config.dental_plan_deduction,
        transport_voucher_enabled=config.transport_voucher_enabled,
        transport_voucher_percent=config.transport_voucher_percent,
        fgts_balance=config.fgts_balance,
    )


async def get_monthly_salary_snapshot(db: AsyncSession, month: int, year: int) -> MonthlySalarySnapshot | None:
    result = await db.execute(
        select(MonthlySalarySnapshot).where(
            MonthlySalarySnapshot.reference_month == month,
            MonthlySalarySnapshot.reference_year == year,
        )
    )
    return result.scalar_one_or_none()


async def ensure_monthly_salary_snapshot(db: AsyncSession, month: int, year: int) -> MonthlySalarySnapshot | None:
    snapshot = await get_monthly_salary_snapshot(db, month, year)
    if snapshot:
        return snapshot

    config_result = await db.execute(select(SalaryConfig).order_by(SalaryConfig.id.desc()).limit(1))
    config = config_result.scalar_one_or_none()
    if not config:
        return None

    snapshot = _snapshot_from_config(config, month, year)
    db.add(snapshot)
    await db.commit()
    await db.refresh(snapshot)
    return snapshot


def compute_monthly_summary(
    config: SalaryConfig | MonthlySalarySnapshot,
    entries: Iterable[MonthlyEntry],
    month: int,
    year: int,
) -> MonthlySummaryOut:
    contractual_base_salary = money(config.base_salary)
    meal_allowance = money(config.meal_allowance)
    health = money(config.health_plan_deduction)
    dental = money(config.dental_plan_deduction)
    fgts = money(config.fgts_balance)

    hourly_rate = config.overtime_hour_rate
    daily_rate = contractual_base_salary / DAYS_PER_MONTH

    overtime_hours_total = Decimal("0")
    overtime_value = Decimal("0")
    refunds_total = Decimal("0")
    late_hours_total = Decimal("0")
    late_value = Decimal("0")
    absence_days_total = 0
    absence_value = Decimal("0")

    for entry in entries:
        if entry.entry_type == "overtime" and entry.hours:
            multiplier = entry.overtime_multiplier or Decimal("0")
            overtime_hours_total += entry.hours
            overtime_value += entry.hours * hourly_rate * (Decimal("1") + multiplier)
        elif entry.entry_type == "refund" and entry.amount:
            refunds_total += entry.amount
        elif entry.entry_type == "late" and entry.hours:
            late_hours_total += entry.hours
            late_value += entry.hours * (contractual_base_salary / HOURS_PER_MONTH)
        elif entry.entry_type == "absence" and entry.days:
            absence_days_total += entry.days
            absence_value += Decimal(entry.days) * daily_rate

    overtime_value = money(overtime_value)
    refunds_total = money(refunds_total)
    late_value = money(late_value)
    absence_value = money(absence_value)
    discounts_absences_value = money(late_value + absence_value)
    base_salary_due = money(max(contractual_base_salary - discounts_absences_value, Decimal("0")))

    inss_base = base_salary_due + overtime_value
    inss = calculate_inss(inss_base, year)
    irrf = calculate_irrf(
        inss_base - inss,
        year,
        month,
        monthly_gross=inss_base,
    )

    transport_voucher_value = Decimal("0.00")
    if config.transport_voucher_enabled:
        transport_voucher_value = money(
            contractual_base_salary * config.transport_voucher_percent / Decimal("100")
        )

    total_gross = money(base_salary_due + meal_allowance + overtime_value + refunds_total)
    total_deductions = money(
        inss + irrf + health + dental + transport_voucher_value
    )
    net_salary = money(total_gross - total_deductions)

    return MonthlySummaryOut(
        reference_month=month,
        reference_year=year,
        base_salary_contractual=contractual_base_salary,
        base_salary_due=base_salary_due,
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


async def _ensure_salary_category(db: AsyncSession) -> Category:
    result = await db.execute(
        select(Category).where(Category.name == SALARY_CATEGORY_NAME, Category.type == "income")
    )
    category = result.scalar_one_or_none()
    if category:
        return category
    category = Category(name=SALARY_CATEGORY_NAME, type="income", icon="payments")
    db.add(category)
    await db.flush()
    return category


async def _find_auto_transaction(db: AsyncSession, month: int, year: int) -> Transaction | None:
    target_date = date(year, month, 5)
    result = await db.execute(
        select(Transaction).where(
            Transaction.source == SALARY_AUTO_SOURCE,
            Transaction.date == target_date,
        )
    )
    return result.scalar_one_or_none()


async def sync_salary_transaction(db: AsyncSession, month: int, year: int) -> None:
    snapshot = await ensure_monthly_salary_snapshot(db, month, year)
    if not snapshot:
        return

    entries_result = await db.execute(
        select(MonthlyEntry).where(
            MonthlyEntry.reference_month == month,
            MonthlyEntry.reference_year == year,
        )
    )
    entries = entries_result.scalars().all()
    summary = compute_monthly_summary(snapshot, entries, month, year)
    existing = await _find_auto_transaction(db, month, year)

    if summary.net_salary <= 0:
        if existing:
            await db.delete(existing)
            await db.commit()
        return

    category = await _ensure_salary_category(db)
    description = f"Salário líquido {month:02d}/{year}"
    tx_date = date(year, month, 5)
    if existing:
        existing.date = tx_date
        existing.amount = summary.net_salary
        existing.description = description
        existing.type = "income"
        existing.category_id = category.id
        existing.source = SALARY_AUTO_SOURCE
        existing.icon = "payments"
        await db.commit()
        return

    transaction = Transaction(
        date=tx_date,
        description=description,
        amount=summary.net_salary,
        type="income",
        category_id=category.id,
        source=SALARY_AUTO_SOURCE,
        icon="payments",
    )
    db.add(transaction)
    await db.commit()
