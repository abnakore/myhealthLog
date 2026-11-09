"""Tests for core views (health-check endpoint)."""

import pytest


@pytest.mark.django_db
def test_health_check_returns_200(client):
    """The health-check endpoint should return 200 when the database is reachable."""
    response = client.get("/api/health/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["database"] == "ok"
