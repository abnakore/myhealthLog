"""
Tests for health context endpoints.

Covers:
  - Condition context CRUD
  - Life-stage (pregnancy) context CRUD
  - Validation: condition_id required for CONDITION, key required for LIFE_STAGE
  - Auth and cross-user isolation
"""

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.contexts.models import HealthContext

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def user(db):
    return User.objects.create_user(
        email="ctx@example.com", password="StrongPass123!", name="Ctx User"
    )


@pytest.fixture
def auth_client(api_client, user):
    api_client.force_authenticate(user=user)
    return api_client


@pytest.mark.django_db
class TestHealthContextCRUD:
    def test_list_unauthenticated_returns_401(self, api_client):
        response = api_client.get("/api/v1/contexts/")
        assert response.status_code == 401

    def test_list_returns_200(self, auth_client):
        response = auth_client.get("/api/v1/contexts/")
        assert response.status_code == 200
        assert "results" in response.json()

    def test_create_condition_context(self, auth_client, user):
        # First create a condition to link to
        from apps.records.models import Condition

        condition = Condition.objects.create(user=user, name="Asthma")
        response = auth_client.post(
            "/api/v1/contexts/",
            {"kind": "CONDITION", "condition_id": str(condition.id)},
            format="json",
        )
        assert response.status_code == 201
        data = response.json()
        assert data["kind"] == "CONDITION"
        assert data["condition_id"] == str(condition.id)

    def test_create_life_stage_pregnancy_context(self, auth_client):
        response = auth_client.post(
            "/api/v1/contexts/",
            {
                "kind": "LIFE_STAGE",
                "key": "pregnancy",
                "pregnancy_data": {
                    "status": "ONGOING",
                    "gravida": 1,
                    "para": 0,
                },
            },
            format="json",
        )
        assert response.status_code == 201
        data = response.json()
        assert data["kind"] == "LIFE_STAGE"
        assert data["key"] == "pregnancy"
        assert data["pregnancy_data"]["status"] == "ONGOING"

    def test_create_condition_without_condition_id_returns_400(self, auth_client):
        response = auth_client.post(
            "/api/v1/contexts/",
            {"kind": "CONDITION"},
            format="json",
        )
        assert response.status_code == 400

    def test_create_life_stage_without_key_returns_400(self, auth_client):
        response = auth_client.post(
            "/api/v1/contexts/",
            {"kind": "LIFE_STAGE"},
            format="json",
        )
        assert response.status_code == 400

    def test_retrieve_context(self, auth_client, user):
        ctx = HealthContext.objects.create(
            user=user, kind="LIFE_STAGE", key="pregnancy",
            pregnancy_data={"status": "ONGOING"},
        )
        response = auth_client.get(f"/api/v1/contexts/{ctx.id}/")
        assert response.status_code == 200
        assert response.json()["key"] == "pregnancy"

    def test_update_context(self, auth_client, user):
        ctx = HealthContext.objects.create(
            user=user, kind="LIFE_STAGE", key="pregnancy",
            pregnancy_data={"status": "ONGOING"},
        )
        response = auth_client.patch(
            f"/api/v1/contexts/{ctx.id}/",
            {"pregnancy_data": {"status": "DELIVERED"}},
            format="json",
        )
        assert response.status_code == 200
        assert response.json()["pregnancy_data"]["status"] == "DELIVERED"

    def test_delete_context(self, auth_client, user):
        ctx = HealthContext.objects.create(
            user=user, kind="LIFE_STAGE", key="pregnancy",
        )
        response = auth_client.delete(f"/api/v1/contexts/{ctx.id}/")
        assert response.status_code == 204
        assert not HealthContext.objects.filter(id=ctx.id).exists()

    def test_cannot_access_another_users_context(self, api_client, user, db):
        other = User.objects.create_user(
            email="other@example.com", password="Pass123!"
        )
        ctx = HealthContext.objects.create(
            user=other, kind="LIFE_STAGE", key="pregnancy",
        )
        api_client.force_authenticate(user=user)
        response = api_client.get(f"/api/v1/contexts/{ctx.id}/")
        assert response.status_code == 404
