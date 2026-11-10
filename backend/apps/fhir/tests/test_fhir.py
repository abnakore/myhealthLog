"""
Tests for FHIR export and clinical summary endpoints.

Covers:
  - GET /api/v1/export/fhir/ — FHIR R4 JSON Bundle
  - GET /api/v1/export/summary/ — Print-ready HTML summary
  - Auth and content validation
"""


import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from apps.profiles.models import HealthProfile
from apps.records.models import Allergy, Condition, Medication, VitalReading

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def user_with_records(db):
    """Create a user with a populated record for export testing."""
    user = User.objects.create_user(
        email="fhir@example.com",
        password="StrongPass123!",
        name="FHIR Test User",
    )
    profile = HealthProfile.objects.get(user=user)
    profile.full_name = "FHIR Test User"
    profile.sex = "MALE"
    profile.blood_type = "O+"
    profile.genotype = "AA"
    profile.save()

    Allergy.objects.create(
        user=user, substance="Penicillin", allergy_type="DRUG", severity="SEVERE",
        reactions=["rash", "swelling"],
    )
    Medication.objects.create(
        user=user, name="Metformin", dosage="500 mg", frequency="Twice daily",
        start_date="2024-01-01", active=True,
    )
    Condition.objects.create(
        user=user, name="Type 2 Diabetes", status="ACTIVE", icd10_code="E11.9",
    )
    VitalReading.objects.create(
        user=user, vital_type="WEIGHT", value=75, unit="kg",
        measured_at=timezone.now(),
    )
    return user


@pytest.fixture
def auth_client(api_client, user_with_records):
    api_client.force_authenticate(user=user_with_records)
    return api_client


@pytest.mark.django_db
class TestFHIRExport:
    def test_export_unauthenticated_returns_401(self, api_client):
        response = api_client.get("/api/v1/export/fhir/")
        assert response.status_code == 401

    def test_export_returns_fhir_bundle(self, auth_client):
        response = auth_client.get("/api/v1/export/fhir/")
        assert response.status_code == 200
        assert response["Content-Type"] == "application/fhir+json"
        assert "attachment" in response["Content-Disposition"]

        bundle = response.json()
        assert bundle["resourceType"] == "Bundle"
        assert bundle["type"] == "transaction"
        assert len(bundle["entry"]) > 0

        # Should contain a Patient resource.
        resource_types = [e["resource"]["resourceType"] for e in bundle["entry"]]
        assert "Patient" in resource_types
        assert "AllergyIntolerance" in resource_types
        assert "MedicationStatement" in resource_types
        assert "Condition" in resource_types
        assert "Observation" in resource_types  # vital reading

    def test_patient_resource_has_correct_fields(self, auth_client, user_with_records):
        response = auth_client.get("/api/v1/export/fhir/")
        bundle = response.json()
        patient = next(
            e["resource"] for e in bundle["entry"]
            if e["resource"]["resourceType"] == "Patient"
        )
        assert patient["name"][0]["text"] == "FHIR Test User"

    def test_condition_has_icd10_coding(self, auth_client):
        response = auth_client.get("/api/v1/export/fhir/")
        bundle = response.json()
        condition = next(
            e["resource"] for e in bundle["entry"]
            if e["resource"]["resourceType"] == "Condition"
        )
        assert condition["code"]["coding"][0]["code"] == "E11.9"
        assert condition["code"]["coding"][0]["system"] == "http://hl7.org/fhir/sid/icd-10"


@pytest.mark.django_db
class TestFHIRStandard:
    """The export follows the FHIR R4 structure and the standard code systems."""

    def _bundle(self, client):
        return client.get("/api/v1/export/fhir/").json()

    def test_bundle_is_valid_for_the_fhir_resources_library(self, auth_client):
        from fhir.resources.R4B.bundle import Bundle

        Bundle.model_validate(self._bundle(auth_client))  # raises if not valid FHIR structure

    def test_every_entry_can_be_imported_by_a_fhir_server(self, auth_client):
        bundle = self._bundle(auth_client)
        full_urls = {e["fullUrl"] for e in bundle["entry"]}
        for e in bundle["entry"]:
            assert e["request"] == {"method": "POST", "url": e["resource"]["resourceType"]}
            assert e["fullUrl"].startswith("urn:uuid:")
            # Every reference points at a resource inside the same bundle.
            for key in ("subject", "patient"):
                if key in e["resource"]:
                    assert e["resource"][key]["reference"] in full_urls

    def test_standard_codes(self, auth_client, user_with_records):
        VitalReading.objects.create(user=user_with_records, vital_type="BLOOD_PRESSURE", value=120, value2=80,
                                    unit="mmHg", measured_at=timezone.now())
        res = [e["resource"] for e in self._bundle(auth_client)["entry"]]
        cond = next(r for r in res if r["resourceType"] == "Condition")
        assert cond["clinicalStatus"]["coding"][0]["system"] == "http://terminology.hl7.org/CodeSystem/condition-clinical"
        allergy = next(r for r in res if r["resourceType"] == "AllergyIntolerance")
        assert allergy["clinicalStatus"]["coding"][0]["system"] == (
            "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical")
        blood = next(r for r in res if r.get("code", {}).get("text") == "Blood group")
        assert blood["code"]["coding"][0]["code"] == "882-1"
        bp = next(r for r in res if r.get("component"))
        assert [c["code"]["coding"][0]["code"] for c in bp["component"]] == ["8480-6", "8462-4"]
        assert bp["component"][0]["valueQuantity"]["code"] == "mm[Hg]"
        assert bp["category"][0]["coding"][0]["code"] == "vital-signs"

    def test_immunization_dose_number(self, auth_client, user_with_records):
        from apps.records.models import Immunization

        Immunization.objects.create(user=user_with_records, vaccine="Hepatitis B", administered_on="2025-01-01",
                                    dose_number=2)
        imm = next(e["resource"] for e in self._bundle(auth_client)["entry"]
                   if e["resource"]["resourceType"] == "Immunization")
        assert imm["protocolApplied"] == [{"doseNumberPositiveInt": 2}]

    def test_user_without_profile_details_still_exports(self, api_client, db):
        user = User.objects.create_user(email="bare@example.com", password="StrongPass123!", name="Bare")
        api_client.force_authenticate(user=user)
        bundle = api_client.get("/api/v1/export/fhir/").json()
        assert bundle["entry"][0]["resource"]["resourceType"] == "Patient"


@pytest.mark.django_db
class TestClinicalSummary:
    def test_summary_unauthenticated_returns_401(self, api_client):
        response = api_client.get("/api/v1/export/summary/")
        assert response.status_code == 401

    def test_summary_returns_html(self, auth_client):
        response = auth_client.get("/api/v1/export/summary/")
        assert response.status_code == 200
        assert "text/html" in response["Content-Type"]
        assert "attachment" in response["Content-Disposition"]

        html = response.content.decode("utf-8")
        assert "<!DOCTYPE html>" in html
        assert "FHIR Test User" in html
        assert "Penicillin" in html
        assert "Metformin" in html
        assert "Type 2 Diabetes" in html

    def test_summary_empty_user(self, api_client, db):
        """A user with no records should get a valid (empty) summary."""
        user = User.objects.create_user(
            email="empty@example.com", password="Pass123!", name="Empty User"
        )
        api_client.force_authenticate(user=user)
        response = api_client.get("/api/v1/export/summary/")
        assert response.status_code == 200
        html = response.content.decode("utf-8")
        assert "No allergies recorded" in html
        assert "No active medications" in html
