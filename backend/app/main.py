import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from sqlalchemy import text

from app.database import engine, Base
from app.routers import transactions, categories, imports, dashboard, salary, incomes, monthly_entries, fixed_expenses, installments, credit_cards

# Make app logger output visible alongside uvicorn's
logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")
logging.getLogger("app").setLevel(logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Idempotent column migrations: bring legacy databases (created before
        # v1.1/v1.2) up to the current model schema. create_all() only creates
        # missing tables, never adds new columns to existing tables.
        await conn.execute(text("""
            ALTER TABLE transactions
                ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT false,
                ADD COLUMN IF NOT EXISTS recurring_day INTEGER,
                ADD COLUMN IF NOT EXISTS icon VARCHAR(50) NOT NULL DEFAULT 'receipt_long',
                ADD COLUMN IF NOT EXISTS source VARCHAR(32)
        """))
        await conn.execute(text("""
            ALTER TABLE salary_configs
                ADD COLUMN IF NOT EXISTS meal_allowance NUMERIC(12,2) NOT NULL DEFAULT 0,
                ADD COLUMN IF NOT EXISTS health_plan_deduction NUMERIC(12,2) NOT NULL DEFAULT 0,
                ADD COLUMN IF NOT EXISTS dental_plan_deduction NUMERIC(12,2) NOT NULL DEFAULT 0,
                ADD COLUMN IF NOT EXISTS transport_voucher_enabled BOOLEAN NOT NULL DEFAULT false,
                ADD COLUMN IF NOT EXISTS transport_voucher_percent NUMERIC(5,2) NOT NULL DEFAULT 6.00,
                ADD COLUMN IF NOT EXISTS fgts_balance NUMERIC(12,2) NOT NULL DEFAULT 0
        """))
        await conn.execute(text("""
            ALTER TABLE salary_configs
                ADD COLUMN IF NOT EXISTS reference_month INTEGER,
                ADD COLUMN IF NOT EXISTS reference_year INTEGER,
                ADD COLUMN IF NOT EXISTS coparticipation NUMERIC(12,2) NOT NULL DEFAULT 0
        """))
        # Create unique constraint if it doesn't exist yet
        await conn.execute(text("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'uq_salary_config_month_year'
                ) THEN
                    ALTER TABLE salary_configs
                        ADD CONSTRAINT uq_salary_config_month_year
                        UNIQUE (reference_month, reference_year);
                END IF;
            END$$
        """))
        await conn.execute(text("""
            ALTER TABLE incomes
                ADD COLUMN IF NOT EXISTS dsr_value NUMERIC(12,2) NOT NULL DEFAULT 0
        """))
        # Normalize legacy negative amounts: imports stored expenses as
        # negatives, but the canonical convention is positive amount + `type`.
        await conn.execute(text("""
            UPDATE transactions SET amount = ABS(amount) WHERE amount < 0
        """))
        await conn.execute(text("""
            UPDATE staged_transactions SET amount = ABS(amount) WHERE amount < 0
        """))
    yield


app = FastAPI(title="Finance App", version="1.0.0", lifespan=lifespan)

app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(categories.router, prefix="/api/categories", tags=["categories"])
app.include_router(transactions.router, prefix="/api/transactions", tags=["transactions"])
app.include_router(imports.router, prefix="/api/imports", tags=["imports"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["dashboard"])
app.include_router(salary.router, prefix="/api/salary", tags=["salary"])
app.include_router(incomes.router, prefix="/api/incomes", tags=["incomes"])
app.include_router(monthly_entries.router, prefix="/api/monthly-entries", tags=["monthly-entries"])
app.include_router(fixed_expenses.router, prefix="/api/fixed-expenses", tags=["fixed-expenses"])
app.include_router(installments.router, prefix="/api/installments", tags=["installments"])
app.include_router(credit_cards.router, prefix="/api/credit-cards", tags=["credit-cards"])


@app.get("/api/health")
async def health():
    return {"status": "ok"}
