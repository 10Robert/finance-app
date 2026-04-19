import pytest


@pytest.mark.asyncio
async def test_create_and_get_transaction(client: object, expense_category):
    create_response = await client.post(
        "/api/transactions/",
        json={
            "date": "2026-04-10",
            "description": "Supermercado",
            "amount": -125.75,
            "type": "expense",
            "category_id": expense_category.id,
            "notes": "Compra do mes",
        },
    )

    assert create_response.status_code == 201
    created = create_response.json()
    assert created["description"] == "Supermercado"
    assert created["category"]["id"] == expense_category.id

    get_response = await client.get(f"/api/transactions/{created['id']}")
    assert get_response.status_code == 200
    fetched = get_response.json()
    assert fetched["notes"] == "Compra do mes"
    assert fetched["amount"] == "-125.75"


@pytest.mark.asyncio
async def test_list_transactions_supports_filters_and_pagination(client: object, expense_category, income_category):
    payloads = [
        {
            "date": "2026-04-01",
            "description": "Salario Abril",
            "amount": 5000,
            "type": "income",
            "category_id": income_category.id,
        },
        {
            "date": "2026-04-03",
            "description": "Mercado",
            "amount": -200,
            "type": "expense",
            "category_id": expense_category.id,
        },
        {
            "date": "2026-04-04",
            "description": "Padaria",
            "amount": -45,
            "type": "expense",
            "category_id": expense_category.id,
        },
    ]

    for payload in payloads:
        response = await client.post("/api/transactions/", json=payload)
        assert response.status_code == 201

    filtered = await client.get(
        "/api/transactions/",
        params={
            "type": "expense",
            "category_id": expense_category.id,
            "start_date": "2026-04-02",
            "end_date": "2026-04-04",
            "page": 1,
            "per_page": 1,
        },
    )

    assert filtered.status_code == 200
    data = filtered.json()
    assert data["total"] == 2
    assert data["page"] == 1
    assert data["per_page"] == 1
    assert len(data["items"]) == 1
    assert data["items"][0]["description"] == "Padaria"


@pytest.mark.asyncio
async def test_update_transaction_preserves_unsent_fields(client: object, expense_category):
    create_response = await client.post(
        "/api/transactions/",
        json={
            "date": "2026-04-08",
            "description": "Transporte",
            "amount": -30,
            "type": "expense",
            "category_id": expense_category.id,
            "notes": "Uber",
        },
    )
    transaction_id = create_response.json()["id"]

    update_response = await client.put(
        f"/api/transactions/{transaction_id}",
        json={"description": "Transporte atualizado", "notes": "99 taxi"},
    )

    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["description"] == "Transporte atualizado"
    assert updated["notes"] == "99 taxi"
    assert updated["category_id"] == expense_category.id
    assert updated["amount"] == "-30.00"


@pytest.mark.asyncio
async def test_delete_transaction_and_missing_transaction_returns_404(client: object):
    missing_get = await client.get("/api/transactions/999")
    missing_put = await client.put("/api/transactions/999", json={"description": "Nada"})
    missing_delete = await client.delete("/api/transactions/999")

    assert missing_get.status_code == 404
    assert missing_put.status_code == 404
    assert missing_delete.status_code == 404

    create_response = await client.post(
        "/api/transactions/",
        json={
            "date": "2026-04-12",
            "description": "Conta de luz",
            "amount": -180,
            "type": "expense",
        },
    )
    transaction_id = create_response.json()["id"]

    delete_response = await client.delete(f"/api/transactions/{transaction_id}")
    assert delete_response.status_code == 204

    get_deleted = await client.get(f"/api/transactions/{transaction_id}")
    assert get_deleted.status_code == 404
