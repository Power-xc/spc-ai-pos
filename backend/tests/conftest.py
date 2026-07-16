"""Common fixtures for the POS-first backend tests."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from main import app


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as client:
        yield client


@pytest.fixture(scope="session")
def store_id(client):  # noqa: ARG001
    return str(app.state.data_store.dim_store.iloc[0]["store_id"])


@pytest.fixture()
def headers(store_id):
    return {
        "X-User-Id": "owner-001",
        "X-User-Role": "store_owner",
        "X-Store-Id": store_id,
    }
