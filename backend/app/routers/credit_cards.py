"""Credit card management: cards, purchases, installments, subscriptions, bills."""
from __future__ import annotations

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
from app.models import (
    Category,
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
    CreditCardDailySpendOut,
    CreditCardBulkCreate,
    AnticipateInstallmentRequest,
)
from app.services import parser_service, llm_service

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
    """Sum of unpaid (current-or-future bill) installments, excluding refunded.

    Subscriptions are excluded — they recur monthly and don't reserve credit
    against the global limit, only count toward the current bill.
    """
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
    Also returns breakdown by type: installment / subscription / one_time.
    """
    # Load all rows once and group in memory — avoids 60+ round-trips per call.
    rows_q = await db.execute(
        select(
            CreditCardInstallment.bill_month,
            CreditCardInstallment.amount,
            CreditCardExpense.is_refunded,
            CreditCardExpense.is_subscription,
            CreditCardExpense.installment_count,
        )
        .join(CreditCardExpense, CreditCardExpense.id == CreditCardInstallment.expense_id)
        .where(CreditCardInstallment.bill_year == year)
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
async def daily_spend(year: int, month: int, db: AsyncSession = Depends(get_db)):
    """Per-day total of credit-card spend within a single bill month.

    Day is taken from the `purchase_date` of the parent expense (since that's
    when the user actually spent). Excludes refunded.
    """
    if not (1 <= month <= 12):
        raise HTTPException(400, "month must be 1..12")
    rows = await db.execute(
        select(CreditCardExpense.purchase_date, CreditCardInstallment.amount)
        .join(CreditCardExpense, CreditCardExpense.id == CreditCardInstallment.expense_id)
        .where(
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
async def by_category(year: int, month: int | None = None, db: AsyncSession = Depends(get_db)):
    """Total credit-card spend per category for a given year (or single month)."""
    where_clauses = [
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
async def by_type(year: int, db: AsyncSession = Depends(get_db)):
    """Annual totals split into subscription / installment / one_time."""
    rows = await db.execute(
        select(
            CreditCardExpense.is_subscription,
            CreditCardExpense.installment_count,
            func.coalesce(func.sum(CreditCardInstallment.amount), 0),
        )
        .select_from(CreditCardInstallment)
        .join(CreditCardExpense, CreditCardExpense.id == CreditCardInstallment.expense_id)
        .where(
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
async def bulk_create_expenses(data: CreditCardBulkCreate, db: AsyncSession = Depends(get_db)):
    """Create multiple expenses at once. Used by the PDF importer after review."""
    card = await db.get(CreditCard, data.credit_card_id)
    if not card:
        raise HTTPException(404, "Card not found")
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
        await _generate_installments(expense, card, db)
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
):
    """Upload a credit-card statement PDF, returns parsed transactions for review.

    The frontend must POST the curated list back to /expenses/bulk to commit.
    """
    if not file.filename:
        raise HTTPException(400, "No filename provided")
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are supported")
    card = await db.get(CreditCard, card_id)
    if not card:
        raise HTTPException(404, "Card not found")

    # Save file to a temp upload dir
    upload_dir = Path("uploads")
    upload_dir.mkdir(exist_ok=True)
    file_path = upload_dir / f"cc_{card_id}_{file.filename}"
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # Parse
    pdf_text = parser_service.extract_pdf_text(file_path)
    if not pdf_text.strip():
        raise HTTPException(400, "Could not extract text from PDF")

    # Categorize via LLM
    cats_q = await db.execute(select(Category).where(Category.type == "expense"))
    categories = cats_q.scalars().all()
    cat_payload = [{"id": c.id, "name": c.name} for c in categories]
    cat_by_name = {c.name.lower(): c.id for c in categories}

    parsed = await llm_service.extract_and_categorize_pdf(pdf_text, cat_payload)

    # Filter to expenses only, normalize
    items: list[dict] = []
    for p in parsed:
        if p.get("type") != "expense":
            continue
        try:
            amount = abs(float(p.get("amount") or 0))
        except (TypeError, ValueError):
            continue
        if amount <= 0:
            continue
        cat_name = p.get("category") or ""
        suggested_id = cat_by_name.get(cat_name.lower())
        items.append({
            "purchase_date": p.get("date"),
            "description": p.get("cleaned_description") or p.get("description") or "",
            "amount": amount,
            "suggested_category_id": suggested_id,
            "suggested_category_name": cat_name if suggested_id else None,
        })

    return {"items": items, "card_id": card_id}


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
