from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, case, extract, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import Transaction, Category
from app.schemas import (
    DashboardSummary,
    BalanceOut,
    MonthlyRevenueOut,
    SpendingFlowOut,
    SpendingFlowPoint,
    SpendingByCategory,
    MonthlyTrend,
    RecentTransactionOut,
    ChartMonthOut,
    CategoryProgressOut,
    TransactionGroupedOut,
    TransactionOut,
    ExpensesChartBar,
    ExpensesChartOut,
)

router = APIRouter()

CATEGORY_ICONS = {
    "Alimentação": "shopping_cart",
    "Aluguel": "home",
    "Utilidades": "bolt",
    "Transporte": "directions_car",
    "Restaurantes": "restaurant",
    "Entretenimento": "movie",
    "Saúde": "fitness_center",
    "Seguros": "shield",
    "Roupas": "checkroom",
    "Educação": "school",
    "Assinaturas": "subscriptions",
    "Cuidados Pessoais": "spa",
    "Presentes": "redeem",
    "Viagem": "flight",
    "Taxas e Tarifas": "account_balance",
    "Salário": "work",
    "Freelance": "laptop",
    "Investimentos": "trending_up",
    "Reembolso": "replay",
    "Transferência Recebida": "swap_horiz",
}

CATEGORY_COLORS = [
    "#a78bfa", "#34d399", "#71717a", "#ef4444", "#f59e0b",
    "#3b82f6", "#ec4899", "#8b5cf6", "#14b8a6", "#f97316",
]


def _get_month_range(year: int, month: int):
    start = date(year, month, 1)
    if month == 12:
        end = date(year + 1, 1, 1) - timedelta(days=1)
    else:
        end = date(year, month + 1, 1) - timedelta(days=1)
    return start, end


def _get_year_range(year: int):
    return date(year, 1, 1), date(year, 12, 31)


# GET /api/dashboard/balance
@router.get("/balance", response_model=BalanceOut)
async def get_balance(
    year: int = Query(None),
    month: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
):
    if start_date and end_date:
        # Custom date range — use directly
        start, end = start_date, end_date
        delta = (end_date - start_date).days
        prev_end = start_date - timedelta(days=1)
        prev_start = prev_end - timedelta(days=delta)
    elif year and month:
        start, end = _get_month_range(year, month)
        if month == 1:
            prev_start, prev_end = _get_month_range(year - 1, 12)
        else:
            prev_start, prev_end = _get_month_range(year, month - 1)
    elif year:
        start, end = _get_year_range(year)
        prev_start, prev_end = _get_year_range(year - 1)
    else:
        # Default to current month
        today = date.today()
        year = today.year
        month = today.month
        start, end = _get_month_range(year, month)
        if month == 1:
            prev_start, prev_end = _get_month_range(year - 1, 12)
        else:
            prev_start, prev_end = _get_month_range(year, month - 1)

    async def _sum_period(s: date, e: date):
        q = select(
            func.coalesce(func.sum(case((Transaction.type == "income", Transaction.amount), else_=Decimal(0))), 0).label("inc"),
            func.coalesce(func.sum(case((Transaction.type == "expense", func.abs(Transaction.amount)), else_=Decimal(0))), 0).label("exp"),
        ).where(Transaction.date >= s, Transaction.date <= e)
        return (await db.execute(q)).one()

    current = await _sum_period(start, end)
    prev = await _sum_period(prev_start, prev_end)

    current_net = current.inc - current.exp
    prev_net = prev.inc - prev.exp

    variation = None
    if prev_net and prev_net != 0:
        variation = ((current_net - prev_net) / abs(prev_net) * 100).quantize(Decimal("0.1"))

    return BalanceOut(
        balance=current_net,
        income_total=current.inc,
        expense_total=current.exp,
        variation_percent=variation,
    )


# GET /api/dashboard/monthly-revenue
@router.get("/monthly-revenue", response_model=MonthlyRevenueOut)
async def get_monthly_revenue(
    year: int = Query(...),
    month: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
):
    if month:
        start, end = _get_month_range(year, month)
    else:
        start, end = _get_year_range(year)

    q = select(
        func.coalesce(func.sum(case((Transaction.type == "income", Transaction.amount), else_=Decimal(0))), 0).label("revenue"),
    ).where(Transaction.date >= start, Transaction.date <= end)
    result = (await db.execute(q)).one()

    return MonthlyRevenueOut(
        revenue=result.revenue,
        goal=None,
        goal_percent=None,
    )


# GET /api/dashboard/spending-flow
@router.get("/spending-flow", response_model=SpendingFlowOut)
async def get_spending_flow(
    year: int = Query(...),
    month: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
):
    if month:
        # Monthly: group by week segments
        start, end = _get_month_range(year, month)
        q = (
            select(
                func.to_char(Transaction.date, "DD Mon").label("label"),
                Transaction.date.label("dt"),
                func.sum(func.abs(Transaction.amount)).label("amount"),
            )
            .where(
                Transaction.type == "expense",
                Transaction.date >= start,
                Transaction.date <= end,
            )
            .group_by(Transaction.date, func.to_char(Transaction.date, "DD Mon"))
            .order_by(Transaction.date)
        )
        result = await db.execute(q)
        rows = result.all()

        # Aggregate into ~5 points spread across the month
        if not rows:
            return SpendingFlowOut(period="monthly", points=[])

        total_days = (end - start).days + 1
        segment_size = max(total_days // 5, 1)
        segments: list[SpendingFlowPoint] = []
        current_total = Decimal(0)
        seg_start = start

        for row in rows:
            day_num = (row.dt - start).days
            seg_idx = min(day_num // segment_size, 4)

            while len(segments) <= seg_idx:
                seg_date = start + timedelta(days=len(segments) * segment_size)
                segments.append(SpendingFlowPoint(
                    label=seg_date.strftime("%d %b"),
                    amount=Decimal(0),
                ))

            segments[seg_idx].amount += row.amount

        # Fill remaining segments
        while len(segments) < 5:
            seg_date = start + timedelta(days=len(segments) * segment_size)
            segments.append(SpendingFlowPoint(
                label=seg_date.strftime("%d %b"),
                amount=Decimal(0),
            ))

        return SpendingFlowOut(period="monthly", points=segments)
    else:
        # Annual: group by month
        start, end = _get_year_range(year)
        q = (
            select(
                func.to_char(Transaction.date, "Mon").label("label"),
                extract("month", Transaction.date).label("m"),
                func.sum(func.abs(Transaction.amount)).label("amount"),
            )
            .where(
                Transaction.type == "expense",
                Transaction.date >= start,
                Transaction.date <= end,
            )
            .group_by(func.to_char(Transaction.date, "Mon"), extract("month", Transaction.date))
            .order_by(extract("month", Transaction.date))
        )
        result = await db.execute(q)
        rows = result.all()
        points = [SpendingFlowPoint(label=r.label, amount=r.amount) for r in rows]
        return SpendingFlowOut(period="annual", points=points)


# GET /api/dashboard/top-categories
@router.get("/top-categories", response_model=list[SpendingByCategory])
async def top_categories(
    year: int = Query(None),
    month: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    limit: int = Query(5, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
):
    if start_date and end_date:
        start, end = start_date, end_date
    elif year and month:
        start, end = _get_month_range(year, month)
    elif year:
        start, end = _get_year_range(year)
    else:
        today = date.today()
        start, end = _get_year_range(today.year)

    q = (
        select(
            Category.name.label("category_name"),
            Category.icon.label("category_icon"),
            func.sum(func.abs(Transaction.amount)).label("total"),
        )
        .join(Category, Transaction.category_id == Category.id)
        .where(Transaction.type == "expense", Transaction.date >= start, Transaction.date <= end)
        .group_by(Category.name, Category.icon)
        .order_by(func.sum(func.abs(Transaction.amount)).desc())
        .limit(limit)
    )

    result = await db.execute(q)
    rows = result.all()
    return [
        SpendingByCategory(
            category_name=r.category_name,
            category_icon=r.category_icon,
            total=r.total,
            color=CATEGORY_COLORS[i % len(CATEGORY_COLORS)],
        )
        for i, r in enumerate(rows)
    ]


# GET /api/dashboard/recent-transactions
@router.get("/recent-transactions", response_model=list[RecentTransactionOut])
async def recent_transactions(
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    q = (
        select(Transaction)
        .options(selectinload(Transaction.category))
        .order_by(Transaction.date.desc(), Transaction.id.desc())
        .limit(limit)
    )
    result = await db.execute(q)
    txns = result.scalars().all()

    return [
        RecentTransactionOut(
            id=t.id,
            date=t.date,
            description=t.description,
            amount=t.amount,
            type=t.type,
            category_name=t.category.name if t.category else None,
            category_icon=t.category.icon if t.category else None,
            icon=CATEGORY_ICONS.get(t.category.name, "payments") if t.category else "payments",
        )
        for t in txns
    ]


# Keep existing endpoints
@router.get("/summary", response_model=DashboardSummary)
async def get_summary(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(
        func.coalesce(func.sum(case((Transaction.type == "income", Transaction.amount), else_=Decimal(0))), 0).label("income"),
        func.coalesce(func.sum(case((Transaction.type == "expense", func.abs(Transaction.amount)), else_=Decimal(0))), 0).label("expenses"),
        func.count(Transaction.id).label("count"),
    )
    if start_date:
        query = query.where(Transaction.date >= start_date)
    if end_date:
        query = query.where(Transaction.date <= end_date)

    result = (await db.execute(query)).one()
    return DashboardSummary(
        total_income=result.income,
        total_expenses=result.expenses,
        net=result.income - result.expenses,
        transaction_count=result.count,
    )


@router.get("/spending-by-category", response_model=list[SpendingByCategory])
async def spending_by_category(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
):
    q = (
        select(
            Category.name.label("category_name"),
            Category.icon.label("category_icon"),
            func.sum(func.abs(Transaction.amount)).label("total"),
        )
        .join(Category, Transaction.category_id == Category.id)
        .where(Transaction.type == "expense")
        .group_by(Category.name, Category.icon)
        .order_by(func.sum(func.abs(Transaction.amount)).desc())
    )
    if start_date:
        q = q.where(Transaction.date >= start_date)
    if end_date:
        q = q.where(Transaction.date <= end_date)

    result = await db.execute(q)
    return [
        SpendingByCategory(category_name=r.category_name, category_icon=r.category_icon, total=r.total, color=None)
        for r in result.all()
    ]


@router.get("/monthly-trends", response_model=list[MonthlyTrend])
async def monthly_trends(
    months: int = Query(12, ge=1, le=24),
    db: AsyncSession = Depends(get_db),
):
    q = (
        select(
            func.to_char(Transaction.date, "YYYY-MM").label("month"),
            func.coalesce(func.sum(case((Transaction.type == "income", Transaction.amount), else_=Decimal(0))), 0).label("income"),
            func.coalesce(func.sum(case((Transaction.type == "expense", func.abs(Transaction.amount)), else_=Decimal(0))), 0).label("expenses"),
        )
        .group_by(func.to_char(Transaction.date, "YYYY-MM"))
        .order_by(func.to_char(Transaction.date, "YYYY-MM").desc())
        .limit(months)
    )
    result = await db.execute(q)
    rows = result.all()
    return [
        MonthlyTrend(month=r.month, income=r.income, expenses=r.expenses, net=r.income - r.expenses)
        for r in reversed(rows)
    ]


# --- New Dashboard Endpoints ---

MONTH_LABELS_PT = {
    1: "Jan", 2: "Fev", 3: "Mar", 4: "Abr", 5: "Mai", 6: "Jun",
    7: "Jul", 8: "Ago", 9: "Set", 10: "Out", 11: "Nov", 12: "Dez",
}


@router.get("/chart-6months", response_model=list[ChartMonthOut])
async def chart_6_months(db: AsyncSession = Depends(get_db)):
    today = date.today()

    # Window: first day of the month 5 months ago.
    y0, m0 = today.year, today.month - 5
    while m0 <= 0:
        m0 += 12
        y0 -= 1
    window_start = date(y0, m0, 1)

    q = (
        select(
            extract("year", Transaction.date).label("y"),
            extract("month", Transaction.date).label("m"),
            func.coalesce(func.sum(func.abs(Transaction.amount)), Decimal(0)).label("total"),
        )
        .where(Transaction.type == "expense", Transaction.date >= window_start)
        .group_by("y", "m")
    )
    rows = (await db.execute(q)).all()
    totals_by_period = {(int(r.y), int(r.m)): r.total for r in rows}

    results: list[ChartMonthOut] = []
    for i in range(5, -1, -1):
        m = today.month - i
        y = today.year
        while m <= 0:
            m += 12
            y -= 1
        results.append(ChartMonthOut(
            month_label=MONTH_LABELS_PT[m],
            total=totals_by_period.get((y, m), Decimal(0)),
        ))
    return results


@router.get("/category-progress", response_model=list[CategoryProgressOut])
async def category_progress(
    year: Optional[int] = None,
    month: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
):
    today = date.today()
    y = year or today.year
    m = month or today.month
    start, end = _get_month_range(y, m)

    q = (
        select(
            Category.name.label("name"),
            func.sum(func.abs(Transaction.amount)).label("total"),
        )
        .join(Category, Transaction.category_id == Category.id)
        .where(Transaction.type == "expense", Transaction.date >= start, Transaction.date <= end)
        .group_by(Category.name)
        .order_by(func.sum(func.abs(Transaction.amount)).desc())
    )
    result = await db.execute(q)
    rows = result.all()

    grand_total = sum(r.total for r in rows) if rows else Decimal("1")
    return [
        CategoryProgressOut(
            name=r.name,
            total=r.total,
            percentage=(r.total / grand_total * 100).quantize(Decimal("0.1")),
        )
        for r in rows
    ]


@router.get("/transactions-grouped", response_model=TransactionGroupedOut)
async def transactions_grouped(
    year: Optional[int] = None,
    month: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
):
    if start_date and end_date:
        start, end = start_date, end_date
    else:
        today = date.today()
        y = year or today.year
        m = month or today.month
        start, end = _get_month_range(y, m)

    q = (
        select(Transaction)
        .options(selectinload(Transaction.category))
        .where(Transaction.type == "expense", Transaction.date >= start, Transaction.date <= end)
        .order_by(Transaction.date.desc())
    )
    result = await db.execute(q)
    txns = result.scalars().all()

    one_time: list[Transaction] = []
    recurring: list[Transaction] = []
    for t in txns:
        if t.is_recurring or (t.source or "").startswith("fixed_"):
            recurring.append(t)
        else:
            one_time.append(t)

    return TransactionGroupedOut(one_time=one_time, recurring=recurring)


# --- Expenses Chart (stacked bar) ---
_INC_SUM = func.coalesce(
    func.sum(case((Transaction.type == "income", Transaction.amount), else_=Decimal(0))),
    Decimal(0),
).label("inc")
_EXP_SUM = func.coalesce(
    func.sum(case((Transaction.type == "expense", func.abs(Transaction.amount)), else_=Decimal(0))),
    Decimal(0),
).label("exp")


@router.get("/expenses-chart", response_model=ExpensesChartOut)
async def expenses_chart(
    mode: str = Query("annual"),  # "annual", "monthly", "weekly"
    year: Optional[int] = None,
    month: Optional[int] = None,
    week_start: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
):
    """Stacked bar chart data: each bar has income, expenses, net, accumulated."""
    today = date.today()
    bars: list[ExpensesChartBar] = []

    if mode == "monthly" and year and month:
        # 4 weekly-ish segments — single query, bucket via CASE.
        start, end = _get_month_range(year, month)
        import calendar
        num_days = calendar.monthrange(year, month)[1]
        seg_size = max(num_days // 4, 7)

        seg1_end = start + timedelta(days=seg_size - 1)
        seg2_end = start + timedelta(days=2 * seg_size - 1)
        seg3_end = start + timedelta(days=3 * seg_size - 1)

        seg_expr = case(
            (Transaction.date <= seg1_end, 0),
            (Transaction.date <= seg2_end, 1),
            (Transaction.date <= seg3_end, 2),
            else_=3,
        ).label("seg")

        q = (
            select(seg_expr, _INC_SUM, _EXP_SUM)
            .where(Transaction.date >= start, Transaction.date <= end)
            .group_by("seg")
        )
        rows = (await db.execute(q)).all()
        agg = {int(r.seg): (r.inc, r.exp) for r in rows}

        accumulated = Decimal(0)
        for seg_i in range(4):
            inc, exp = agg.get(seg_i, (Decimal(0), Decimal(0)))
            net = inc - exp
            accumulated += net
            bars.append(ExpensesChartBar(
                label=f"Sem {seg_i + 1}", income=inc, expenses=exp, net=net, accumulated=accumulated,
            ))

    elif mode == "weekly" and week_start:
        # 7 daily bars — single query grouped by date.
        week_end = week_start + timedelta(days=6)
        q = (
            select(Transaction.date.label("d"), _INC_SUM, _EXP_SUM)
            .where(Transaction.date >= week_start, Transaction.date <= week_end)
            .group_by(Transaction.date)
        )
        rows = (await db.execute(q)).all()
        agg = {r.d: (r.inc, r.exp) for r in rows}

        DAYS_PT = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]
        accumulated = Decimal(0)
        for i in range(7):
            d = week_start + timedelta(days=i)
            inc, exp = agg.get(d, (Decimal(0), Decimal(0)))
            net = inc - exp
            accumulated += net
            bars.append(ExpensesChartBar(
                label=DAYS_PT[i], income=inc, expenses=exp, net=net, accumulated=accumulated,
            ))

    else:
        # Annual: 12 monthly bars — single query grouped by month.
        y = year or today.year
        year_start, year_end = _get_year_range(y)
        q = (
            select(extract("month", Transaction.date).label("m"), _INC_SUM, _EXP_SUM)
            .where(Transaction.date >= year_start, Transaction.date <= year_end)
            .group_by("m")
        )
        rows = (await db.execute(q)).all()
        agg = {int(r.m): (r.inc, r.exp) for r in rows}

        accumulated = Decimal(0)
        for m in range(1, 13):
            inc, exp = agg.get(m, (Decimal(0), Decimal(0)))
            net = inc - exp
            accumulated += net
            bars.append(ExpensesChartBar(
                label=MONTH_LABELS_PT[m], income=inc, expenses=exp, net=net, accumulated=accumulated,
            ))

    total_expenses = sum((b.expenses for b in bars), Decimal(0))
    num_bars = len(bars) or 1
    monthly_average = total_expenses / num_bars
    highest = max(bars, key=lambda b: b.expenses) if bars else None

    return ExpensesChartOut(
        mode=mode,
        bars=bars,
        total_expenses=total_expenses,
        monthly_average=monthly_average.quantize(Decimal("0.01")),
        highest_label=highest.label if highest else "",
    )


# --- Category Transactions (for pie chart drill-down) ---
@router.get("/category-transactions", response_model=list[TransactionOut])
async def category_transactions(
    category_name: str = Query(...),
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    year: Optional[int] = None,
    month: Optional[int] = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """Return expense transactions for a given category in a date range (paginated)."""
    if start_date and end_date:
        start, end = start_date, end_date
    else:
        today = date.today()
        y = year or today.year
        m = month or today.month
        start, end = _get_month_range(y, m)

    q = (
        select(Transaction)
        .options(selectinload(Transaction.category))
        .join(Category, Transaction.category_id == Category.id)
        .where(
            Category.name == category_name,
            Transaction.type == "expense",
            Transaction.date >= start,
            Transaction.date <= end,
        )
        .order_by(Transaction.date.desc())
        .limit(limit)
        .offset(offset)
    )
    result = await db.execute(q)
    return result.scalars().all()
