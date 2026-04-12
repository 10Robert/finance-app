from decimal import Decimal

import pytest

from app.services.salary_calculator import calculate_net_salary


@pytest.mark.asyncio
async def test_calculate_income_returns_404_without_salary_config(client: object):
    response = await client.post(
        "/api/incomes/calculate",
        json={
            "reference_month": 4,
            "reference_year": 2026,
            "overtime_hours": 4,
            "overtime_multiplier": 0.3,
            "monthly_bonus": 100,
            "discounts_absences": 0,
        },
    )

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_calculate_income_returns_preview_without_persisting(client: object, salary_config):
    response = await client.post(
        "/api/incomes/calculate",
        json={
            "reference_month": 4,
            "reference_year": 2026,
            "overtime_hours": 8,
            "overtime_multiplier": 0.3,
            "monthly_bonus": 200,
            "discounts_absences": 50,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    expected = calculate_net_salary(
        base_salary=Decimal("5000.00"),
        meal_allowance=Decimal("600.00"),
        health_plan_deduction=Decimal("150.00"),
        overtime_hours=Decimal("8"),
        overtime_multiplier=Decimal("0.30"),
        monthly_bonus=Decimal("200.00"),
        discounts_absences=Decimal("50.00"),
    )
    assert payload["id"] == 0
    assert payload["reference_month"] == 4
    assert Decimal(payload["net_salary"]) == expected["net_salary"]

    list_response = await client.get("/api/incomes/")
    assert list_response.status_code == 200
    assert list_response.json() == []


@pytest.mark.asyncio
async def test_launch_income_creates_and_updates_same_month_year(client: object, salary_config):
    first_launch = await client.post(
        "/api/incomes/launch",
        json={
            "reference_month": 4,
            "reference_year": 2026,
            "overtime_hours": 8,
            "overtime_multiplier": 0.3,
            "monthly_bonus": 200,
            "discounts_absences": 50,
        },
    )
    assert first_launch.status_code == 200
    first_payload = first_launch.json()

    second_launch = await client.post(
        "/api/incomes/launch",
        json={
            "reference_month": 4,
            "reference_year": 2026,
            "overtime_hours": 10,
            "overtime_multiplier": 0.5,
            "monthly_bonus": 300,
            "discounts_absences": 0,
        },
    )
    assert second_launch.status_code == 200
    second_payload = second_launch.json()
    expected = calculate_net_salary(
        base_salary=Decimal("5000.00"),
        meal_allowance=Decimal("600.00"),
        health_plan_deduction=Decimal("150.00"),
        overtime_hours=Decimal("10"),
        overtime_multiplier=Decimal("0.50"),
        monthly_bonus=Decimal("300.00"),
        discounts_absences=Decimal("0.00"),
    )

    assert second_payload["id"] == first_payload["id"]
    assert Decimal(second_payload["overtime_value"]) == expected["overtime_value"]
    assert Decimal(second_payload["net_salary"]) == expected["net_salary"]

    list_response = await client.get("/api/incomes/")
    assert list_response.status_code == 200
    incomes = list_response.json()
    assert len(incomes) == 1
    assert incomes[0]["id"] == first_payload["id"]


@pytest.mark.asyncio
async def test_list_get_and_delete_incomes(client: object, salary_config):
    older = await client.post(
        "/api/incomes/launch",
        json={
            "reference_month": 3,
            "reference_year": 2026,
            "overtime_hours": 2,
            "overtime_multiplier": 0.3,
            "monthly_bonus": 0,
            "discounts_absences": 0,
        },
    )
    newer = await client.post(
        "/api/incomes/launch",
        json={
            "reference_month": 4,
            "reference_year": 2026,
            "overtime_hours": 4,
            "overtime_multiplier": 0.7,
            "monthly_bonus": 150,
            "discounts_absences": 20,
        },
    )

    assert older.status_code == 200
    assert newer.status_code == 200

    list_response = await client.get("/api/incomes/")
    assert list_response.status_code == 200
    incomes = list_response.json()
    assert [income["reference_month"] for income in incomes] == [4, 3]

    income_id = newer.json()["id"]
    get_response = await client.get(f"/api/incomes/{income_id}")
    assert get_response.status_code == 200
    assert get_response.json()["reference_month"] == 4

    delete_response = await client.delete(f"/api/incomes/{income_id}")
    assert delete_response.status_code == 204

    deleted_get = await client.get(f"/api/incomes/{income_id}")
    assert deleted_get.status_code == 404
