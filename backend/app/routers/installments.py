"""CRUD for installment purchases with auto-generation of Transaction records."""
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models import InstallmentPurchase, Transaction, User
from app.schemas import InstallmentPurchaseCreate, InstallmentPurchaseOut

router = APIRouter()


def _add_months(d: date, months: int) -> date:
    import calendar
    month = d.month - 1 + months
    year = d.year + month // 12
    month = month % 12 + 1
    max_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(d.day, max_day))


async def _generate_transactions(ip: InstallmentPurchase, user_id: int, db: AsyncSession):
    source_tag = f"installment_{ip.id}"
    installment_amount = (ip.total_amount / ip.installment_count).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    for i in range(ip.installment_count):
        tx_date = _add_months(ip.start_date, i)
        tx = Transaction(
            user_id=user_id,
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
async def list_installments(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(InstallmentPurchase)
        .options(selectinload(InstallmentPurchase.category))
        .where(InstallmentPurchase.user_id == current_user.id)
        .order_by(InstallmentPurchase.created_at.desc())
    )
    return result.scalars().all()


@router.post("/", response_model=InstallmentPurchaseOut, status_code=201)
async def create_installment(
    data: InstallmentPurchaseCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ip = InstallmentPurchase(user_id=current_user.id, **data.model_dump())
    db.add(ip)
    await db.flush()
    await _generate_transactions(ip, current_user.id, db)
    await db.commit()
    await db.refresh(ip, ["category"])
    return ip


@router.delete("/{purchase_id}", status_code=204)
async def delete_installment(
    purchase_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ip = await db.get(InstallmentPurchase, purchase_id)
    if not ip or ip.user_id != current_user.id:
        raise HTTPException(404, "Installment purchase not found")
    source_tag = f"installment_{ip.id}"
    await db.execute(
        delete(Transaction).where(
            Transaction.source == source_tag,
            Transaction.user_id == current_user.id,
        )
    )
    await db.delete(ip)
    await db.commit()
