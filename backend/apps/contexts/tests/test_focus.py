"""Care focus: several conditions and life stages at once, ranked by fixed rules."""

import datetime

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.contexts.focus import pregnancy_weeks, ranked_focus
from apps.contexts.models import HealthContext
from apps.records.models import Condition

User = get_user_model()
URL = "/api/v1/contexts/focus/"


@pytest.fixture
def owner(db):
    return User.objects.create_user(email="focus@example.com", password="StrongPass123!", name="Focus Owner")


@pytest.fixture
def client(owner):
    c = APIClient()
    c.force_authenticate(user=owner)
    return c


def test_pregnancy_weeks_from_lmp_and_due_date():
    today = datetime.date(2026, 11, 9)
    assert pregnancy_weeks({"lastMenstrualPeriod": "2026-07-06"}, today) == 18
    assert pregnancy_weeks({"estimatedDueDate": "2027-04-12"}, today) == 18
    assert pregnancy_weeks({"lastMenstrualPeriod": "nonsense"}, today) is None
    assert pregnancy_weeks(None, today) is None


@pytest.mark.django_db
class TestCareFocus:
    def test_ranking_puts_pregnancy_then_severity(self, client, owner):
        mild = Condition.objects.create(user=owner, name="Asthma", status="ACTIVE", severity="MILD")
        severe = Condition.objects.create(user=owner, name="Type 2 diabetes", status="ACTIVE", severity="SEVERE")
        HealthContext.objects.create(user=owner, kind="LIFE_STAGE", key="pregnancy", pregnancy_data={"status": "ONGOING"})
        r = client.put(URL, {"focus": [{"kind": "elderly"}, {"kind": "condition", "id": str(mild.id)},
                                       {"kind": "pregnancy"}, {"kind": "condition", "id": str(severe.id)}]},
                       format="json")
        assert r.status_code == 200
        labels = [i["label"] for i in r.json()["ranked"]]
        assert labels == ["Pregnancy", "Type 2 diabetes", "Asthma", "Elderly care"]
        assert [i["rank"] for i in r.json()["ranked"]] == [1, 2, 3, 4]

    def test_duplicates_are_removed_and_deleted_conditions_dropped(self, client, owner):
        c = Condition.objects.create(user=owner, name="Hypertension", status="ACTIVE")
        client.put(URL, {"focus": [{"kind": "condition", "id": str(c.id)}, {"kind": "condition", "id": str(c.id)}]},
                   format="json")
        assert len(client.get(URL).json()["focus"]) == 1
        c.delete()
        assert client.get(URL).json()["ranked"] == []

    def test_rejects_bad_items_and_other_peoples_conditions(self, client, db):
        assert client.put(URL, {"focus": [{"kind": "astrology"}]}, format="json").status_code == 400
        other = User.objects.create_user(email="o@example.com", password="StrongPass123!")
        theirs = Condition.objects.create(user=other, name="Gout", status="ACTIVE")
        r = client.put(URL, {"focus": [{"kind": "condition", "id": str(theirs.id)}]}, format="json")
        assert r.status_code == 400

    def test_focus_orders_the_emergency_summary(self, owner):
        from apps.emergency.services import StaticEmergencyService
        from apps.sharing.models import EmergencySettings

        a = Condition.objects.create(user=owner, name="Asthma", status="ACTIVE", severity="MILD")
        b = Condition.objects.create(user=owner, name="Sickle cell disease", status="ACTIVE", severity="SEVERE")
        owner.health_profile.care_focus = [{"kind": "condition", "id": str(a.id)}, {"kind": "condition", "id": str(b.id)}]
        owner.health_profile.save()
        settings_obj, _ = EmergencySettings.objects.get_or_create(owner=owner)
        summary = StaticEmergencyService.compile_summary(owner, settings_obj)
        assert [c["name"] for c in summary["conditions"]][:2] == ["Sickle cell disease", "Asthma"]
        assert summary["careFocus"][0]["label"] == "Sickle cell disease"

    def test_focus_reaches_the_copilot_context(self, owner):
        from apps.copilot.services import _build_personal_context

        c = Condition.objects.create(user=owner, name="Epilepsy", status="ACTIVE", severity="SEVERE")
        owner.health_profile.care_focus = [{"kind": "condition", "id": str(c.id)}]
        owner.health_profile.save()
        text = _build_personal_context(owner)
        assert "CARE FOCUS" in text and "1. Epilepsy" in text

    def test_ranked_focus_handles_missing_profile_list(self, owner):
        assert ranked_focus(owner) == []
