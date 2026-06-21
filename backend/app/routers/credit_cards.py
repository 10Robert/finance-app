"""Credit card management: cards, purchases, installments, subscriptions, bills."""
from __future__ import annotations

import asyncio
import calendar
import shutil
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy import select, delete, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models import (
    Category,
    CreditCard,
    CreditCardExpense,
    CreditCardInstallment,
    Transaction,
    User,
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
    CreditCardDailySpendOut,
    CreditCardBulkCreate,
    AnticipateInstallmentRequest,
)
import logging
import re

from app.services import parser_service, llm_service, docling_service

logger = logging.getLogger(__name__)

_INSTALLMENT_RE = re.compile(r"\s*(\d{1,2})\s*/\s*(\d{1,2})\s*$")


def _strip_installment_marker(desc: str) -> str:
    return _INSTALLMENT_RE.sub("", desc).strip()


def _normalize_desc(desc: str) -> str:
    base = _strip_installment_marker(desc)
    return re.sub(r"\s+", " ", base).strip().lower()

router = APIRouter()

SUBSCRIPTION_HORIZON_MONTHS = 24

PT_MONTHS = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]


def _add_months(year: int, month: int, delta: int) -> tuple[int, int]:
    idx = (month - 1) + delta
    new_year = year + idx // 12
    new_month = idx % 12 + 1
    return new_year, new_month


def _bill_period_for_purchase(purchase_date: date, closing_day: int) -> tuple[int, int]:
    if purchase_date.day < closing_day:
        return purchase_date.year, purchase_date.month
    return _add_months(purchase_date.year, purchase_date.month, 1)


def _due_date_for_bill(bill_year: int, bill_month: int, due_day: int) -> date:
    max_day = calendar.monthrange(bill_year, bill_month)[1]
    return date(bill_year, bill_month, min(due_day, max_day))


async def _delete_mirror_transactions(expense_id: int, user_id: int, db: AsyncSession) -> None:
    result = await db.execute(
        select(CreditCardInstallment.id).where(CreditCardInstallment.expense_id == expense_id)
    )
    inst_ids = [r[0] for r in result.all()]
    if not inst_ids:
        return
    sources = [f"cc_inst_{i}" for i in inst_ids]
    await db.execute(
        delete(Transaction).where(
            Transaction.user_id == user_id,
            Transaction.source.in_(sources),
        )
    )


async def _create_mirror_transaction(
    inst: CreditCardInstallment,
    expense: CreditCardExpense,
    card: CreditCard,
    user_id: int,
    db: AsyncSession,
) -> None:
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
        user_id=user_id,
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
    expense: CreditCardExpense, card: CreditCard, user_id: int, db: AsyncSession
) -> None:
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
        await _create_mirror_transaction(inst, expense, card, user_id, db)


async def _used_amount(card_id: int, db: AsyncSession) -> Decimal:
    today = date.today()
    cur_year, cur_month = today.year, today.month
    result = await db.execute(
        select(func.coalesce(func.sum(CreditCardInstallment.amount), 0))
        .join(CreditCardExpense, CreditCardExpense.id == CreditCardInstallment.expense_id)
        .where(
            CreditCardInstallment.credit_card_id == card_id,
            CreditCardExpense.is_refunded.is_(False),
            CreditCardExpense.is_subscription.is_(False),
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


async def _get_owned_card(card_id: int, user_id: int, db: AsyncSession) -> CreditCard:
    card = await db.get(CreditCard, card_id)
    if not card or card.user_id != user_id:
        raise HTTPException(404, "Card not found")
    return card


async def _get_owned_expense(expense_id: int, user_id: int, db: AsyncSession) -> CreditCardExpense:
    expense = await db.get(CreditCardExpense, expense_id)
    if not expense:
        raise HTTPException(404, "Expense not found")
    card = await db.get(CreditCard, expense.credit_card_id)
    if not card or card.user_id != user_id:
        raise HTTPException(404, "Expense not found")
    return expense


@router.get("/cards", response_model=list[CreditCardOut])
async def list_cards(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(CreditCard)
        .where(CreditCard.user_id == current_user.id, CreditCard.active.is_(True))
        .order_by(CreditCard.name)
    )
    cards = list(result.scalars().all())
    out: list[CreditCardOut] = []
    for c in cards:
        used = await _used_amount(c.id, db)
        out.append(CreditCardOut(
            id=c.id, name=c.name, brand=c.brand, color=c.color,
            credit_limit=c.credit_limit, closing_day=c.closing_day, due_day=c.due_day,
            active=c.active, used_amount=used, created_at=c.created_at,
        ))
    return out


@router.post("/cards", response_model=CreditCardOut, status_code=201)
async def create_card(
    data: CreditCardCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not (1 <= data.closing_day <= 31) or not (1 <= data.due_day <= 31):
        raise HTTPException(400, "closing_day and due_day must be in 1..31")
    card = CreditCard(user_id=current_user.id, **data.model_dump())
    db.add(card)
    await db.commit()
    await db.refresh(card)
    return CreditCardOut(
        id=card.id, name=card.name, brand=card.brand, color=card.color,
        credit_limit=card.credit_limit, closing_day=card.closing_day, due_day=card.due_day,
        active=card.active, used_amount=Decimal("0"), created_at=card.created_at,
    )


@router.put("/cards/{card_id}", response_model=CreditCardOut)
async def update_card(
    card_id: int,
    data: CreditCardUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    card = await _get_owned_card(card_id, current_user.id, db)
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
async def delete_card(
    card_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    card = await _get_owned_card(card_id, current_user.id, db)
    inst_result = await db.execute(
        select(CreditCardInstallment.id).where(CreditCardInstallment.credit_card_id == card_id)
    )
    inst_ids = [r[0] for r in inst_result.all()]
    if inst_ids:
        sources = [f"cc_inst_{i}" for i in inst_ids]
        await db.execute(
            delete(Transaction).where(
                Transaction.user_id == current_user.id,
                Transaction.source.in_(sources),
            )
        )
    await db.delete(card)
    await db.commit()


@router.post("/expenses", response_model=CreditCardExpenseOut, status_code=201)
async def create_expense(
    data: CreditCardExpenseCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    card = await _get_owned_card(data.credit_card_id, current_user.id, db)
    if data.installment_count < 1:
        raise HTTPException(400, "installment_count must be >= 1")
    expense = CreditCardExpense(**data.model_dump())
    db.add(expense)
    await db.flush()
    await _generate_installments(expense, card, current_user.id, db)
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
    current_user: User = Depends(get_current_user),
):
    q = (
        select(CreditCardExpense)
        .options(
            selectinload(CreditCardExpense.category),
            selectinload(CreditCardExpense.installments),
        )
        .join(CreditCard, CreditCard.id == CreditCardExpense.credit_card_id)
        .where(CreditCard.user_id == current_user.id)
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
    current_user: User = Depends(get_current_user),
):
    expense = await _get_owned_expense(expense_id, current_user.id, db)

    payload = data.model_dump(exclude_unset=True)
    schedule_keys = {
        "credit_card_id", "amount", "purchase_date",
        "installment_count", "is_subscription",
    }
    needs_regen = bool(schedule_keys & payload.keys())

    # If swapping card, validate ownership of the new one.
    if "credit_card_id" in payload and payload["credit_card_id"] != expense.credit_card_id:
        await _get_owned_card(payload["credit_card_id"], current_user.id, db)

    for k, v in payload.items():
        setattr(expense, k, v)

    if needs_regen:
        await _delete_mirror_transactions(expense.id, current_user.id, db)
        await db.execute(
            delete(CreditCardInstallment).where(CreditCardInstallment.expense_id == expense.id)
        )
        await db.flush()
        card = await db.get(CreditCard, expense.credit_card_id)
        await _generate_installments(expense, card, current_user.id, db)
    else:
        await _delete_mirror_transactions(expense.id, current_user.id, db)
        card = await db.get(CreditCard, expense.credit_card_id)
        result = await db.execute(
            select(CreditCardInstallment).where(CreditCardInstallment.expense_id == expense.id)
        )
        for inst in result.scalars().all():
            await _create_mirror_transaction(inst, expense, card, current_user.id, db)

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
async def delete_expense(
    expense_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    expense = await _get_owned_expense(expense_id, current_user.id, db)
    await _delete_mirror_transactions(expense.id, current_user.id, db)
    await db.delete(expense)
    await db.commit()


@router.post("/expenses/{expense_id}/refund", response_model=CreditCardExpenseOut)
async def refund_expense(
    expense_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    expense = await _get_owned_expense(expense_id, current_user.id, db)
    expense.is_refunded = True
    expense.refunded_at = date.today()
    await _delete_mirror_transactions(expense.id, current_user.id, db)
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
async def unrefund_expense(
    expense_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    expense = await _get_owned_expense(expense_id, current_user.id, db)
    expense.is_refunded = False
    expense.refunded_at = None
    card = await db.get(CreditCard, expense.credit_card_id)
    result = await db.execute(
        select(CreditCardInstallment).where(CreditCardInstallment.expense_id == expense.id)
    )
    for inst in result.scalars().all():
        await _create_mirror_transaction(inst, expense, card, current_user.id, db)
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


@router.post("/installments/{installment_id}/anticipate")
async def anticipate_installment(
    installment_id: int,
    data: AnticipateInstallmentRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    inst = await db.get(CreditCardInstallment, installment_id)
    if not inst:
        raise HTTPException(404, "Installment not found")
    card = await db.get(CreditCard, inst.credit_card_id)
    if not card or card.user_id != current_user.id:
        raise HTTPException(404, "Installment not found")
    if not (1 <= data.target_month <= 12):
        raise HTTPException(400, "target_month must be 1..12")
    expense = await db.get(CreditCardExpense, inst.expense_id)

    inst.bill_month = data.target_month
    inst.bill_year = data.target_year

    await db.execute(
        delete(Transaction).where(
            Transaction.user_id == current_user.id,
            Transaction.source == f"cc_inst_{inst.id}",
        )
    )
    await db.flush()
    await _create_mirror_transaction(inst, expense, card, current_user.id, db)
    await db.commit()
    return {"ok": True, "installment_id": inst.id, "bill_month": inst.bill_month, "bill_year": inst.bill_year}


@router.get("/bills/months", response_model=list[CreditCardMonthSummaryOut])
async def list_bill_months(
    year: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows_q = await db.execute(
        select(
            CreditCardInstallment.bill_month,
            CreditCardInstallment.amount,
            CreditCardExpense.is_refunded,
            CreditCardExpense.is_subscription,
            CreditCardExpense.installment_count,
        )
        .join(CreditCardExpense, CreditCardExpense.id == CreditCardInstallment.expense_id)
        .join(CreditCard, CreditCard.id == CreditCardInstallment.credit_card_id)
        .where(
            CreditCard.user_id == current_user.id,
            CreditCardInstallment.bill_year == year,
        )
    )
    buckets: dict[int, dict[str, Decimal | int]] = {
        m: {
            "total": Decimal("0"), "refunded": Decimal("0"),
            "installment": Decimal("0"), "subscription": Decimal("0"),
            "one_time": Decimal("0"), "count": 0,
        }
        for m in range(1, 13)
    }
    for bill_month, amount, is_refunded, is_subscription, installment_count in rows_q.all():
        b = buckets[bill_month]
        b["count"] += 1
        amt = Decimal(amount or 0)
        if is_refunded:
            b["refunded"] += amt
            continue
        b["total"] += amt
        if is_subscription:
            b["subscription"] += amt
        elif installment_count > 1:
            b["installment"] += amt
        else:
            b["one_time"] += amt

    return [
        CreditCardMonthSummaryOut(
            bill_month=m,
            bill_year=year,
            label=f"{PT_MONTHS[m - 1]} {year}",
            total=buckets[m]["total"],
            refunded_total=buckets[m]["refunded"],
            item_count=buckets[m]["count"],
            installment_total=buckets[m]["installment"],
            subscription_total=buckets[m]["subscription"],
            one_time_total=buckets[m]["one_time"],
        )
        for m in range(1, 13)
    ]


@router.get("/analytics/daily/{year}/{month}", response_model=list[CreditCardDailySpendOut])
async def daily_spend(
    year: int,
    month: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not (1 <= month <= 12):
        raise HTTPException(400, "month must be 1..12")
    rows = await db.execute(
        select(CreditCardExpense.purchase_date, CreditCardInstallment.amount)
        .join(CreditCardExpense, CreditCardExpense.id == CreditCardInstallment.expense_id)
        .join(CreditCard, CreditCard.id == CreditCardInstallment.credit_card_id)
        .where(
            CreditCard.user_id == current_user.id,
            CreditCardInstallment.bill_year == year,
            CreditCardInstallment.bill_month == month,
            CreditCardExpense.is_refunded.is_(False),
        )
    )
    days_in_month = calendar.monthrange(year, month)[1]
    daily: dict[int, Decimal] = {d: Decimal("0") for d in range(1, days_in_month + 1)}
    for purchase_date, amount in rows.all():
        d = purchase_date.day if purchase_date.day in daily else days_in_month
        daily[d] += Decimal(amount or 0)
    return [CreditCardDailySpendOut(day=d, total=v) for d, v in daily.items()]


@router.get("/bills/{year}/{month}", response_model=list[CreditCardBillItemOut])
async def get_bill(
    year: int,
    month: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not (1 <= month <= 12):
        raise HTTPException(400, "month must be 1..12")
    result = await db.execute(
        select(CreditCardInstallment, CreditCardExpense, CreditCard)
        .join(CreditCardExpense, CreditCardExpense.id == CreditCardInstallment.expense_id)
        .join(CreditCard, CreditCard.id == CreditCardInstallment.credit_card_id)
        .options(selectinload(CreditCardExpense.category))
        .where(
            CreditCard.user_id == current_user.id,
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


@router.get("/analytics/by-category")
async def by_category(
    year: int,
    month: int | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    where_clauses = [
        CreditCard.user_id == current_user.id,
        CreditCardInstallment.bill_year == year,
        CreditCardExpense.is_refunded.is_(False),
    ]
    if month:
        where_clauses.append(CreditCardInstallment.bill_month == month)
    result = await db.execute(
        select(
            Category.name,
            Category.icon,
            func.coalesce(func.sum(CreditCardInstallment.amount), 0),
        )
        .select_from(CreditCardInstallment)
        .join(CreditCardExpense, CreditCardExpense.id == CreditCardInstallment.expense_id)
        .join(CreditCard, CreditCard.id == CreditCardInstallment.credit_card_id)
        .outerjoin(Category, Category.id == CreditCardExpense.category_id)
        .where(*where_clauses)
        .group_by(Category.name, Category.icon)
        .order_by(func.sum(CreditCardInstallment.amount).desc())
    )
    return [
        {"category_name": (name or "Sem categoria"), "category_icon": icon, "total": float(total)}
        for name, icon, total in result.all()
    ]


@router.get("/analytics/by-type")
async def by_type(
    year: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = await db.execute(
        select(
            CreditCardExpense.is_subscription,
            CreditCardExpense.installment_count,
            func.coalesce(func.sum(CreditCardInstallment.amount), 0),
        )
        .select_from(CreditCardInstallment)
        .join(CreditCardExpense, CreditCardExpense.id == CreditCardInstallment.expense_id)
        .join(CreditCard, CreditCard.id == CreditCardInstallment.credit_card_id)
        .where(
            CreditCard.user_id == current_user.id,
            CreditCardInstallment.bill_year == year,
            CreditCardExpense.is_refunded.is_(False),
        )
        .group_by(CreditCardExpense.is_subscription, CreditCardExpense.installment_count)
    )
    sub = inst = one = Decimal("0")
    for is_sub, inst_count, total in rows.all():
        amt = Decimal(total or 0)
        if is_sub:
            sub += amt
        elif inst_count > 1:
            inst += amt
        else:
            one += amt
    return {
        "subscription_total": float(sub),
        "installment_total": float(inst),
        "one_time_total": float(one),
    }


@router.post("/expenses/bulk", response_model=list[CreditCardExpenseOut], status_code=201)
async def bulk_create_expenses(
    data: CreditCardBulkCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    card = await _get_owned_card(data.credit_card_id, current_user.id, db)
    created_ids: list[int] = []
    for item in data.items:
        expense = CreditCardExpense(
            credit_card_id=data.credit_card_id,
            category_id=item.category_id,
            description=item.description,
            amount=item.amount,
            purchase_date=item.purchase_date,
            installment_count=max(1, item.installment_count),
            is_subscription=False,
            icon="credit_card",
        )
        db.add(expense)
        await db.flush()
        await _generate_installments(expense, card, current_user.id, db)
        created_ids.append(expense.id)
    await db.commit()
    if not created_ids:
        return []
    result = await db.execute(
        select(CreditCardExpense)
        .options(
            selectinload(CreditCardExpense.category),
            selectinload(CreditCardExpense.installments),
        )
        .where(CreditCardExpense.id.in_(created_ids))
    )
    return list(result.scalars().all())


@router.post("/import-pdf/parse")
async def import_pdf_parse(
    card_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not file.filename:
        raise HTTPException(400, "No filename provided")
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are supported")
    card = await _get_owned_card(card_id, current_user.id, db)

    upload_dir = Path("uploads")
    upload_dir.mkdir(exist_ok=True)
    file_path = upload_dir / f"cc_{card_id}_{file.filename}"
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    pdf_text = ""
    if docling_service.is_available():
        try:
            pdf_text = await asyncio.wait_for(
                docling_service.pdf_to_markdown_async(file_path), timeout=90
            )
            logger.info("Fatura %s convertida via Granite-Docling (%d chars)", file.filename, len(pdf_text))
        except asyncio.TimeoutError:
            logger.warning("Granite-Docling excedeu 90s; usando fallback pdfplumber")
        except Exception as exc:
            logger.warning("Granite-Docling falhou (%s); usando fallback pdfplumber", exc)
    if not pdf_text:
        pdf_text = await parser_service.extract_pdf_text_async(file_path)
    if not pdf_text or not pdf_text.strip():
        raise HTTPException(400, "Could not extract text from PDF")

    cats_q = await db.execute(
        select(Category).where(
            Category.user_id == current_user.id,
            Category.type == "expense",
        )
    )
    categories = cats_q.scalars().all()
    cat_payload = [{"id": c.id, "name": c.name} for c in categories]
    cat_by_name = {c.name.lower(): c.id for c in categories}

    parsed = await llm_service.extract_and_categorize_pdf(pdf_text, cat_payload)

    existing_q = await db.execute(
        select(CreditCardExpense)
        .options(selectinload(CreditCardExpense.installments))
        .where(CreditCardExpense.credit_card_id == card_id)
    )
    existing_expenses = list(existing_q.scalars().all())

    by_norm_desc: dict[str, list[CreditCardExpense]] = {}
    for exp in existing_expenses:
        by_norm_desc.setdefault(_normalize_desc(exp.description), []).append(exp)

    items: list[dict] = []
    for p in parsed:
        try:
            amount = abs(float(p.get("amount") or 0))
        except (TypeError, ValueError):
            continue
        if amount <= 0:
            continue

        date_str = p.get("date") or ""
        try:
            purchase_date = parser_service.parse_date(date_str)
        except (ValueError, TypeError):
            continue

        original_desc = (p.get("description") or "").strip()
        cleaned = (p.get("cleaned_description") or original_desc).strip()
        cleaned = _strip_installment_marker(cleaned)

        try:
            inst_n = max(1, int(p.get("installment_number") or 1))
            inst_count = max(1, int(p.get("installment_count") or 1))
        except (TypeError, ValueError):
            inst_n, inst_count = 1, 1
        m = _INSTALLMENT_RE.search(original_desc)
        if m:
            try:
                inst_n = int(m.group(1))
                inst_count = int(m.group(2))
            except ValueError:
                pass

        is_refund = (p.get("type") == "income")
        cat_name = p.get("category") or ""
        suggested_id = cat_by_name.get(cat_name.lower())

        is_duplicate = False
        duplicate_reason: str | None = None
        existing_id: int | None = None
        norm_key = _normalize_desc(cleaned)

        if inst_count > 1 and inst_n > 1:
            for exp in by_norm_desc.get(norm_key, []):
                if exp.installment_count == inst_count:
                    is_duplicate = True
                    duplicate_reason = f"parcela {inst_n}/{inst_count} já cadastrada"
                    existing_id = exp.id
                    break

        if not is_duplicate:
            for exp in by_norm_desc.get(norm_key, []):
                same_date = exp.purchase_date == purchase_date
                if inst_count > 1:
                    expected_total = round(amount * inst_count, 2)
                    same_amount = abs(float(exp.amount) - expected_total) < 0.02
                else:
                    same_amount = abs(float(exp.amount) - amount) < 0.02
                if same_date and same_amount:
                    is_duplicate = True
                    duplicate_reason = "compra já cadastrada"
                    existing_id = exp.id
                    break

        items.append({
            "purchase_date": purchase_date.isoformat(),
            "description": cleaned or original_desc,
            "amount": amount,
            "suggested_category_id": suggested_id,
            "suggested_category_name": cat_name if suggested_id else None,
            "installment_number": inst_n,
            "installment_count": inst_count,
            "is_refund": is_refund,
            "is_duplicate": is_duplicate,
            "duplicate_reason": duplicate_reason,
            "existing_expense_id": existing_id,
        })

    return {"items": items, "card_id": card_id}


@router.get("/subscriptions", response_model=list[CreditCardExpenseOut])
async def list_subscriptions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(CreditCardExpense)
        .options(
            selectinload(CreditCardExpense.category),
            selectinload(CreditCardExpense.installments),
        )
        .join(CreditCard, CreditCard.id == CreditCardExpense.credit_card_id)
        .where(
            CreditCard.user_id == current_user.id,
            CreditCardExpense.is_subscription.is_(True),
        )
        .order_by(CreditCardExpense.description)
    )
    return result.scalars().all()
