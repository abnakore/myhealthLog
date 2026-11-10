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
from apps.core import drug_knowledge as dk
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


# Drug facts as the live RxNav/RxClass services returned them on 2026-11-10
# (MED-RT and FDA SPL classes), so the tests never call the internet.
DRUGS = {
    "amoxicillin": dict(ingredients=["amoxicillin"], contraindicated_classes=["Penicillins"],
                        chemical_classes=["Penicillins"], pharmacologic_classes=["Penicillin-class Antibacterial"],
                        contraindicated_with=["Drug Hypersensitivity"]),
    "ampiclox": dict(ingredients=["ampicillin", "cloxacillin"], mapped_by_ai=True,
                     contraindicated_classes=["Penicillins"], chemical_classes=["Penicillins"]),
    "ibuprofen": dict(ingredients=["ibuprofen"], pharmacologic_classes=["Nonsteroidal Anti-inflammatory Drug"],
                      contraindicated_with=["Asthma", "Drug Hypersensitivity", "Pregnancy Trimester, Third",
                                            "Pregnancy, Abdominal", "Rhinitis", "Bronchial Hyperreactivity"]),
    "lisinopril": dict(ingredients=["lisinopril"], pharmacologic_classes=["Angiotensin Converting Enzyme Inhibitor"],
                       contraindicated_with=["Angioedema", "Drug Hypersensitivity", "Hyperaldosteronism",
                                             "Hypotension", "Pregnancy"]),
    "co-trimoxazole": dict(ingredients=["sulfamethoxazole", "trimethoprim"], mapped_by_ai=True,
                           contraindicated_classes=["4-Aminobenzoic Acid", "Phenethylamines", "Sulfonamides"],
                           chemical_classes=["Sulfonamides"]),
    "coartem": dict(ingredients=["artemether", "lumefantrine"], pharmacologic_classes=["Antimalarial"],
                    contraindicated_classes=["Carbamazepine", "Phenytoin", "Rifampin"],
                    contraindicated_with=["Drug Hypersensitivity"]),
    "rifampicin": dict(ingredients=["rifampin"], mapped_by_ai=True),
    "paracetamol": dict(ingredients=["acetaminophen"], contraindicated_with=[
        "Drug Hypersensitivity", "Glucosephosphate Dehydrogenase Deficiency", "Liver Diseases"]),
}


def fake_lookup(name):
    q = dk.clean_name(name)
    facts = DRUGS.get(q)
    if facts is None:
        return dk.DrugFacts(query=q, found=False)
    return dk.DrugFacts(query=q, found=True, rxcuis=["1"] * len(facts["ingredients"]), **facts)


@pytest.fixture
def drugs():
    with patch("apps.core.drug_knowledge.lookup", side_effect=fake_lookup):
        yield


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
    def test_allergy_class_clash_is_critical_and_notifies(self, client, owner, drugs,
                                                          django_capture_on_commit_callbacks):
        client.post("/api/v1/records/allergies/", {"substance": "Penicillin", "severity": "ANAPHYLAXIS"}, format="json")
        with django_capture_on_commit_callbacks(execute=True):
            r = client.post("/api/v1/records/medications/",
                            {"name": "Amoxicillin", "dosage": "500mg", "start_date": "2026-11-01"}, format="json")
        review = _review(client, "medications", r.json()["id"])
        assert review["status"] == "DONE"
        assert review["findings"][0]["level"] == "critical"
        assert review["findings"][0]["rule"] == "allergy.class"
        assert "MED-RT" in review["findings"][0]["source"]
        assert Notification.objects.filter(user=owner, kind="RECORD_REVIEW").count() == 1

    def test_condition_contraindication(self, client, drugs, django_capture_on_commit_callbacks):
        client.post("/api/v1/records/conditions/", {"name": "Bronchial asthma", "status": "ACTIVE"}, format="json")
        with django_capture_on_commit_callbacks(execute=True):
            r = client.post("/api/v1/records/medications/",
                            {"name": "Ibuprofen", "dosage": "400 mg", "start_date": "2026-11-01"}, format="json")
        found = _review(client, "medications", r.json()["id"])["findings"]
        assert [f["rule"] for f in found] == ["condition.medrt"]
        assert found[0]["data"]["contraindication"] == "Asthma"

    def test_medicine_prescribed_for_the_condition_is_only_a_note(self, client, drugs,
                                                                  django_capture_on_commit_callbacks):
        c = client.post("/api/v1/records/conditions/", {"name": "Asthma", "status": "ACTIVE"}, format="json").json()
        with django_capture_on_commit_callbacks(execute=True):
            r = client.post("/api/v1/records/medications/", {"name": "Ibuprofen", "start_date": "2026-11-01",
                                                             "condition_ids": [c["id"]]}, format="json")
        f = _review(client, "medications", r.json()["id"])["findings"][0]
        assert (f["rule"], f["level"]) == ("condition.medrt", "info")

    def test_abbreviation_is_expanded(self, client, drugs, django_capture_on_commit_callbacks):
        client.post("/api/v1/records/conditions/", {"name": "G6PD deficiency", "status": "ACTIVE"}, format="json")
        with django_capture_on_commit_callbacks(execute=True):
            r = client.post("/api/v1/records/medications/", {"name": "Paracetamol", "start_date": "2026-11-01"},
                            format="json")
        rules_hit = {f["rule"] for f in _review(client, "medications", r.json()["id"])["findings"]}
        assert rules_hit == {"condition.medrt"}

    def test_pregnancy_contraindication(self, client, owner, drugs, django_capture_on_commit_callbacks):
        HealthContext.objects.create(user=owner, kind="LIFE_STAGE", key="pregnancy",
                                     pregnancy_data={"status": "ONGOING"})
        with django_capture_on_commit_callbacks(execute=True):
            r = client.post("/api/v1/records/medications/",
                            {"name": "Lisinopril", "dosage": "10 mg", "start_date": "2026-11-01"}, format="json")
        f = _review(client, "medications", r.json()["id"])["findings"][0]
        assert (f["rule"], f["level"]) == ("pregnancy.medrt", "critical")

    def test_trimester_specific_contraindication(self):
        med = type("M", (), {"name": "Ibuprofen"})()
        with patch("apps.core.drug_knowledge.lookup", side_effect=fake_lookup):
            early = rules.medication_findings(med, pregnant=True, pregnancy_weeks=10)
            late = rules.medication_findings(med, pregnant=True, pregnancy_weeks=30)
        assert early[0].level == "info" and late[0].level == "warning"

    def test_medicines_that_must_not_be_combined(self, client, drugs, django_capture_on_commit_callbacks):
        client.post("/api/v1/records/medications/", {"name": "Rifampicin", "start_date": "2026-11-01"}, format="json")
        with django_capture_on_commit_callbacks(execute=True):
            r = client.post("/api/v1/records/medications/", {"name": "Coartem", "start_date": "2026-11-01"},
                            format="json")
        f = _review(client, "medications", r.json()["id"])["findings"][0]
        assert f["rule"] == "interaction.medrt" and f["data"]["class"] == "Rifampin"

    def test_unknown_medicine_is_said_plainly(self, client, drugs, django_capture_on_commit_callbacks):
        with django_capture_on_commit_callbacks(execute=True):
            r = client.post("/api/v1/records/medications/", {"name": "Zzyxtrol", "start_date": "2026-11-01"},
                            format="json")
        f = _review(client, "medications", r.json()["id"])["findings"][0]
        assert (f["rule"], f["level"]) == ("drug.not_found", "info")

    def test_label_points_must_quote_the_label(self, client, settings, drugs, django_capture_on_commit_callbacks):
        settings.RECORD_REVIEW_AI_ENABLED = True
        client.post("/api/v1/records/medications/", {"name": "Spironolactone", "start_date": "2026-11-01"},
                    format="json")
        label = {"drug_interactions": "Potassium-sparing diuretics: Coadministration of lisinopril with "
                                      "potassium-sparing diuretics may increase the risk of hyperkalemia.",
                 "_set_id": "abc"}
        points = {"points": [
            {"kind": "interaction", "title": "Lisinopril with spironolactone", "detail": "Can raise potassium.",
             "section": "drug_interactions",
             "quote": "Coadministration of lisinopril with potassium-sparing diuretics may increase the risk of "
                      "hyperkalemia."},
            {"kind": "interaction", "title": "Made up", "detail": "Not in the label.",
             "section": "drug_interactions", "quote": "Lisinopril must never be taken with fruit juice at all."},
        ]}
        note = {"summary": "Fine.", "points": [], "urgency": "routine"}
        with patch("apps.core.drug_knowledge.label", return_value=label), \
                patch("apps.core.ai.generate_json", side_effect=[points, note]):
            with django_capture_on_commit_callbacks(execute=True):
                r = client.post("/api/v1/records/medications/", {"name": "Lisinopril", "start_date": "2026-11-01"},
                                format="json")
        found = [f for f in _review(client, "medications", r.json()["id"])["findings"] if f["rule"].startswith("label.")]
        assert [f["title"] for f in found] == ["Lisinopril with spironolactone"]
        assert found[0]["data"]["section"] == "drug_interactions"
        assert "FDA" in found[0]["source"]

    def test_finished_medicine_is_not_flagged(self, client, drugs, django_capture_on_commit_callbacks):
        client.post("/api/v1/records/allergies/", {"substance": "Penicillin", "severity": "SEVERE"}, format="json")
        with django_capture_on_commit_callbacks(execute=True):
            r = client.post("/api/v1/records/medications/", {"name": "Amoxicillin", "start_date": "2026-01-01",
                                                              "end_date": "2026-01-07", "active": False}, format="json")
        assert _review(client, "medications", r.json()["id"])["findings"] == []

    def test_resaving_does_not_repeat_the_alert(self, client, owner, drugs, django_capture_on_commit_callbacks):
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
    def test_new_allergy_checks_current_medicines(self, client, drugs, django_capture_on_commit_callbacks):
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


# ---------------------------------------------------------------- check before saving


def _extraction(**over):
    base = {"document_type": "prescription", "summary": "Prescription.", "key_findings": [],
            "medications_mentioned": [], "conditions_mentioned": [], "allergies_mentioned": [], "follow_up": []}
    return {**base, **over}


@pytest.mark.django_db
class TestCheckBeforeSave:
    def test_medication_dose_difference_is_returned_with_the_fix(self, client):
        answer = _extraction(medications_mentioned=[{"name": "Paracetamol", "dosage": "600 mg", "frequency": ""}])
        with patch("apps.core.ai.generate_json", return_value=answer):
            r = client.post("/api/v1/records/medications/check-document/",
                            {"name": "Paracetamol", "dosage": "500mg", "start_date": "2026-11-01", "file": _pdf()},
                            format="multipart")
        assert r.status_code == 200 and r.json()["status"] == "DONE"
        mm = r.json()["mismatches"]
        assert [(m["field"], m["apply"]) for m in mm] == [("dosage", {"dosage": "600 mg"})]

    def test_nothing_is_saved_by_the_check(self, client, owner):
        with patch("apps.core.ai.generate_json", return_value=_extraction()):
            client.post("/api/v1/records/medications/check-document/",
                        {"name": "Paracetamol", "start_date": "2026-11-01", "file": _pdf()}, format="multipart")
        assert not owner.medications.exists()

    def test_the_file_is_read_once_for_check_and_save(self, client, django_capture_on_commit_callbacks):
        answer = _extraction(medications_mentioned=[{"name": "Paracetamol", "dosage": "500 mg", "frequency": ""}])
        with patch("apps.core.ai.generate_json", return_value=answer) as gen:
            client.post("/api/v1/records/medications/check-document/",
                        {"name": "Paracetamol", "dosage": "500 mg", "start_date": "2026-11-01", "file": _pdf()},
                        format="multipart")
            with django_capture_on_commit_callbacks(execute=True):
                client.post("/api/v1/records/medications/",
                            {"name": "Paracetamol", "dosage": "500 mg", "start_date": "2026-11-01", "file": _pdf()},
                            format="multipart")
        assert gen.call_count == 1

    def test_editing_compares_with_the_saved_values(self, client):
        r = client.post("/api/v1/records/vitals/", {"vital_type": "BLOOD_PRESSURE", "value": 140, "value2": 90,
                                                    "unit": "mmHg", "measured_at": "2026-11-09T08:00:00Z"},
                        format="json")
        answer = _extraction(document_type="other", key_findings=[
            {"metric": "Blood pressure", "value": "150/95", "unit": "mmHg", "reference_range": "", "status": "high"}])
        with patch("apps.core.ai.generate_json", return_value=answer):
            r = client.post(f"/api/v1/records/vitals/{r.json()['id']}/check-document/", {"file": _pdf()},
                            format="multipart")
        assert r.json()["mismatches"][0]["apply"] == {"value": 150.0, "value2": 95.0}

    def test_ai_unavailable_lets_the_save_go_ahead(self, client):
        with patch("apps.core.ai.is_configured", return_value=False):
            r = client.post("/api/v1/records/allergies/check-document/",
                            {"substance": "Penicillin", "file": _pdf()}, format="multipart")
        assert r.json() == {"status": "UNAVAILABLE", "mismatches": [], "summary": ""}

    def test_a_file_is_required(self, client):
        r = client.post("/api/v1/records/allergies/check-document/", {"substance": "Penicillin"}, format="multipart")
        assert r.status_code == 400


class TestEveryKindIsCompared:
    @staticmethod
    def check(record_type, values, extraction):
        from apps.records.review import check_against_document

        return check_against_document(record_type, values, extraction)

    def test_allergy(self):
        ex = _extraction(allergies_mentioned=[{"substance": "Penicillin", "reaction": "rash",
                                               "severity": "anaphylaxis"}])
        mm = self.check("allergy", {"substance": "Penicillin", "severity": "MILD"}, ex)
        assert [(m["field"], m["apply"]) for m in mm] == [("severity", {"severity": "ANAPHYLAXIS"})]
        mm = self.check("allergy", {"substance": "Peanuts", "severity": "MILD"}, ex)
        assert mm[0]["field"] == "substance" and mm[0]["apply"] == {"substance": "Penicillin"}

    def test_condition(self):
        ex = _extraction(conditions_mentioned=["Hypertension"])
        assert self.check("condition", {"name": "Hypertension stage 2"}, ex) == []
        assert self.check("condition", {"name": "Asthma"}, ex)[0]["apply"] == {"name": "Hypertension"}

    def test_appointment(self):
        ex = _extraction(date="2026-11-12", provider="Lagos University Teaching Hospital")
        mm = self.check("appointment", {"scheduled_for": "2026-11-10T09:00:00Z", "facility": "Reddington"}, ex)
        assert {m["field"] for m in mm} == {"date", "facility"}

    def test_document(self):
        ex = _extraction(document_type="lab_result", date="2026-10-01")
        mm = self.check("document", {"doc_type": "PRESCRIPTION", "document_date": "2026-10-03"}, ex)
        assert {m["field"]: m["apply"] for m in mm} == {"doc_type": {"doc_type": "LAB_RESULT"},
                                                       "document_date": {"document_date": "2026-10-01"}}

    def test_medication_with_no_dose_typed(self):
        ex = _extraction(medications_mentioned=[{"name": "Metformin", "dosage": "500 mg", "frequency": "twice daily"}])
        mm = self.check("medication", {"name": "Metformin", "dosage": "", "frequency": ""}, ex)
        assert {m["field"] for m in mm} == {"dosage", "frequency"}


@pytest.mark.django_db
class TestMedicineFlags:
    def test_flags_reach_the_summary_and_emergency_payload(self, client, owner, drugs,
                                                           django_capture_on_commit_callbacks):
        client.post("/api/v1/records/allergies/", {"substance": "Penicillin", "severity": "SEVERE"}, format="json")
        with django_capture_on_commit_callbacks(execute=True):
            client.post("/api/v1/records/medications/", {"name": "Amoxicillin", "start_date": "2026-11-01"},
                        format="json")
        flags = client.get("/api/v1/records/medications/safety-flags/").json()
        assert flags[0]["medication"] == "Amoxicillin" and flags[0]["level"] == "critical"

        from apps.copilot.services import _build_personal_context
        assert "same family as your Penicillin allergy" in _build_personal_context(owner)
