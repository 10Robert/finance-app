from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Income, SalaryConfig, User
from app.schemas import IncomeCalculateRequest, IncomeOut, IncomeLaunchResponse
from app.services.salary_calculator import calculate_net_salary

router = APIRouter()


async def _get_salary_config(db: AsyncSession, user_id: int) -> SalaryConfig:
    result = await db.execute(
        select(SalaryConfig)
        .options(selectinload(SalaryConfig.discounts))
        .where(SalaryConfig.user_id == user_id)
        .order_by(SalaryConfig.id.desc())
        .limit(1)
    )
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Salary config not found. Configure your salary first.")
    return config


@router.post("/calculate", response_model=IncomeLaunchResponse)
async def calculate_income(
    data: IncomeCalculateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    config = await _get_salary_config(db, current_user.id)
    result = calculate_net_salary(
        base_salary=config.base_salary,
        meal_allowance=config.meal_allowance,
        health_plan_deduction=config.health_plan_deduction,
        overtime_hours=data.overtime_hours,
        overtime_multiplier=data.overtime_multiplier,
        monthly_bonus=data.monthly_bonus,
        discounts_absences=data.discounts_absences,
        reference_year=data.reference_year,
        reference_month=data.reference_month,
    )
    return IncomeLaunchResponse(
        id=0,
        reference_month=data.reference_month,
        reference_year=data.reference_year,
        **result,
    )


@router.post("/launch", response_model=IncomeOut)
async def launch_income(
    data: IncomeCalculateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    config = await _get_salary_config(db, current_user.id)
    result = calculate_net_salary(
        base_salary=config.base_salary,
        meal_allowance=config.meal_allowance,
        health_plan_deduction=config.health_plan_deduction,
        overtime_hours=data.overtime_hours,
        overtime_multiplier=data.overtime_multiplier,
        monthly_bonus=data.monthly_bonus,
        discounts_absences=data.discounts_absences,
        reference_year=data.reference_year,
        reference_month=data.reference_month,
    )

    existing = await db.execute(
        select(Income).where(
            Income.user_id == current_user.id,
            Income.reference_month == data.reference_month,
            Income.reference_year == data.reference_year,
        )
    )
    income = existing.scalar_one_or_none()

    if income:
        for key, value in result.items():
            setattr(income, key, value)
        income.reference_month = data.reference_month
        income.reference_year = data.reference_year
    else:
        income = Income(
            user_id=current_user.id,
            reference_month=data.reference_month,
            reference_year=data.reference_year,
            **result,
        )
        db.add(income)

    await db.commit()
    await db.refresh(income)
    return income


@router.get("/", response_model=list[IncomeOut])
async def list_incomes(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Income)
        .where(Income.user_id == current_user.id)
        .order_by(Income.reference_year.desc(), Income.reference_month.desc())
    )
    return result.scalars().all()


@router.get("/{income_id}", response_model=IncomeOut)
async def get_income(
    income_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    income = await db.get(Income, income_id)
    if not income or income.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Income not found")
    return income


@router.delete("/{income_id}", status_code=204)
async def delete_income(
    income_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    income = await db.get(Income, income_id)
    if not income or income.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Income not found")
    await db.delete(income)
    await db.commit()
