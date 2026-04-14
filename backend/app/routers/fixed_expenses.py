"""CRUD for fixed monthly expenses with auto-generation of Transaction records."""
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import FixedExpense, Transaction
from app.schemas import FixedExpenseCreate, FixedExpenseOut

router = APIRouter()


def _months_between(start: date, end: date) -> list[date]:
    """Return list of 1st-of-month dates from start to end (inclusive)."""
    months: list[date] = []
    cur = date(start.year, start.month, 1)
    last = date(end.year, end.month, 1)
    while cur <= last:
        months.append(cur)
        if cur.month == 12:
            cur = date(cur.year + 1, 1, 1)
        else:
            cur = date(cur.year, cur.month + 1, 1)
    return months


def _gen_date(year: int, month: int, day: int) -> date:
    """Clamp day to valid range for the given month."""
    import calendar
    max_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(day, max_day))


async def _generate_transactions(fe: FixedExpense, db: AsyncSession):
    """Create Transaction records for all months covered by a FixedExpense."""
    source_tag = f"fixed_{fe.id}"
    start = date(fe.start_date.year, fe.start_date.month, 1)
    if fe.is_permanent:
        # generate 24 months ahead from today or start, whichever is later
        today = date.today()
        ref = max(start, date(today.year, today.month, 1))
        end_month = date(ref.year + 2, ref.month, 1)
    else:
        end_month = date(fe.end_date.year, fe.end_date.month, 1) if fe.end_date else start

    months = _months_between(start, end_month)
    for m in months:
        tx_date = _gen_date(m.year, m.month, fe.day_of_month)
        tx = Transaction(
            date=tx_date,
            description=fe.description,
            amount=fe.amount,
            type="expense",
            category_id=fe.category_id,
            icon=fe.icon,
            source=source_tag,
            is_recurring=True,
            recurring_day=fe.day_of_month,
        )
        db.add(tx)


@router.get("/", response_model=list[FixedExpenseOut])
async def list_fixed_expenses(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(FixedExpense)
        .options(selectinload(FixedExpense.category))
        .order_by(FixedExpense.created_at.desc())
    )
    return result.scalars().all()


@router.post("/", response_model=FixedExpenseOut, status_code=201)
async def create_fixed_expense(data: FixedExpenseCreate, db: AsyncSession = Depends(get_db)):
    fe = FixedExpense(**data.model_dump())
    db.add(fe)
    await db.flush()  # get id
    await _generate_transactions(fe, db)
    await db.commit()
    await db.refresh(fe, ["category"])
    return fe


@router.delete("/{expense_id}", status_code=204)
async def delete_fixed_expense(expense_id: int, db: AsyncSession = Depends(get_db)):
    fe = await db.get(FixedExpense, expense_id)
    if not fe:
        raise HTTPException(404, "Fixed expense not found")
    # Delete all auto-generated transactions
    source_tag = f"fixed_{fe.id}"
    await db.execute(delete(Transaction).where(Transaction.source == source_tag))
    await db.delete(fe)
    await db.commit()
