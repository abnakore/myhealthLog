"""
Tests for authentication endpoints.

Covers the minimum required triangle:
  - Happy path (correct credentials → tokens)
  - Authentication failure (wrong password → 401)
  - Validation failure (missing field → 400)
"""

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def registered_user(db):
    return User.objects.create_user(
        email="test@example.com",
        password="StrongPass123!",
        name="Test User",
    )


@pytest.mark.django_db
class TestRegister:
    def test_register_creates_user_and_returns_tokens(self, api_client):
        payload = {
            "name": "Alice Smith",
            "email": "alice@example.com",
            "password": "SecurePass99!",
        }
        response = api_client.post("/api/v1/auth/register/", payload, format="json")
        assert response.status_code == 201
        data = response.json()
        assert "access" in data
        assert "refresh" in data
        assert data["user"]["email"] == "alice@example.com"
        assert User.objects.filter(email="alice@example.com").exists()

    def test_register_duplicate_email_returns_400(self, api_client, registered_user):
        payload = {
            "name": "Duplicate",
            "email": registered_user.email,
            "password": "AnotherPass99!",
        }
        response = api_client.post("/api/v1/auth/register/", payload, format="json")
        assert response.status_code == 400

    def test_register_missing_password_returns_400(self, api_client):
        payload = {"name": "No Pass", "email": "nopass@example.com"}
        response = api_client.post("/api/v1/auth/register/", payload, format="json")
        assert response.status_code == 400


@pytest.mark.django_db
class TestLogin:
    def test_login_returns_tokens_and_user(self, api_client, registered_user):
        response = api_client.post(
            "/api/v1/auth/login/",
            {"email": "test@example.com", "password": "StrongPass123!"},
            format="json",
        )
        assert response.status_code == 200
        data = response.json()
        assert "access" in data
        assert "refresh" in data
        assert data["user"]["email"] == "test@example.com"

    def test_login_wrong_password_returns_401(self, api_client, registered_user):
        response = api_client.post(
            "/api/v1/auth/login/",
            {"email": "test@example.com", "password": "wrongpassword"},
            format="json",
        )
        assert response.status_code == 401

    def test_login_nonexistent_user_returns_401(self, api_client):
        response = api_client.post(
            "/api/v1/auth/login/",
            {"email": "nobody@example.com", "password": "pass"},
            format="json",
        )
        assert response.status_code == 401


@pytest.mark.django_db
class TestMe:
    def test_me_unauthenticated_returns_401(self, api_client):
        response = api_client.get("/api/v1/auth/me/")
        assert response.status_code == 401

    def test_me_authenticated_returns_user(self, api_client, registered_user):
        api_client.force_authenticate(user=registered_user)
        response = api_client.get("/api/v1/auth/me/")
        assert response.status_code == 200
        assert response.json()["email"] == registered_user.email


@pytest.mark.django_db
class TestOnboardingComplete:
    def test_complete_onboarding_sets_flag(self, api_client, registered_user):
        assert not registered_user.onboarded
        api_client.force_authenticate(user=registered_user)
        response = api_client.post("/api/v1/auth/onboarding/complete/")
        assert response.status_code == 200
        registered_user.refresh_from_db()
        assert registered_user.onboarded


@pytest.mark.django_db
class TestPasswordResetEmail:
    def test_reset_request_queues_email_with_link(
        self, api_client, registered_user, django_capture_on_commit_callbacks
    ):
        from django.core import mail

        # Email is queued after the transaction commits.
        with django_capture_on_commit_callbacks(execute=True):
            response = api_client.post(
                "/api/v1/auth/password/reset/",
                {"email": registered_user.email},
                format="json",
            )
        assert response.status_code == 200
        assert len(mail.outbox) == 1
        message = mail.outbox[0]
        assert message.to == [registered_user.email]
        assert "reset-password?uid=" in message.body
        assert "token=" in message.body

    def test_unknown_email_sends_nothing_and_does_not_leak(self, api_client, db):
        from django.core import mail

        response = api_client.post(
            "/api/v1/auth/password/reset/",
            {"email": "nobody@example.com"},
            format="json",
        )
        assert response.status_code == 200
        assert len(mail.outbox) == 0
