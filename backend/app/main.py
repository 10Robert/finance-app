import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from sqlalchemy import text

from app.auth import hash_password
from app.database import engine, Base
from app.routers import (
    auth,
    categories,
    credit_cards,
    dashboard,
    fixed_expenses,
    imports,
    incomes,
    installments,
    monthly_entries,
    salary,
    transactions,
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")
logging.getLogger("app").setLevel(logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Legacy column migrations (pre-v1.1/v1.2)
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
        await conn.execute(text("""
            ALTER TABLE incomes
                ADD COLUMN IF NOT EXISTS dsr_value NUMERIC(12,2) NOT NULL DEFAULT 0
        """))
        await conn.execute(text("UPDATE transactions SET amount = ABS(amount) WHERE amount < 0"))
        await conn.execute(text("UPDATE staged_transactions SET amount = ABS(amount) WHERE amount < 0"))

        # --- Multi-tenant migration ---
        # 1) Ensure a default user exists to own any legacy rows.
        default_user_id = (await conn.execute(text("SELECT id FROM users ORDER BY id LIMIT 1"))).scalar()
        if default_user_id is None:
            default_password = hash_password("changeme123")
            default_user_id = (await conn.execute(text(
                """
                INSERT INTO users (email, name, password_hash, is_active)
                VALUES ('owner@finance.local', 'Owner', :pw, true)
                RETURNING id
                """
            ), {"pw": default_password})).scalar()
            logging.getLogger("app").info(
                "Default user created (email=owner@finance.local, password=changeme123) — change it after first login."
            )

        # 2) Add user_id columns to legacy tables (nullable), backfill, then enforce NOT NULL.
        owned_tables = [
            "categories",
            "transactions",
            "bank_imports",
            "salary_configs",
            "monthly_entries",
            "fixed_expenses",
            "installment_purchases",
            "credit_cards",
            "category_rules",
            "incomes",
        ]
        for tbl in owned_tables:
            await conn.execute(text(f"ALTER TABLE {tbl} ADD COLUMN IF NOT EXISTS user_id INTEGER"))
            await conn.execute(text(f"UPDATE {tbl} SET user_id = :uid WHERE user_id IS NULL"), {"uid": default_user_id})
            await conn.execute(text(f"ALTER TABLE {tbl} ALTER COLUMN user_id SET NOT NULL"))
            # Best-effort FK (idempotent)
            await conn.execute(text(f"""
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint WHERE conname = 'fk_{tbl}_user'
                    ) THEN
                        ALTER TABLE {tbl}
                            ADD CONSTRAINT fk_{tbl}_user
                            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
                    END IF;
                END$$
            """))

        # 3) Replace old per-table unique constraints that now need user_id scoping.
        await conn.execute(text("""
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'categories_name_key') THEN
                    ALTER TABLE categories DROP CONSTRAINT categories_name_key;
                END IF;
                IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_salary_config_month_year') THEN
                    ALTER TABLE salary_configs DROP CONSTRAINT uq_salary_config_month_year;
                END IF;
                IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_income_month_year') THEN
                    ALTER TABLE incomes DROP CONSTRAINT uq_income_month_year;
                END IF;
                IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_category_rule_pattern_type') THEN
                    ALTER TABLE category_rules DROP CONSTRAINT uq_category_rule_pattern_type;
                END IF;
            END$$
        """))
    yield


app = FastAPI(title="Finance App", version="2.0.0", lifespan=lifespan)

app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
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
