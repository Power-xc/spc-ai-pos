"""Scenario C: period comparison via POS API."""

from __future__ import annotations

import pandas as pd


def test_sales_compare_via_pos_api(client, headers):
    frame = client.app.state.data_store.fact_inventory_day
    store_frame = frame[frame["store_id"] == headers["X-Store-Id"]]
    latest = pd.Timestamp(store_frame["biz_date"].max()).normalize()
    a_start = (latest - pd.Timedelta(days=6)).date().isoformat()
    a_end = latest.date().isoformat()
    b_start = (latest - pd.Timedelta(days=13)).date().isoformat()
    b_end = (latest - pd.Timedelta(days=7)).date().isoformat()
    response = client.get(
        "/api/sales/compare",
        params={"period_a_start": a_start, "period_a_end": a_end, "period_b_start": b_start, "period_b_end": b_end},
        headers=headers,
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert "revenue_change_pct" in data
    assert "insight" in data
