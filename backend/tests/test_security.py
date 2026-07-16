"""Security-focused tests for RBAC and masking."""


def test_missing_headers_rejected(client):
    response = client.get("/api/home/sales-summary")
    assert response.status_code == 401


def test_profitability_masked_for_store_owner(client, headers):
    response = client.get("/api/sales/profitability", headers=headers)
    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["cost_of_goods"] == "***"
