"""CRUD for installment purchases with auto-generation of Transaction records."""
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import InstallmentPurchase, Transaction
from app.schemas import InstallmentPurchaseCreate, InstallmentPurchaseOut

router = APIRouter()


def _add_months(d: date, months: int) -> date:
    """Add N months to a date, clamping to valid day."""
    import calendar
    month = d.month - 1 + months
    year = d.year + month // 12
    month = month % 12 + 1
    max_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(d.day, max_day))


async def _generate_transactions(ip: InstallmentPurchase, db: AsyncSession):
    """Create N Transaction records — one per installment."""
    source_tag = f"installment_{ip.id}"
    installment_amount = (ip.total_amount / ip.installment_count).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )

    for i in range(ip.installment_count):
        tx_date = _add_months(ip.start_date, i)
        tx = Transaction(
            date=tx_date,
            description=f"{ip.description} (Parcela {i + 1}/{ip.installment_count})",
            amount=installment_amount,
            type="expense",
            category_id=ip.category_id,
            icon=ip.icon,
            source=source_tag,
        )
        db.add(tx)


@router.get("/", response_model=list[InstallmentPurchaseOut])
async def list_installments(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(InstallmentPurchase)
        .options(selectinload(InstallmentPurchase.category))
        .order_by(InstallmentPurchase.created_at.desc())
    )
    return result.scalars().all()


@router.post("/", response_model=InstallmentPurchaseOut, status_code=201)
async def create_installment(data: InstallmentPurchaseCreate, db: AsyncSession = Depends(get_db)):
    ip = InstallmentPurchase(**data.model_dump())
    db.add(ip)
    await db.flush()  # get id
    await _generate_transactions(ip, db)
    await db.commit()
    await db.refresh(ip, ["category"])
    return ip


@router.delete("/{purchase_id}", status_code=204)
async def delete_installment(purchase_id: int, db: AsyncSession = Depends(get_db)):
    ip = await db.get(InstallmentPurchase, purchase_id)
    if not ip:
        raise HTTPException(404, "Installment purchase not found")
    source_tag = f"installment_{ip.id}"
    await db.execute(delete(Transaction).where(Transaction.source == source_tag))
    await db.delete(ip)
    await db.commit()
