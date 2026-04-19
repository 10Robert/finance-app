from decimal import Decimal

import pytest


@pytest.mark.asyncio
async def test_get_salary_config_returns_null_when_absent(client: object):
    response = await client.get("/api/salary/config")
    assert response.status_code == 200
    assert response.json() is None


@pytest.mark.asyncio
async def test_post_salary_config_creates_and_then_updates_single_record(client: object):
    create_response = await client.post(
        "/api/salary/config",
        json={
            "base_salary": 4500,
            "overtime_hour_rate": 30,
            "meal_allowance": 500,
            "health_plan_deduction": 120,
        },
    )

    assert create_response.status_code == 200
    created = create_response.json()
    config_id = created["id"]
    assert created["base_salary"] == "4500.00"

    overwrite_response = await client.post(
        "/api/salary/config",
        json={
            "base_salary": 4700,
            "overtime_hour_rate": 32,
            "meal_allowance": 550,
            "health_plan_deduction": 140,
        },
    )

    assert overwrite_response.status_code == 200
    overwritten = overwrite_response.json()
    assert overwritten["id"] == config_id
    assert overwritten["base_salary"] == "4700.00"
    assert overwritten["meal_allowance"] == "550.00"


@pytest.mark.asyncio
async def test_put_salary_config_updates_partial_fields(client: object, salary_config):
    response = await client.put(
        "/api/salary/config",
        json={"meal_allowance": 800, "health_plan_deduction": 175},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == salary_config.id
    assert data["base_salary"] == "5000.00"
    assert data["meal_allowance"] == "800.00"
    assert data["health_plan_deduction"] == "175.00"


@pytest.mark.asyncio
async def test_salary_endpoints_return_404_when_config_missing(client: object):
    discount_response = await client.post(
        "/api/salary/discounts",
        json={"name": "Plano", "type": "fixed", "value": 100},
    )
    overtime_response = await client.post(
        "/api/salary/overtime",
        json={"month": 4, "year": 2026, "hours": 6, "rate_percent": 70},
    )
    update_response = await client.put("/api/salary/config", json={"base_salary": 4000})

    assert discount_response.status_code == 404
    assert overtime_response.status_code == 404
    assert update_response.status_code == 404


@pytest.mark.asyncio
async def test_add_remove_discount_and_overtime_then_calculate_salary(client: object, salary_config):
    discount_fixed = await client.post(
        "/api/salary/discounts",
        json={"name": "Adiantamento", "type": "fixed", "value": 100},
    )
    discount_percent = await client.post(
        "/api/salary/discounts",
        json={"name": "Convenio", "type": "percent", "value": 10},
    )
    overtime = await client.post(
        "/api/salary/overtime",
        json={"month": 4, "year": 2026, "hours": 5, "rate_percent": 70},
    )

    assert discount_fixed.status_code == 200
    assert discount_percent.status_code == 200
    assert overtime.status_code == 200

    calculation = await client.get("/api/salary/calculate", params={"month": 4, "year": 2026})
    assert calculation.status_code == 200
    payload = calculation.json()

    assert Decimal(payload["base_salary"]) == Decimal("5000.00")
    assert Decimal(payload["overtime_total"]) == Decimal("212.50")
    assert Decimal(payload["gross_salary"]) == Decimal("5212.50")
    assert Decimal(payload["discounts_total"]) == Decimal("621.25")
    assert Decimal(payload["net_salary"]) == Decimal("4591.25")
    assert len(payload["overtime_details"]) == 1
    assert len(payload["discount_details"]) == 2

    remove_discount = await client.delete(f"/api/salary/discounts/{discount_fixed.json()['id']}")
    remove_overtime = await client.delete(f"/api/salary/overtime/{overtime.json()['id']}")

    assert remove_discount.status_code == 200
    assert remove_overtime.status_code == 200
