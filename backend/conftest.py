"""
Root pytest configuration for myHealthLog.

Provides shared fixtures available to every test module.
"""

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient


@pytest.fixture
def api_client():
    """An unauthenticated DRF test client."""
    return APIClient()


@pytest.fixture
def user(db):
    """A standard non-admin user."""
    User = get_user_model()
    return User.objects.create_user(
        email="fixture@example.com",
        password="FixturePass123!",
        name="Fixture User",
    )


@pytest.fixture
def auth_client(api_client, user):
    """A DRF test client authenticated as the fixture user."""
    api_client.force_authenticate(user=user)
    return api_client


@pytest.fixture
def admin_user(db):
    """A superuser."""
    User = get_user_model()
    return User.objects.create_superuser(
        email="admin@example.com",
        password="AdminPass123!",
    )


@pytest.fixture
def admin_client(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    return api_client


@pytest.fixture(autouse=True)
def _no_real_gemini(monkeypatch):
    """
    Tests run Celery eagerly, so an upload would call Gemini for real.
    Block the network call; tests that need an AI answer patch
    apps.core.ai.generate / generate_json themselves.
    """
    import requests

    def _refuse(*args, **kwargs):
        raise requests.ConnectionError("Network calls to Gemini are disabled in tests.")

    monkeypatch.setattr("apps.core.ai.requests.post", _refuse)
