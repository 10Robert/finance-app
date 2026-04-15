import asyncio
from datetime import date, timedelta
from decimal import Decimal
import random

from sqlalchemy import select, func

from app.database import engine, async_session, Base
from app.models import Transaction, Category, SalaryConfig, Income
from app.services.salary_calculator import calculate_net_salary


async def seed():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as session:
        # Check if already seeded
        count = (await session.execute(select(func.count(Transaction.id)))).scalar_one()
        if count > 5:
            print("Data already seeded.")
            return

        # Get category IDs
        cats = (await session.execute(select(Category))).scalars().all()
        cat_map = {c.name: c.id for c in cats}

        today = date.today()

        # --- Recurring Transactions ---
        recurring = [
            {"description": "Aluguel Apartamento", "amount": Decimal("1800.00"), "category": "Aluguel", "day": 5, "icon": "home"},
            {"description": "Netflix Standard", "amount": Decimal("39.90"), "category": "Assinaturas", "day": 12, "icon": "tv"},
            {"description": "Conta de Luz - ENEL", "amount": Decimal("245.30"), "category": "Utilidades", "day": 15, "icon": "bolt"},
            {"description": "Internet Vivo Fiber", "amount": Decimal("120.00"), "category": "Utilidades", "day": 20, "icon": "wifi"},
            {"description": "Plano Tim", "amount": Decimal("69.90"), "category": "Utilidades", "day": 10, "icon": "phone_android"},
            {"description": "Spotify Premium", "amount": Decimal("21.90"), "category": "Assinaturas", "day": 12, "icon": "music_note"},
        ]

        for i in range(6):
            m = today.month - i
            y = today.year
            while m <= 0:
                m += 12
                y -= 1

            for rec in recurring:
                day = min(rec["day"], 28)
                txn = Transaction(
                    date=date(y, m, day),
                    description=rec["description"],
                    amount=-rec["amount"],
                    type="expense",
                    category_id=cat_map.get(rec["category"]),
                    is_recurring=True,
                    recurring_day=rec["day"],
                    icon=rec["icon"],
                )
                session.add(txn)

        # --- One-time Transactions ---
        one_time_templates = [
            {"description": "Restaurante Kyoto", "amount": Decimal("145.00"), "category": "Restaurantes", "icon": "restaurant"},
            {"description": "Posto Shell", "amount": Decimal("220.00"), "category": "Transporte", "icon": "local_gas_station"},
            {"description": "Farmácia Droga Raia", "amount": Decimal("89.90"), "category": "Saúde", "icon": "medical_services"},
            {"description": "Amazon Brazil", "amount": Decimal("112.50"), "category": "Outros Despesa", "icon": "shopping_bag"},
            {"description": "Supermercado Pão de Açúcar", "amount": Decimal("387.60"), "category": "Alimentação", "icon": "shopping_cart"},
            {"description": "Uber", "amount": Decimal("45.00"), "category": "Transporte", "icon": "directions_car"},
            {"description": "Consulta Médica", "amount": Decimal("250.00"), "category": "Saúde", "icon": "local_hospital"},
            {"description": "Livraria Cultura", "amount": Decimal("78.50"), "category": "Educação", "icon": "menu_book"},
            {"description": "Cinema", "amount": Decimal("65.00"), "category": "Entretenimento", "icon": "movie"},
            {"description": "Padaria Real", "amount": Decimal("32.40"), "category": "Alimentação", "icon": "bakery_dining"},
        ]

        random.seed(42)
        for i in range(6):
            m = today.month - i
            y = today.year
            while m <= 0:
                m += 12
                y -= 1

            # Add 3-5 one-time transactions per month
            chosen = random.sample(one_time_templates, min(random.randint(3, 5), len(one_time_templates)))
            for j, tmpl in enumerate(chosen):
                day = random.randint(1, 28)
                variation = Decimal(str(random.uniform(0.8, 1.2))).quantize(Decimal("0.01"))
                txn = Transaction(
                    date=date(y, m, day),
                    description=tmpl["description"],
                    amount=-(tmpl["amount"] * variation).quantize(Decimal("0.01")),
                    type="expense",
                    category_id=cat_map.get(tmpl["category"]),
                    is_recurring=False,
                    icon=tmpl["icon"],
                )
                session.add(txn)

        # --- Salary Config ---
        existing_config = (await session.execute(select(SalaryConfig).limit(1))).scalar_one_or_none()
        if not existing_config:
            config = SalaryConfig(
                base_salary=Decimal("6500.00"),
                overtime_hour_rate=Decimal("29.55"),
                meal_allowance=Decimal("800.00"),
                health_plan_deduction=Decimal("120.00"),
            )
            session.add(config)

        # --- Income History ---
        # Usa anos com tabelas INSS/IRRF configuradas (2024-2026).
        income_data = [
            {"month": 1, "year": 2026, "overtime_hours": Decimal("0"), "multiplier": Decimal("0.30"), "bonus": Decimal("0"), "discounts": Decimal("0")},
            {"month": 2, "year": 2026, "overtime_hours": Decimal("0"), "multiplier": Decimal("0.30"), "bonus": Decimal("0"), "discounts": Decimal("0")},
            {"month": 3, "year": 2026, "overtime_hours": Decimal("10"), "multiplier": Decimal("0.30"), "bonus": Decimal("500"), "discounts": Decimal("0")},
        ]

        for data in income_data:
            result = calculate_net_salary(
                base_salary=Decimal("6500.00"),
                meal_allowance=Decimal("800.00"),
                health_plan_deduction=Decimal("120.00"),
                overtime_hours=data["overtime_hours"],
                overtime_multiplier=data["multiplier"],
                monthly_bonus=data["bonus"],
                discounts_absences=data["discounts"],
                reference_year=data["year"],
                reference_month=data["month"],
            )
            income = Income(
                reference_month=data["month"],
                reference_year=data["year"],
                **result,
            )
            session.add(income)

        await session.commit()
        print("Seed data created successfully!")


if __name__ == "__main__":
    asyncio.run(seed())
