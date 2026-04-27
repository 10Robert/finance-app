"""Credit card management: cards, purchases, installments, subscriptions, bills."""
from __future__ import annotations

import calendar
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, delete, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import (
    CreditCard,
    CreditCardExpense,
    CreditCardInstallment,
    Transaction,
)
from app.schemas import (
    CreditCardCreate,
    CreditCardUpdate,
    CreditCardOut,
    CreditCardExpenseCreate,
    CreditCardExpenseUpdate,
    CreditCardExpenseOut,
    CreditCardBillItemOut,
    CreditCardMonthSummaryOut,
    AnticipateInstallmentRequest,
)

router = APIRouter()

SUBSCRIPTION_HORIZON_MONTHS = 24

PT_MONTHS = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]


# ─── helpers ──────────────────────────────────────────────────────────────

def _add_months(year: int, month: int, delta: int) -> tuple[int, int]:
    idx = (month - 1) + delta
    new_year = year + idx // 12
    new_month = idx % 12 + 1
    return new_year, new_month


def _bill_period_for_purchase(purchase_date: date, closing_day: int) -> tuple[int, int]:
    """Return (year, month) of the fatura that closes for this purchase.

    Rule: a purchase on day <= closing_day falls into the fatura that closes
    THIS month; otherwise it falls into next month's fatura.
    """
    if purchase_date.day <= closing_day:
        return purchase_date.year, purchase_date.month
    return _add_months(purchase_date.year, purchase_date.month, 1)


def _due_date_for_bill(bill_year: int, bill_month: int, due_day: int) -> date:
    """The due date for a bill that closes in (bill_year, bill_month).

    Convention: the bill closing in month M is paid on `due_day` of month M
    (or M+1 if due_day < closing_day — but we keep it simple: same month).
    Day is clamped to month length.
    """
    max_day = calendar.monthrange(bill_year, bill_month)[1]
    return date(bill_year, bill_month, min(due_day, max_day))


async def _delete_mirror_transactions(expense_id: int, db: AsyncSession) -> None:
    """Remove the Transaction mirrors for all installments of an expense."""
    result = await db.execute(
        select(CreditCardInstallment.id).where(CreditCardInstallment.expense_id == expense_id)
    )
    inst_ids = [r[0] for r in result.all()]
    if not inst_ids:
        return
    sources = [f"cc_inst_{i}" for i in inst_ids]
    await db.execute(delete(Transaction).where(Transaction.source.in_(sources)))


async def _create_mirror_transaction(
    inst: CreditCardInstallment,
    expense: CreditCardExpense,
    card: CreditCard,
    db: AsyncSession,
) -> None:
    """Create a Transaction row that mirrors a single installment."""
    if expense.is_refunded:
        return
    due = _due_date_for_bill(inst.bill_year, inst.bill_month, card.due_day)
    if expense.is_subscription:
        desc = f"{expense.description} ({card.name})"
    elif expense.installment_count > 1:
        desc = (
            f"{expense.description} ({inst.installment_number}/{expense.installment_count}) "
            f"- {card.name}"
        )
    else:
        desc = f"{expense.description} - {card.name}"
    tx = Transaction(
        date=due,
        description=desc,
        amount=inst.amount,
        type="expense",
        category_id=expense.category_id,
        icon=expense.icon,
        source=f"cc_inst_{inst.id}",
    )
    db.add(tx)


async def _generate_installments(
    expense: CreditCardExpense, card: CreditCard, db: AsyncSession
) -> None:
    """Create installments + their Transaction mirrors based on expense settings."""
    start_year, start_month = _bill_period_for_purchase(expense.purchase_date, card.closing_day)

    if expense.is_subscription:
        count = SUBSCRIPTION_HORIZON_MONTHS
        per = expense.amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    else:
        count = max(1, expense.installment_count)
        per = (expense.amount / count).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    for i in range(count):
        y, m = _add_months(start_year, start_month, i)
        inst = CreditCardInstallment(
            expense_id=expense.id,
            credit_card_id=card.id,
            installment_number=i + 1,
            amount=per,
            bill_month=m,
            bill_year=y,
            original_bill_month=m,
            original_bill_year=y,
        )
        db.add(inst)
        await db.flush()
        await _create_mirror_transaction(inst, expense, card, db)


async def _used_amount(card_id: int, db: AsyncSession) -> Decimal:
    """Sum of unpaid (current-or-future bill) installments, excluding refunded."""
    today = date.today()
    cur_year, cur_month = today.year, today.month
    result = await db.execute(
        select(func.coalesce(func.sum(CreditCardInstallment.amount), 0))
        .join(CreditCardExpense, CreditCardExpense.id == CreditCardInstallment.expense_id)
        .where(
            CreditCardInstallment.credit_card_id == card_id,
            CreditCardExpense.is_refunded.is_(False),
            (
                (CreditCardInstallment.bill_year > cur_year)
                | (
                    (CreditCardInstallment.bill_year == cur_year)
                    & (CreditCardInstallment.bill_month >= cur_month)
                )
            ),
        )
    )
    return Decimal(result.scalar() or 0)


# ─── credit cards CRUD ────────────────────────────────────────────────────

@router.get("/cards", response_model=list[CreditCardOut])
async def list_cards(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(CreditCard).where(CreditCard.active.is_(True)).order_by(CreditCard.name)
    )
    cards = list(result.scalars().all())
    out: list[CreditCardOut] = []
    for c in cards:
        used = await _used_amount(c.id, db)
        out.append(
            CreditCardOut(
                id=c.id,
                name=c.name,
                brand=c.brand,
                color=c.color,
                credit_limit=c.credit_limit,
                closing_day=c.closing_day,
                due_day=c.due_day,
                active=c.active,
                used_amount=used,
                created_at=c.created_at,
            )
        )
    return out


@router.post("/cards", response_model=CreditCardOut, status_code=201)
async def create_card(data: CreditCardCreate, db: AsyncSession = Depends(get_db)):
    if not (1 <= data.closing_day <= 31) or not (1 <= data.due_day <= 31):
        raise HTTPException(400, "closing_day and due_day must be in 1..31")
    card = CreditCard(**data.model_dump())
    db.add(card)
    await db.commit()
    await db.refresh(card)
    return CreditCardOut(
        id=card.id, name=card.name, brand=card.brand, color=card.color,
        credit_limit=card.credit_limit, closing_day=card.closing_day, due_day=card.due_day,
        active=card.active, used_amount=Decimal("0"), created_at=card.created_at,
    )


@router.put("/cards/{card_id}", response_model=CreditCardOut)
async def update_card(card_id: int, data: CreditCardUpdate, db: AsyncSession = Depends(get_db)):
    card = await db.get(CreditCard, card_id)
    if not card:
        raise HTTPException(404, "Card not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(card, k, v)
    await db.commit()
    await db.refresh(card)
    used = await _used_amount(card.id, db)
    return CreditCardOut(
        id=card.id, name=card.name, brand=card.brand, color=card.color,
        credit_limit=card.credit_limit, closing_day=card.closing_day, due_day=card.due_day,
        active=card.active, used_amount=used, created_at=card.created_at,
    )


@router.delete("/cards/{card_id}", status_code=204)
async def delete_card(card_id: int, db: AsyncSession = Depends(get_db)):
    card = await db.get(CreditCard, card_id)
    if not card:
        raise HTTPException(404, "Card not found")
    # Cascade clears expenses + installments via FK; transactions need manual cleanup.
    inst_result = await db.execute(
        select(CreditCardInstallment.id).where(CreditCardInstallment.credit_card_id == card_id)
    )
    inst_ids = [r[0] for r in inst_result.all()]
    if inst_ids:
        sources = [f"cc_inst_{i}" for i in inst_ids]
        await db.execute(delete(Transaction).where(Transaction.source.in_(sources)))
    await db.delete(card)
    await db.commit()


# ─── expenses CRUD ────────────────────────────────────────────────────────

@router.post("/expenses", response_model=CreditCardExpenseOut, status_code=201)
async def create_expense(data: CreditCardExpenseCreate, db: AsyncSession = Depends(get_db)):
    card = await db.get(CreditCard, data.credit_card_id)
    if not card:
        raise HTTPException(404, "Card not found")
    if data.installment_count < 1:
        raise HTTPException(400, "installment_count must be >= 1")
    expense = CreditCardExpense(**data.model_dump())
    db.add(expense)
    await db.flush()
    await _generate_installments(expense, card, db)
    await db.commit()
    result = await db.execute(
        select(CreditCardExpense)
        .options(
            selectinload(CreditCardExpense.category),
            selectinload(CreditCardExpense.installments),
        )
        .where(CreditCardExpense.id == expense.id)
    )
    return result.scalar_one()


@router.get("/expenses", response_model=list[CreditCardExpenseOut])
async def list_expenses(
    card_id: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    q = (
        select(CreditCardExpense)
        .options(
            selectinload(CreditCardExpense.category),
            selectinload(CreditCardExpense.installments),
        )
        .order_by(CreditCardExpense.purchase_date.desc())
    )
    if card_id:
        q = q.where(CreditCardExpense.credit_card_id == card_id)
    result = await db.execute(q)
    return result.scalars().all()


@router.put("/expenses/{expense_id}", response_model=CreditCardExpenseOut)
async def update_expense(
    expense_id: int,
    data: CreditCardExpenseUpdate,
    db: AsyncSession = Depends(get_db),
):
    expense = await db.get(CreditCardExpense, expense_id)
    if not expense:
        raise HTTPException(404, "Expense not found")

    payload = data.model_dump(exclude_unset=True)
    # Editing installment_count, amount, purchase_date, card or subscription flag
    # changes the schedule — easier to regenerate than to patch in place.
    schedule_keys = {
        "credit_card_id", "amount", "purchase_date",
        "installment_count", "is_subscription",
    }
    needs_regen = bool(schedule_keys & payload.keys())

    for k, v in payload.items():
        setattr(expense, k, v)

    if needs_regen:
        await _delete_mirror_transactions(expense.id, db)
        await db.execute(
            delete(CreditCardInstallment).where(CreditCardInstallment.expense_id == expense.id)
        )
        await db.flush()
        card = await db.get(CreditCard, expense.credit_card_id)
        await _generate_installments(expense, card, db)
    else:
        # Non-schedule fields might still affect mirror description/category — refresh them.
        await _delete_mirror_transactions(expense.id, db)
        card = await db.get(CreditCard, expense.credit_card_id)
        result = await db.execute(
            select(CreditCardInstallment).where(CreditCardInstallment.expense_id == expense.id)
        )
        for inst in result.scalars().all():
            await _create_mirror_transaction(inst, expense, card, db)

    await db.commit()
    result = await db.execute(
        select(CreditCardExpense)
        .options(
            selectinload(CreditCardExpense.category),
            selectinload(CreditCardExpense.installments),
        )
        .where(CreditCardExpense.id == expense.id)
    )
    return result.scalar_one()


@router.delete("/expenses/{expense_id}", status_code=204)
async def delete_expense(expense_id: int, db: AsyncSession = Depends(get_db)):
    expense = await db.get(CreditCardExpense, expense_id)
    if not expense:
        raise HTTPException(404, "Expense not found")
    await _delete_mirror_transactions(expense.id, db)
    await db.delete(expense)
    await db.commit()


# ─── refund toggle ────────────────────────────────────────────────────────

@router.post("/expenses/{expense_id}/refund", response_model=CreditCardExpenseOut)
async def refund_expense(expense_id: int, db: AsyncSession = Depends(get_db)):
    expense = await db.get(CreditCardExpense, expense_id)
    if not expense:
        raise HTTPException(404, "Expense not found")
    expense.is_refunded = True
    expense.refunded_at = date.today()
    # Remove from "gastos" totals by deleting the mirrors.
    await _delete_mirror_transactions(expense.id, db)
    await db.commit()
    result = await db.execute(
        select(CreditCardExpense)
        .options(
            selectinload(CreditCardExpense.category),
            selectinload(CreditCardExpense.installments),
        )
        .where(CreditCardExpense.id == expense.id)
    )
    return result.scalar_one()


@router.post("/expenses/{expense_id}/unrefund", response_model=CreditCardExpenseOut)
async def unrefund_expense(expense_id: int, db: AsyncSession = Depends(get_db)):
    expense = await db.get(CreditCardExpense, expense_id)
    if not expense:
        raise HTTPException(404, "Expense not found")
    expense.is_refunded = False
    expense.refunded_at = None
    card = await db.get(CreditCard, expense.credit_card_id)
    result = await db.execute(
        select(CreditCardInstallment).where(CreditCardInstallment.expense_id == expense.id)
    )
    for inst in result.scalars().all():
        await _create_mirror_transaction(inst, expense, card, db)
    await db.commit()
    result = await db.execute(
        select(CreditCardExpense)
        .options(
            selectinload(CreditCardExpense.category),
            selectinload(CreditCardExpense.installments),
        )
        .where(CreditCardExpense.id == expense.id)
    )
    return result.scalar_one()


# ─── antecipar parcela ────────────────────────────────────────────────────

@router.post("/installments/{installment_id}/anticipate")
async def anticipate_installment(
    installment_id: int,
    data: AnticipateInstallmentRequest,
    db: AsyncSession = Depends(get_db),
):
    inst = await db.get(CreditCardInstallment, installment_id)
    if not inst:
        raise HTTPException(404, "Installment not found")
    if not (1 <= data.target_month <= 12):
        raise HTTPException(400, "target_month must be 1..12")
    expense = await db.get(CreditCardExpense, inst.expense_id)
    card = await db.get(CreditCard, inst.credit_card_id)

    inst.bill_month = data.target_month
    inst.bill_year = data.target_year

    # Refresh the mirror transaction for this installment
    await db.execute(
        delete(Transaction).where(Transaction.source == f"cc_inst_{inst.id}")
    )
    await db.flush()
    await _create_mirror_transaction(inst, expense, card, db)
    await db.commit()
    return {"ok": True, "installment_id": inst.id, "bill_month": inst.bill_month, "bill_year": inst.bill_year}


# ─── bills (faturas) ──────────────────────────────────────────────────────

@router.get("/bills/months", response_model=list[CreditCardMonthSummaryOut])
async def list_bill_months(
    year: int,
    db: AsyncSession = Depends(get_db),
):
    """Totals for each bill month of the given year (jan..dec).

    Refunded expenses are excluded from `total` and shown in `refunded_total`.
    """
    out: list[CreditCardMonthSummaryOut] = []
    for m in range(1, 13):
        # Active total
        total_q = await db.execute(
            select(func.coalesce(func.sum(CreditCardInstallment.amount), 0))
            .join(CreditCardExpense, CreditCardExpense.id == CreditCardInstallment.expense_id)
            .where(
                CreditCardInstallment.bill_year == year,
                CreditCardInstallment.bill_month == m,
                CreditCardExpense.is_refunded.is_(False),
            )
        )
        refunded_q = await db.execute(
            select(func.coalesce(func.sum(CreditCardInstallment.amount), 0))
            .join(CreditCardExpense, CreditCardExpense.id == CreditCardInstallment.expense_id)
            .where(
                CreditCardInstallment.bill_year == year,
                CreditCardInstallment.bill_month == m,
                CreditCardExpense.is_refunded.is_(True),
            )
        )
        count_q = await db.execute(
            select(func.count(CreditCardInstallment.id))
            .where(
                CreditCardInstallment.bill_year == year,
                CreditCardInstallment.bill_month == m,
            )
        )
        out.append(CreditCardMonthSummaryOut(
            bill_month=m,
            bill_year=year,
            label=f"{PT_MONTHS[m - 1]} {year}",
            total=Decimal(total_q.scalar() or 0),
            refunded_total=Decimal(refunded_q.scalar() or 0),
            item_count=int(count_q.scalar() or 0),
        ))
    return out


@router.get("/bills/{year}/{month}", response_model=list[CreditCardBillItemOut])
async def get_bill(year: int, month: int, db: AsyncSession = Depends(get_db)):
    """All installments that fall on a given fatura (year/month)."""
    if not (1 <= month <= 12):
        raise HTTPException(400, "month must be 1..12")
    result = await db.execute(
        select(CreditCardInstallment, CreditCardExpense, CreditCard)
        .join(CreditCardExpense, CreditCardExpense.id == CreditCardInstallment.expense_id)
        .join(CreditCard, CreditCard.id == CreditCardInstallment.credit_card_id)
        .options(selectinload(CreditCardExpense.category))
        .where(
            CreditCardInstallment.bill_year == year,
            CreditCardInstallment.bill_month == month,
        )
        .order_by(CreditCardExpense.purchase_date.desc())
    )
    out: list[CreditCardBillItemOut] = []
    for inst, exp, card in result.all():
        out.append(CreditCardBillItemOut(
            installment_id=inst.id,
            expense_id=exp.id,
            credit_card_id=card.id,
            card_name=card.name,
            card_color=card.color,
            description=exp.description,
            category_id=exp.category_id,
            category_name=exp.category.name if exp.category else None,
            category_icon=exp.category.icon if exp.category else None,
            icon=exp.icon,
            installment_number=inst.installment_number,
            installment_count=exp.installment_count,
            amount=inst.amount,
            purchase_date=exp.purchase_date,
            is_subscription=exp.is_subscription,
            is_refunded=exp.is_refunded,
            is_anticipated=(
                inst.bill_month != inst.original_bill_month
                or inst.bill_year != inst.original_bill_year
            ),
            bill_month=inst.bill_month,
            bill_year=inst.bill_year,
        ))
    return out


# ─── analytics ────────────────────────────────────────────────────────────

@router.get("/analytics/by-category")
async def by_category(year: int, db: AsyncSession = Depends(get_db)):
    """Total credit-card spend per category for a given year."""
    from app.models import Category

    result = await db.execute(
        select(
            Category.name,
            Category.icon,
            func.coalesce(func.sum(CreditCardInstallment.amount), 0),
        )
        .select_from(CreditCardInstallment)
        .join(CreditCardExpense, CreditCardExpense.id == CreditCardInstallment.expense_id)
        .outerjoin(Category, Category.id == CreditCardExpense.category_id)
        .where(
            CreditCardInstallment.bill_year == year,
            CreditCardExpense.is_refunded.is_(False),
        )
        .group_by(Category.name, Category.icon)
        .order_by(func.sum(CreditCardInstallment.amount).desc())
    )
    return [
        {"category_name": (name or "Sem categoria"), "category_icon": icon, "total": float(total)}
        for name, icon, total in result.all()
    ]


@router.get("/subscriptions", response_model=list[CreditCardExpenseOut])
async def list_subscriptions(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(CreditCardExpense)
        .options(
            selectinload(CreditCardExpense.category),
            selectinload(CreditCardExpense.installments),
        )
        .where(CreditCardExpense.is_subscription.is_(True))
        .order_by(CreditCardExpense.description)
    )
    return result.scalars().all()
