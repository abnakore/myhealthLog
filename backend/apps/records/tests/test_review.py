"""
Automatic record review: rule findings, document comparison, AI insight and
notifications.
"""

from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.contexts.models import HealthContext
from apps.core import clinical_rules as rules
from apps.notifications.models import Notification
from apps.records.models import RecordReview
from apps.records.review import parse_dose

User = get_user_model()
PDF = b"%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF"


@pytest.fixture
def owner(db):
    return User.objects.create_user(email="rev@example.com", password="StrongPass123!", name="Rev Owner")


@pytest.fixture
def client(owner):
    c = APIClient()
    c.force_authenticate(user=owner)
    return c


def _pdf():
    return SimpleUploadedFile("rx.pdf", PDF, content_type="application/pdf")


def _review(client, route, rid):
    r = client.get(f"/api/v1/records/{route}/{rid}/review/")
    assert r.status_code == 200
    return r.json()


# ---------------------------------------------------------------- unit level


class TestParseDose:
    @pytest.mark.parametrize("text,expected", [
        ("500mg", (500.0, "mg")), ("0.5 g", (500.0, "mg")), ("250 mcg", (0.25, "mg")),
        ("5 ml", (5.0, "ml")), ("10 units", (10.0, "unit")), ("twice daily", None),
    ])
    def test_units_are_normalised(self, text, expected):
        assert parse_dose(text) == expected


class TestRules:
    def test_pregnancy_lowers_the_blood_pressure_threshold(self):
        assert rules.reading_band("BLOOD_PRESSURE", 145, 92, "mmHg").level == "warning"
        preg = rules.reading_band("BLOOD_PRESSURE", 162, 100, "mmHg", pregnant=True)
        assert preg.level == "critical" and preg.rule == "reading.bp.pregnancy"
        assert rules.reading_band("BLOOD_PRESSURE", 162, 100, "mmHg").level == "warning"

    def test_glucose_in_mg_dl_is_converted(self):
        assert rules.reading_band("BLOOD_GLUCOSE", 45, None, "mg/dL").level == "critical"
        assert rules.reading_band("BLOOD_GLUCOSE", 95, None, "mg/dL") is None

    def test_unlikely_values_are_caught(self):
        assert rules.plausibility("BLOOD_PRESSURE", 1200, 80, "mmHg").rule == "reading.unlikely"
        assert rules.plausibility("BLOOD_PRESSURE", 80, 120, "mmHg") is not None
        f = rules.plausibility("BLOOD_GLUCOSE", 110, None, "mmol/L")
        assert f is not None and "mg/dL" in f.detail
        assert rules.plausibility("PULSE", 72, None, "bpm") is None


# ---------------------------------------------------------------- through the API


@pytest.mark.django_db
class TestMedicationReview:
    def test_allergy_class_clash_is_critical_and_notifies(self, client, owner, django_capture_on_commit_callbacks):
        client.post("/api/v1/records/allergies/", {"substance": "Penicillin", "severity": "ANAPHYLAXIS"}, format="json")
        with django_capture_on_commit_callbacks(execute=True):
            r = client.post("/api/v1/records/medications/",
                            {"name": "Amoxicillin", "dosage": "500mg", "start_date": "2026-11-01"}, format="json")
        review = _review(client, "medications", r.json()["id"])
        assert review["status"] == "DONE"
        assert review["findings"][0]["level"] == "critical"
        assert review["findings"][0]["rule"] == "allergy.class"
        assert Notification.objects.filter(user=owner, kind="RECORD_REVIEW").count() == 1

    def test_condition_caution(self, client, django_capture_on_commit_callbacks):
        client.post("/api/v1/records/conditions/", {"name": "Chronic kidney disease", "status": "ACTIVE"}, format="json")
        with django_capture_on_commit_callbacks(execute=True):
            r = client.post("/api/v1/records/medications/",
                            {"name": "Ibuprofen", "dosage": "400 mg", "start_date": "2026-11-01"}, format="json")
        rules_hit = {f["rule"] for f in _review(client, "medications", r.json()["id"])["findings"]}
        assert "condition.nsaid" in rules_hit

    def test_pregnancy_caution(self, client, owner, django_capture_on_commit_callbacks):
        HealthContext.objects.create(user=owner, kind="LIFE_STAGE", key="pregnancy",
                                     pregnancy_data={"status": "ONGOING"})
        with django_capture_on_commit_callbacks(execute=True):
            r = client.post("/api/v1/records/medications/",
                            {"name": "Lisinopril", "dosage": "10 mg", "start_date": "2026-11-01"}, format="json")
        rules_hit = {f["rule"] for f in _review(client, "medications", r.json()["id"])["findings"]}
        assert "pregnancy.ace_inhibitor" in rules_hit

    def test_finished_medicine_is_not_flagged(self, client, django_capture_on_commit_callbacks):
        client.post("/api/v1/records/allergies/", {"substance": "Penicillin", "severity": "SEVERE"}, format="json")
        with django_capture_on_commit_callbacks(execute=True):
            r = client.post("/api/v1/records/medications/", {"name": "Amoxicillin", "start_date": "2026-01-01",
                                                              "end_date": "2026-01-07", "active": False}, format="json")
        assert _review(client, "medications", r.json()["id"])["findings"] == []

    def test_resaving_does_not_repeat_the_alert(self, client, owner, django_capture_on_commit_callbacks):
        client.post("/api/v1/records/allergies/", {"substance": "Penicillin", "severity": "SEVERE"}, format="json")
        with django_capture_on_commit_callbacks(execute=True):
            r = client.post("/api/v1/records/medications/", {"name": "Ampiclox", "start_date": "2026-11-01"},
                            format="json")
        with django_capture_on_commit_callbacks(execute=True):
            client.patch(f"/api/v1/records/medications/{r.json()['id']}/", {"notes": "after food"}, format="json")
        assert Notification.objects.filter(user=owner, kind="RECORD_REVIEW").count() == 1

    def test_dosage_mismatch_with_document(self, client, owner, django_capture_on_commit_callbacks):
        answer = {"document_type": "prescription", "summary": "Prescription.", "key_findings": [],
                  "medications_mentioned": [{"name": "Paracetamol", "dosage": "600 mg", "frequency": "three times daily"}],
                  "conditions_mentioned": [], "follow_up": []}
        with patch("apps.core.ai.generate_json", return_value=answer):
            with django_capture_on_commit_callbacks(execute=True):
                r = client.post("/api/v1/records/medications/",
                                {"name": "Paracetamol", "dosage": "500mg", "frequency": "three times daily",
                                 "start_date": "2026-11-01", "file": _pdf()}, format="multipart")
        review = _review(client, "medications", r.json()["id"])
        mm = review["mismatches"]
        assert [m["field"] for m in mm] == ["dosage"]
        assert mm[0]["suggestion"] == "600 mg"
        assert Notification.objects.filter(user=owner, kind="RECORD_REVIEW").exists()

    def test_same_dose_in_other_units_is_not_a_mismatch(self, client, django_capture_on_commit_callbacks):
        answer = {"document_type": "prescription", "summary": "Rx.", "key_findings": [],
                  "medications_mentioned": [{"name": "Paracetamol tablets", "dosage": "0.5 g", "frequency": ""}],
                  "conditions_mentioned": [], "follow_up": []}
        with patch("apps.core.ai.generate_json", return_value=answer):
            with django_capture_on_commit_callbacks(execute=True):
                r = client.post("/api/v1/records/medications/",
                                {"name": "Paracetamol", "dosage": "500 mg", "start_date": "2026-11-01",
                                 "file": _pdf()}, format="multipart")
        assert _review(client, "medications", r.json()["id"])["mismatches"] == []


@pytest.mark.django_db
class TestOtherReviews:
    def test_new_allergy_checks_current_medicines(self, client, django_capture_on_commit_callbacks):
        client.post("/api/v1/records/medications/", {"name": "Co-trimoxazole", "start_date": "2026-11-01"},
                    format="json")
        with django_capture_on_commit_callbacks(execute=True):
            r = client.post("/api/v1/records/allergies/", {"substance": "Sulfa drugs", "severity": "SEVERE"},
                            format="json")
        findings = _review(client, "allergies", r.json()["id"])["findings"]
        assert findings and findings[0]["rule"] == "allergy.class"

    def test_typo_reading(self, client, django_capture_on_commit_callbacks):
        with django_capture_on_commit_callbacks(execute=True):
            r = client.post("/api/v1/records/vitals/",
                            {"vital_type": "BLOOD_PRESSURE", "value": 1200, "value2": 80, "unit": "mmHg",
                             "measured_at": "2026-11-09T08:00:00Z"}, format="json")
        assert _review(client, "vitals", r.json()["id"])["findings"][0]["rule"] == "reading.unlikely"
        n = Notification.objects.get(kind="RECORD_REVIEW", data__record_id=r.json()["id"])
        assert n.data["link"] == f"/app/records/measurements/{r.json()['id']}"

    def test_review_is_deleted_with_the_record(self, client, django_capture_on_commit_callbacks):
        with django_capture_on_commit_callbacks(execute=True):
            r = client.post("/api/v1/records/vitals/", {"vital_type": "PULSE", "value": 160, "unit": "bpm",
                                                         "measured_at": "2026-11-09T08:00:00Z"}, format="json")
        rid = r.json()["id"]
        assert RecordReview.objects.filter(record_id=rid).exists()
        client.delete(f"/api/v1/records/vitals/{rid}/")
        assert not RecordReview.objects.filter(record_id=rid).exists()

    def test_ai_insight_is_stored_when_enabled(self, client, settings, django_capture_on_commit_callbacks):
        settings.RECORD_REVIEW_AI_ENABLED = True
        answer = {"summary": "This reading is normal for you.", "points": ["Keep — checking weekly"],
                  "urgency": "none"}
        with patch("apps.core.ai.generate_json", return_value=answer):
            with django_capture_on_commit_callbacks(execute=True):
                r = client.post("/api/v1/records/vitals/", {"vital_type": "PULSE", "value": 72, "unit": "bpm",
                                                             "measured_at": "2026-11-09T08:00:00Z"}, format="json")
        review = _review(client, "vitals", r.json()["id"])
        assert review["aiStatus"] == "DONE"
        assert review["aiInsight"]["summary"] == "This reading is normal for you."
        assert "—" not in review["aiInsight"]["points"][0]

    def test_ai_failure_still_keeps_rule_findings(self, client, settings, django_capture_on_commit_callbacks):
        settings.RECORD_REVIEW_AI_ENABLED = True
        with django_capture_on_commit_callbacks(execute=True):
            r = client.post("/api/v1/records/vitals/", {"vital_type": "SPO2", "value": 86, "unit": "%",
                                                         "measured_at": "2026-11-09T08:00:00Z"}, format="json")
        review = _review(client, "vitals", r.json()["id"])
        assert review["aiStatus"] == "FAILED"
        assert review["findings"][0]["level"] == "critical"

    def test_other_users_cannot_read_a_review(self, client, db, django_capture_on_commit_callbacks):
        with django_capture_on_commit_callbacks(execute=True):
            r = client.post("/api/v1/records/vitals/", {"vital_type": "PULSE", "value": 72, "unit": "bpm",
                                                         "measured_at": "2026-11-09T08:00:00Z"}, format="json")
        other = APIClient()
        other.force_authenticate(User.objects.create_user(email="x@example.com", password="StrongPass123!"))
        assert other.get(f"/api/v1/records/vitals/{r.json()['id']}/review/").status_code == 404
