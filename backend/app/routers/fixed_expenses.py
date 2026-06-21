"""CRUD for fixed monthly expenses with auto-generation of Transaction records."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models import FixedExpense, Transaction, User
from app.schemas import FixedExpenseCreate, FixedExpenseOut

router = APIRouter()


def _months_between(start: date, end: date) -> list[date]:
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
    import calendar
    max_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(day, max_day))


async def _generate_transactions(fe: FixedExpense, user_id: int, db: AsyncSession):
    source_tag = f"fixed_{fe.id}"
    start = date(fe.start_date.year, fe.start_date.month, 1)
    if fe.is_permanent:
        today = date.today()
        ref = max(start, date(today.year, today.month, 1))
        end_month = date(ref.year + 2, ref.month, 1)
    else:
        end_month = date(fe.end_date.year, fe.end_date.month, 1) if fe.end_date else start

    months = _months_between(start, end_month)
    for m in months:
        tx_date = _gen_date(m.year, m.month, fe.day_of_month)
        tx = Transaction(
            user_id=user_id,
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
async def list_fixed_expenses(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(FixedExpense)
        .options(selectinload(FixedExpense.category))
        .where(FixedExpense.user_id == current_user.id)
        .order_by(FixedExpense.created_at.desc())
    )
    return result.scalars().all()


@router.post("/", response_model=FixedExpenseOut, status_code=201)
async def create_fixed_expense(
    data: FixedExpenseCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    fe = FixedExpense(user_id=current_user.id, **data.model_dump())
    db.add(fe)
    await db.flush()
    await _generate_transactions(fe, current_user.id, db)
    await db.commit()
    await db.refresh(fe, ["category"])
    return fe


@router.delete("/{expense_id}", status_code=204)
async def delete_fixed_expense(
    expense_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    fe = await db.get(FixedExpense, expense_id)
    if not fe or fe.user_id != current_user.id:
        raise HTTPException(404, "Fixed expense not found")
    source_tag = f"fixed_{fe.id}"
    await db.execute(
        delete(Transaction).where(
            Transaction.source == source_tag,
            Transaction.user_id == current_user.id,
        )
    )
    await db.delete(fe)
    await db.commit()
