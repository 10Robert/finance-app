from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import Transaction
from app.schemas import TransactionCreate, TransactionUpdate, TransactionOut, TransactionListOut

router = APIRouter()


@router.get("/", response_model=TransactionListOut)
async def list_transactions(
    start_date: date | None = None,
    end_date: date | None = None,
    category_id: int | None = None,
    type: str | None = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    query = select(Transaction).options(selectinload(Transaction.category))
    count_query = select(func.count(Transaction.id))

    if start_date:
        query = query.where(Transaction.date >= start_date)
        count_query = count_query.where(Transaction.date >= start_date)
    if end_date:
        query = query.where(Transaction.date <= end_date)
        count_query = count_query.where(Transaction.date <= end_date)
    if category_id:
        query = query.where(Transaction.category_id == category_id)
        count_query = count_query.where(Transaction.category_id == category_id)
    if type:
        query = query.where(Transaction.type == type)
        count_query = count_query.where(Transaction.type == type)

    total = (await db.execute(count_query)).scalar_one()
    query = query.order_by(Transaction.date.desc(), Transaction.id.desc())
    query = query.offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)

    return TransactionListOut(items=result.scalars().all(), total=total, page=page, per_page=per_page)


@router.post("/", response_model=TransactionOut, status_code=201)
async def create_transaction(data: TransactionCreate, db: AsyncSession = Depends(get_db)):
    transaction = Transaction(**data.model_dump())
    db.add(transaction)
    await db.commit()
    await db.refresh(transaction, ["category"])
    return transaction


@router.get("/{transaction_id}", response_model=TransactionOut)
async def get_transaction(transaction_id: int, db: AsyncSession = Depends(get_db)):
    query = select(Transaction).options(selectinload(Transaction.category)).where(Transaction.id == transaction_id)
    result = await db.execute(query)
    transaction = result.scalar_one_or_none()
    if not transaction:
        raise HTTPException(404, "Transaction not found")
    return transaction


@router.put("/{transaction_id}", response_model=TransactionOut)
async def update_transaction(transaction_id: int, data: TransactionUpdate, db: AsyncSession = Depends(get_db)):
    transaction = await db.get(Transaction, transaction_id)
    if not transaction:
        raise HTTPException(404, "Transaction not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(transaction, key, value)
    await db.commit()
    await db.refresh(transaction, ["category"])
    return transaction


@router.delete("/{transaction_id}", status_code=204)
async def delete_transaction(transaction_id: int, db: AsyncSession = Depends(get_db)):
    transaction = await db.get(Transaction, transaction_id)
    if not transaction:
        raise HTTPException(404, "Transaction not found")
    await db.delete(transaction)
    await db.commit()
