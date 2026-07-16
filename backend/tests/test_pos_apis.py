"""Basic POS API smoke tests."""


def test_home_sales_summary(client, headers):
    response = client.get("/api/home/sales-summary", headers=headers)
    assert response.status_code == 200
    assert "today_revenue" in response.json()["data"]


def test_inventory_current(client, headers):
    response = client.get("/api/inventory/current", headers=headers)
    assert response.status_code == 200
    assert isinstance(response.json()["data"], list)
