from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models import MonthlySalarySnapshot, Transaction


@pytest.mark.asyncio
async def test_monthly_summary_creates_frozen_snapshot_and_global_update_does_not_rewrite_past(
    client,
    session_factory,
):
    create_config = await client.post(
        "/api/salary/config",
        json={
            "base_salary": 5000,
            "overtime_hour_rate": 30,
            "meal_allowance": 600,
            "health_plan_deduction": 150,
            "dental_plan_deduction": 50,
            "transport_voucher_enabled": True,
            "transport_voucher_percent": 6,
            "fgts_balance": 1000,
        },
    )
    assert create_config.status_code == 200

    summary = await client.get("/api/monthly-entries/summary", params={"month": 3, "year": 2026})
    assert summary.status_code == 200
    payload = summary.json()
    assert Decimal(payload["base_salary_contractual"]) == Decimal("5000.00")
    assert Decimal(payload["base_salary_due"]) == Decimal("5000.00")

    update_global = await client.put("/api/salary/config", json={"base_salary": 6500})
    assert update_global.status_code == 200

    async with session_factory() as session:
        snapshot = (
            await session.execute(
                select(MonthlySalarySnapshot).where(
                    MonthlySalarySnapshot.reference_month == 3,
                    MonthlySalarySnapshot.reference_year == 2026,
                )
            )
        ).scalar_one()
        assert snapshot.base_salary == Decimal("5000.00")


@pytest.mark.asyncio
async def test_monthly_override_changes_only_selected_month(client, session_factory, salary_config):
    summary_before = await client.get("/api/monthly-entries/summary", params={"month": 3, "year": 2026})
    assert summary_before.status_code == 200

    update_month = await client.put(
        "/api/salary/monthly-config",
        params={"month": 3, "year": 2026},
        json={"base_salary": 4200},
    )
    assert update_month.status_code == 200
    assert Decimal(update_month.json()["base_salary"]) == Decimal("4200.00")

    summary_after = await client.get("/api/monthly-entries/summary", params={"month": 3, "year": 2026})
    assert summary_after.status_code == 200
    assert Decimal(summary_after.json()["base_salary_contractual"]) == Decimal("4200.00")

    current_month = await client.get("/api/monthly-entries/summary", params={"month": 4, "year": 2026})
    assert current_month.status_code == 200
    assert Decimal(current_month.json()["base_salary_contractual"]) == Decimal("5000.00")


@pytest.mark.asyncio
async def test_late_and_absence_reduce_taxable_base_and_net_salary(client, salary_config):
    create_late = await client.post(
        "/api/monthly-entries/",
        json={
            "reference_month": 3,
            "reference_year": 2026,
            "entry_type": "late",
            "hours": 4.03,
            "description": "Atrasos",
        },
    )
    create_absence = await client.post(
        "/api/monthly-entries/",
        json={
            "reference_month": 3,
            "reference_year": 2026,
            "entry_type": "absence",
            "days": 1,
            "description": "Atestado",
        },
    )

    assert create_late.status_code == 201
    assert create_absence.status_code == 201

    summary = await client.get("/api/monthly-entries/summary", params={"month": 3, "year": 2026})
    payload = summary.json()

    assert Decimal(payload["late_value"]) == Decimal("91.59")
    assert Decimal(payload["absence_value"]) == Decimal("166.67")
    assert Decimal(payload["base_salary_due"]) == Decimal("4741.74")
    assert Decimal(payload["inss"]) < Decimal("579.38")
    assert Decimal(payload["irrf"]) < Decimal("180.25")


@pytest.mark.asyncio
async def test_sync_uses_overtime_hour_rate_and_updates_existing_auto_transaction(client, salary_config, session_factory):
    entry_response = await client.post(
        "/api/monthly-entries/",
        json={
            "reference_month": 3,
            "reference_year": 2026,
            "entry_type": "overtime",
            "hours": 2,
            "overtime_multiplier": 0.7,
            "description": "Horas extras",
        },
    )
    assert entry_response.status_code == 201

    async with session_factory() as session:
        tx = (
            await session.execute(
                select(Transaction).where(
                    Transaction.source == "salary_auto",
                    Transaction.date == "2026-03-05",
                )
            )
        ).scalar_one()
        assert tx.amount > Decimal("0")
        assert tx.icon == "payments"
        assert tx.type == "income"

    update_month = await client.put(
        "/api/salary/monthly-config",
        params={"month": 3, "year": 2026},
        json={"base_salary": 5200},
    )
    assert update_month.status_code == 200

    async with session_factory() as session:
        tx = (
            await session.execute(
                select(Transaction).where(
                    Transaction.source == "salary_auto",
                    Transaction.date == "2026-03-05",
                )
            )
        ).scalar_one()
        assert tx.description == "Salário líquido 03/2026"
        assert tx.icon == "payments"
        assert tx.type == "income"
