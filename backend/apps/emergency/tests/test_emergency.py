"""
Tests for the emergency card endpoints.
"""

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.core.utils import generate_emergency_token, hash_token
from apps.sharing.models import EmergencySettings

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def user_with_token(db):
    user = User.objects.create_user(email="em@example.com", password="Pass123!")
    raw_token = generate_emergency_token()
    EmergencySettings.objects.create(
        owner=user,
        token_hash=hash_token(raw_token),
        show_blood_type=True,
        show_allergies=True,
        show_medications=True,
        show_conditions=True,
        show_contacts=True,
    )
    return user, raw_token


@pytest.mark.django_db
class TestEmergencyCard:
    def test_valid_token_returns_card(self, api_client, user_with_token):
        user, token = user_with_token
        response = api_client.get(f"/api/v1/emergency/card/{token}/")
        assert response.status_code == 200
        data = response.json()
        assert "ownerUserId" in data
        assert data["ownerUserId"] == str(user.id)

    def test_invalid_token_returns_404(self, api_client):
        response = api_client.get("/api/v1/emergency/card/totally-fake-token/")
        assert response.status_code == 404

    def test_pin_required_returns_403(self, api_client, user_with_token):
        user, token = user_with_token
        settings_obj = EmergencySettings.objects.get(owner=user)
        settings_obj.pin_enabled = True
        settings_obj.pin_hash = hash_token("1234")
        settings_obj.save()

        response = api_client.get(f"/api/v1/emergency/card/{token}/")
        assert response.status_code == 403
        assert response.json()["pin_required"] is True

    def test_correct_pin_returns_card(self, api_client, user_with_token):
        user, token = user_with_token
        settings_obj = EmergencySettings.objects.get(owner=user)
        settings_obj.pin_enabled = True
        settings_obj.pin_hash = hash_token("5678")
        settings_obj.save()

        response = api_client.post(
            f"/api/v1/emergency/card/{token}/verify-pin/",
            {"pin": "5678"},
            format="json",
        )
        assert response.status_code == 200

    def test_wrong_pin_returns_400(self, api_client, user_with_token):
        user, token = user_with_token
        settings_obj = EmergencySettings.objects.get(owner=user)
        settings_obj.pin_enabled = True
        settings_obj.pin_hash = hash_token("9999")
        settings_obj.save()

        response = api_client.post(
            f"/api/v1/emergency/card/{token}/verify-pin/",
            {"pin": "0000"},
            format="json",
        )
        assert response.status_code == 400


@pytest.mark.django_db
class TestEmergencySummary:
    """The card's link opens the person's health summary, not a larger card."""

    def _token(self, user):
        raw_token = generate_emergency_token()
        EmergencySettings.objects.create(
            owner=user,
            token_hash=hash_token(raw_token),
            show_allergies=True,
            show_medications=True,
            show_conditions=True,
            show_contacts=True,
        )
        return raw_token

    def test_card_includes_health_summary(self, api_client, user_with_token):
        user, token = user_with_token
        from apps.records.models import Condition

        Condition.objects.create(
            user=user, name="Asthma", status="ACTIVE", severity="MODERATE"
        )
        Condition.objects.create(user=user, name="Appendicitis", status="RESOLVED")

        response = api_client.get(f"/api/v1/emergency/card/{token}/")
        assert response.status_code == 200
        summary = response.json()["summary"]

        assert [c["name"] for c in summary["conditions"]] == ["Asthma", "Appendicitis"]
        assert summary["conditions"][0]["status"] == "ACTIVE"
        assert "age" not in summary
        assert "dateOfBirth" not in summary

    def test_summary_respects_hidden_conditions(self, api_client, user_with_token):
        user, token = user_with_token
        settings_obj = EmergencySettings.objects.get(owner=user)
        settings_obj.show_conditions = False
        settings_obj.save(update_fields=["show_conditions"])
        from apps.records.models import Condition

        Condition.objects.create(user=user, name="Asthma", status="ACTIVE")

        response = api_client.get(f"/api/v1/emergency/card/{token}/")
        assert response.status_code == 200
        data = response.json()
        assert data["summary"]["conditions"] == []
        assert data["conditions"] == []
