"""
Attachments on every record kind, signed file links, and AI extraction.
"""

import json
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.records.models import HealthDocument, Medication
from apps.records.tasks import normalise_extraction

User = get_user_model()

PDF = b"%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF"

AI_ANSWER = {
    "document_type": "lab_result",
    "title": "U&E",
    "date": "2026-10-28",
    "summary": "Raised potassium.",
    "key_findings": [
        {"metric": "Sodium", "value": "139", "unit": "mmol/L", "status": "normal"},
        {"metric": "Potassium", "value": "6.8", "unit": "mmol/L", "status": "critical"},
    ],
    "medications_mentioned": [],
    "conditions_mentioned": ["Hyperkalaemia"],
    "follow_up": ["Repeat in 1 week"],
}


@pytest.fixture
def owner(db):
    return User.objects.create_user(email="att@example.com", password="StrongPass123!", name="Att Owner")


@pytest.fixture
def client(owner):
    c = APIClient()
    c.force_authenticate(user=owner)
    return c


def _pdf(name="report.pdf"):
    return SimpleUploadedFile(name, PDF, content_type="application/pdf")


@pytest.mark.django_db
class TestAttachmentsOnEveryKind:
    @pytest.mark.parametrize(
        "route,data",
        [
            ("allergies", {"substance": "Penicillin", "severity": "SEVERE"}),
            ("medications", {"name": "Metformin", "start_date": "2026-01-01"}),
            ("conditions", {"name": "Diabetes", "status": "ACTIVE"}),
            ("appointments", {"title": "Review", "scheduled_for": "2026-12-01T10:00:00Z"}),
            ("vitals", {"vital_type": "PULSE", "value": "72", "unit": "bpm", "measured_at": "2026-11-01T10:00:00Z"}),
        ],
    )
    def test_multipart_create_with_file_and_json_arrays(self, client, route, data):
        payload = {**data, "file": _pdf()}
        if route in ("allergies",):
            payload["reactions"] = json.dumps(["Hives", "Wheeze"])
        if route != "conditions":
            payload["condition_ids"] = json.dumps([])
        r = client.post(f"/api/v1/records/{route}/", payload, format="multipart")
        assert r.status_code == 201, r.content
        body = r.json()
        assert body["document_file_name"] == "report.pdf"
        assert body["fileUrl"].startswith("/api/v1/records/files/")
        assert body["ai_extraction_status"] in ("PENDING", "FAILED", "PROCESSING", "DONE")
        if route == "allergies":
            assert body["reactions"] == ["Hives", "Wheeze"]

    def test_medication_multipart_without_active_defaults_to_active(self, client):
        r = client.post(
            "/api/v1/records/medications/",
            {"name": "Amlodipine", "start_date": "2026-01-01", "file": _pdf()},
            format="multipart",
        )
        assert r.status_code == 201
        assert r.json()["active"] is True

    def test_remove_file(self, client):
        r = client.post(
            "/api/v1/records/conditions/",
            {"name": "Asthma", "status": "ACTIVE", "file": _pdf()},
            format="multipart",
        )
        cid = r.json()["id"]
        r = client.patch(f"/api/v1/records/conditions/{cid}/", {"remove_file": True}, format="json")
        assert r.status_code == 200
        assert r.json()["fileUrl"] is None
        assert r.json()["ai_extraction_status"] == ""


@pytest.mark.django_db
class TestSignedFiles:
    def test_signed_link_serves_the_file_and_tampering_fails(self, client, owner):
        r = client.post(
            "/api/v1/records/documents/",
            {"title": "Lab", "doc_type": "LAB_RESULT", "file": _pdf()},
            format="multipart",
        )
        url = r.json()["fileUrl"]
        anon = APIClient()
        ok = anon.get(url)
        assert ok.status_code == 200
        assert ok["Content-Type"] == "application/pdf"
        assert ok["Cache-Control"] == "private, no-store"
        assert anon.get(url[:-6] + "AAAAA/").status_code == 404

    def test_deleted_record_file_is_no_longer_served(self, client):
        r = client.post(
            "/api/v1/records/documents/",
            {"title": "Lab", "doc_type": "LAB_RESULT", "file": _pdf()},
            format="multipart",
        )
        url, doc_id = r.json()["fileUrl"], r.json()["id"]
        client.delete(f"/api/v1/records/documents/{doc_id}/")
        assert APIClient().get(url).status_code == 404

    def test_expired_link_fails(self, client, settings):
        r = client.post(
            "/api/v1/records/documents/",
            {"title": "Lab", "doc_type": "LAB_RESULT", "file": _pdf()},
            format="multipart",
        )
        settings.FILE_URL_MAX_AGE = -1
        assert APIClient().get(r.json()["fileUrl"]).status_code == 404


@pytest.mark.django_db
class TestExtraction:
    def test_document_extraction_stores_normalised_json(self, client, django_capture_on_commit_callbacks):
        with patch("apps.core.ai.generate_json", return_value=AI_ANSWER):
            with django_capture_on_commit_callbacks(execute=True):
                r = client.post(
                    "/api/v1/records/documents/",
                    {"title": "U&E", "doc_type": "LAB_RESULT", "file": _pdf()},
                    format="multipart",
                )
        doc = HealthDocument.objects.get(pk=r.json()["id"])
        assert doc.ai_extraction_status == "DONE"
        # Critical results are moved to the top.
        assert doc.ai_extraction["key_findings"][0]["metric"] == "Potassium"

    def test_attachment_extraction_runs_for_a_medication(self, client, django_capture_on_commit_callbacks):
        with patch("apps.core.ai.generate_json", return_value=AI_ANSWER):
            with django_capture_on_commit_callbacks(execute=True):
                r = client.post(
                    "/api/v1/records/medications/",
                    {"name": "Lisinopril", "start_date": "2026-01-01", "file": _pdf()},
                    format="multipart",
                )
        med = Medication.objects.get(pk=r.json()["id"])
        assert med.ai_extraction_status == "DONE"
        assert med.ai_extraction["conditions_mentioned"] == ["Hyperkalaemia"]

    def test_ai_outage_retries_then_marks_failed_not_stuck(self, client):
        from apps.records.tasks import extract_document_with_ai

        # The autouse fixture blocks the network, so every model attempt fails.
        r = client.post(
            "/api/v1/records/documents/",
            {"title": "Lab", "doc_type": "LAB_RESULT", "file": _pdf()},
            format="multipart",
        )
        doc_id = r.json()["id"]
        # Earlier attempts schedule a retry (status back to PENDING); the last
        # allowed attempt gives up cleanly with FAILED instead of hanging.
        extract_document_with_ai.apply(args=[doc_id], retries=2)
        assert HealthDocument.objects.get(pk=doc_id).ai_extraction_status == "FAILED"


class TestNormaliseExtraction:
    def test_coerces_bad_shapes(self):
        out = normalise_extraction(
            [{"key_findings": "Glucose 9.8", "medications_mentioned": ["Metformin"], "date": "28/10/2026"}]
        )
        assert out["key_findings"] == [
            {"metric": "Glucose 9.8", "value": "", "unit": "", "reference_range": "", "status": None}
        ]
        assert out["medications_mentioned"][0]["name"] == "Metformin"
        assert out["date"] is None

    def test_rejects_non_objects(self):
        with pytest.raises(ValueError):
            normalise_extraction("not json")
