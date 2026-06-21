"""Salary -> Transactions sync.

When the user changes salary config or any monthly entry, we keep a single
auto-generated income transaction in sync per (month, year). The transaction is
identified by ``source = "salary_auto"`` and dated on day 5 of the reference
month. Net <= 0 deletes any existing auto transaction (no point in recording it).
"""

from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Category, MonthlyEntry, SalaryConfig, Transaction
from app.schemas import MonthlySummaryOut
from app.services.salary_calculator import (
    calculate_dsr_on_overtime,
    calculate_inss,
    calculate_irrf,
)

TWO_PLACES = Decimal("0.01")
HOURS_PER_MONTH = Decimal("220")
DAYS_PER_MONTH = Decimal("30")
SALARY_AUTO_SOURCE = "salary_auto"
SALARY_CATEGORY_NAME = "Salário"


def compute_monthly_summary(
    config: SalaryConfig,
    entries: Iterable[MonthlyEntry],
    month: int,
    year: int,
) -> MonthlySummaryOut:
    """Pure summary calculation. Reusable from API endpoint and sync service."""
    base_salary = config.base_salary
    meal_allowance = config.meal_allowance
    health = config.health_plan_deduction
    dental = config.dental_plan_deduction
    fgts = config.fgts_balance
    coparticipation = config.coparticipation

    hourly_rate = base_salary / HOURS_PER_MONTH
    daily_rate = base_salary / DAYS_PER_MONTH

    overtime_hours_total = Decimal("0")
    overtime_value = Decimal("0")
    refunds_total = Decimal("0")
    late_hours_total = Decimal("0")
    late_value = Decimal("0")
    absence_days_total = 0
    absence_value = Decimal("0")
    medical_certificate_days = 0

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
        elif e.entry_type == "medical_certificate" and e.days:
            medical_certificate_days += e.days
            # No deduction — employer pays salary during atestado

    overtime_value = overtime_value.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
    late_value = late_value.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
    absence_value = absence_value.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
    discounts_absences_value = (late_value + absence_value).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)

    # DSR sobre HE — Súmula 172 TST + Lei 605/49.
    dsr_value = calculate_dsr_on_overtime(overtime_value, month, year)

    # INSS base = remuneração efetiva (salário base + horas extras + DSR/HE - atrasos - faltas).
    # Atestado médico NÃO reduz a base pois o empregador paga salário normal.
    # Vale-refeição é excluído por lei; reembolsos também não entram na base.
    inss_base = (base_salary + overtime_value + dsr_value - late_value - absence_value).quantize(
        TWO_PLACES, rounding=ROUND_HALF_UP
    )
    if inss_base < Decimal("0"):
        inss_base = Decimal("0")
    inss = calculate_inss(inss_base, year)
    # IRRF: passa renda bruta + INSS para que calculate_irrf escolha entre
    # Desconto Simplificado (R$ 607,20) e Tradicional (INSS+dependentes), aplicando
    # o que for mais favorável ao contribuinte. Sem dependentes por padrão.
    irrf = calculate_irrf(
        inss_base - inss,
        year,
        month,
        monthly_gross=inss_base,
        inss=inss,
    )

    transport_voucher_value = Decimal("0")
    if config.transport_voucher_enabled:
        transport_voucher_value = (
            base_salary * config.transport_voucher_percent / Decimal("100")
        ).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)

    total_gross = (
        base_salary + meal_allowance + overtime_value + dsr_value + refunds_total
    ).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
    total_deductions = (
        inss + irrf + health + dental + coparticipation + transport_voucher_value + discounts_absences_value
    ).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
    net_salary = (total_gross - total_deductions).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)

    return MonthlySummaryOut(
        reference_month=month,
        reference_year=year,
        base_salary=base_salary,
        meal_allowance=meal_allowance,
        overtime_hours_total=overtime_hours_total,
        overtime_value=overtime_value,
        dsr_value=dsr_value,
        refunds_total=refunds_total,
        late_hours_total=late_hours_total,
        late_value=late_value,
        absence_days_total=absence_days_total,
        absence_value=absence_value,
        discounts_absences_value=discounts_absences_value,
        health_plan_deduction=health,
        dental_plan_deduction=dental,
        transport_voucher_value=transport_voucher_value,
        coparticipation=coparticipation,
        medical_certificate_days=medical_certificate_days,
        inss=inss,
        irrf=irrf,
        total_gross=total_gross,
        total_deductions=total_deductions,
        net_salary=net_salary,
        fgts_balance=fgts,
    )


async def _ensure_salary_category(db: AsyncSession, user_id: int) -> Category:
    result = await db.execute(
        select(Category).where(
            Category.user_id == user_id,
            Category.name == SALARY_CATEGORY_NAME,
            Category.type == "income",
        )
    )
    cat = result.scalar_one_or_none()
    if cat:
        return cat
    cat = Category(user_id=user_id, name=SALARY_CATEGORY_NAME, type="income", icon="payments")
    db.add(cat)
    await db.flush()
    return cat


async def _find_auto_transaction(db: AsyncSession, user_id: int, month: int, year: int) -> Transaction | None:
    target_date = date(year, month, 5)
    result = await db.execute(
        select(Transaction).where(
            Transaction.user_id == user_id,
            Transaction.source == SALARY_AUTO_SOURCE,
            Transaction.date == target_date,
        )
    )
    return result.scalar_one_or_none()


async def sync_salary_transaction(db: AsyncSession, user_id: int, month: int, year: int) -> None:
    """Upsert (or delete) the auto-generated salary transaction for the period."""
    config_result = await db.execute(
        select(SalaryConfig).where(
            SalaryConfig.user_id == user_id,
            SalaryConfig.reference_month == month,
            SalaryConfig.reference_year == year,
        )
    )
    config = config_result.scalar_one_or_none()
    if not config:
        config_result = await db.execute(
            select(SalaryConfig)
            .where(SalaryConfig.user_id == user_id, SalaryConfig.reference_month.is_(None))
            .order_by(SalaryConfig.id.desc())
            .limit(1)
        )
        config = config_result.scalar_one_or_none()
    if not config:
        return

    entries_result = await db.execute(
        select(MonthlyEntry).where(
            MonthlyEntry.user_id == user_id,
            MonthlyEntry.reference_month == month,
            MonthlyEntry.reference_year == year,
        )
    )
    entries = entries_result.scalars().all()

    summary = compute_monthly_summary(config, entries, month, year)
    existing = await _find_auto_transaction(db, user_id, month, year)

    if summary.net_salary <= 0:
        if existing:
            await db.delete(existing)
            await db.commit()
        return

    if existing:
        existing.amount = summary.net_salary
        existing.description = f"Salário líquido {month:02d}/{year}"
        await db.commit()
        return

    category = await _ensure_salary_category(db, user_id)
    tx = Transaction(
        user_id=user_id,
        date=date(year, month, 5),
        description=f"Salário líquido {month:02d}/{year}",
        amount=summary.net_salary,
        type="income",
        category_id=category.id,
        source=SALARY_AUTO_SOURCE,
        icon="payments",
    )
    db.add(tx)
    await db.commit()
