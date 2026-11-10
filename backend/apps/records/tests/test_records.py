"""
Tests for health record endpoints.

Covers: allergy CRUD as the canonical example (same pattern for all 8 types).
"""

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def user(db):
    return User.objects.create_user(email="records@example.com", password="Pass123!")


@pytest.fixture
def auth_client(api_client, user):
    api_client.force_authenticate(user=user)
    return api_client


@pytest.mark.django_db
class TestAllergyEndpoints:
    def test_list_unauthenticated_returns_401(self, api_client):
        response = api_client.get("/api/v1/records/allergies/")
        assert response.status_code == 401

    def test_list_returns_200_for_authenticated_user(self, auth_client):
        response = auth_client.get("/api/v1/records/allergies/")
        assert response.status_code == 200
        assert "results" in response.json()

    def test_create_allergy(self, auth_client):
        payload = {
            "substance": "Penicillin",
            "allergy_type": "DRUG",
            "severity": "ANAPHYLAXIS",
        }
        response = auth_client.post(
            "/api/v1/records/allergies/", payload, format="json"
        )
        assert response.status_code == 201
        data = response.json()
        assert data["substance"] == "Penicillin"
        assert data["severity"] == "ANAPHYLAXIS"

    def test_create_allergy_missing_substance_returns_400(self, auth_client):
        payload = {"allergy_type": "DRUG", "severity": "MILD"}
        response = auth_client.post(
            "/api/v1/records/allergies/", payload, format="json"
        )
        assert response.status_code == 400

    def test_user_cannot_access_another_users_allergy(self, db, api_client):
        owner = User.objects.create_user(email="owner@example.com", password="Pass!")
        attacker = User.objects.create_user(email="attacker@example.com", password="Pass!")
        from apps.records.models import Allergy

        allergy = Allergy.objects.create(
            user=owner, substance="Dust", allergy_type="ENVIRONMENTAL", severity="MILD"
        )
        api_client.force_authenticate(user=attacker)
        response = api_client.get(f"/api/v1/records/allergies/{allergy.id}/")
        assert response.status_code == 404

    def test_delete_allergy(self, auth_client, user, db):
        from apps.records.models import Allergy

        allergy = Allergy.objects.create(
            user=user, substance="Pollen", allergy_type="ENVIRONMENTAL", severity="MILD"
        )
        response = auth_client.delete(f"/api/v1/records/allergies/{allergy.id}/")
        assert response.status_code == 204


@pytest.mark.django_db
class TestVitalLatestEndpoint:
    def test_latest_vitals_returns_one_per_type(self, auth_client, user, db):
        from django.utils import timezone

        from apps.records.models import VitalReading

        now = timezone.now()
        VitalReading.objects.create(
            user=user, vital_type="WEIGHT", value=75, unit="kg", measured_at=now
        )
        VitalReading.objects.create(
            user=user,
            vital_type="WEIGHT",
            value=74,
            unit="kg",
            measured_at=now.replace(day=now.day - 1) if now.day > 1 else now,
        )
        response = auth_client.get("/api/v1/records/vitals/latest/")
        assert response.status_code == 200
        weights = [r for r in response.json() if r["vital_type"] == "WEIGHT"]
        assert len(weights) == 1


@pytest.mark.django_db
class TestFileUploads:
    """Multipart writes must return the same JSON envelope as JSON writes."""

    def _condition_id(self, auth_client):
        response = auth_client.post(
            "/api/v1/records/conditions/",
            {
                "name": "Type 2 diabetes",
                "status": "ACTIVE",
                "severity": "MODERATE",
                "onset_date": "2024-01-01",
            },
            format="json",
        )
        assert response.status_code == 201
        return response.json()["id"]

    def test_document_upload_with_condition_returns_json(self, auth_client):
        import json

        from django.core.files.uploadedfile import SimpleUploadedFile

        condition_id = self._condition_id(auth_client)
        response = auth_client.post(
            "/api/v1/records/documents/",
            {
                "title": "Blood test",
                "doc_type": "LAB_RESULT",
                "document_date": "2026-01-15",
                "condition_ids": json.dumps([condition_id]),
                "file": SimpleUploadedFile(
                    "results.pdf", b"%PDF-1.4 test document", content_type="application/pdf"
                ),
            },
            format="multipart",
        )
        assert response.status_code == 201, response.content
        assert response["Content-Type"].startswith("application/json")
        data = response.json()
        assert data["title"] == "Blood test"
        assert data["condition_ids"] == [condition_id]
        assert data["fileUrl"]

    def test_medication_upload_with_condition_returns_json(self, auth_client):
        import json

        from django.core.files.uploadedfile import SimpleUploadedFile

        condition_id = self._condition_id(auth_client)
        response = auth_client.post(
            "/api/v1/records/medications/",
            {
                "name": "Metformin",
                "dosage": "500 mg",
                "frequency": "Twice daily",
                "start_date": "2026-01-01",
                "condition_ids": json.dumps([condition_id]),
                # A real 1x1 PNG: uploads are checked by their bytes, not their name.
                "file": SimpleUploadedFile(
                    "script.png",
                    bytes.fromhex(
                        "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
                        "0000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082"
                    ),
                    content_type="image/png",
                ),
            },
            format="multipart",
        )
        assert response.status_code == 201, response.content
        assert response["Content-Type"].startswith("application/json")
        data = response.json()
        assert data["name"] == "Metformin"
        assert data["condition_ids"] == [condition_id]
        assert data["fileUrl"]
