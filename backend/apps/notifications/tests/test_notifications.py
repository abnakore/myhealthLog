"""
Tests for the notifications app.

Covers:
  - List, unread count, mark read, dismiss one, dismiss all, mark all read
  - notify() helper (success and failure paths)
  - Notification created on record add (allergy)
  - Welcome notification on onboarding complete
"""

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.notifications.models import Notification
from apps.notifications.utils import notify

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def user(db):
    return User.objects.create_user(
        email="notif@example.com",
        password="TestPass123!",
        name="Notif User",
    )


@pytest.fixture
def auth_client(api_client, user):
    api_client.force_authenticate(user=user)
    return api_client


def make_notif(user, read=False, kind=Notification.Kind.WELCOME):
    return Notification.objects.create(
        user=user,
        kind=kind,
        title="Test",
        body="Body",
        is_read=read,
    )


@pytest.mark.django_db
class TestNotificationAPI:
    def test_list_unauthenticated_returns_401(self, api_client):
        response = api_client.get("/api/v1/notifications/")
        assert response.status_code == 401

    def test_list_returns_200_and_results(self, auth_client, user):
        make_notif(user)
        make_notif(user, read=True)
        response = auth_client.get("/api/v1/notifications/")
        assert response.status_code == 200
        assert response.json()["count"] == 2

    def test_list_only_shows_own_notifications(self, auth_client, user, db):
        other = User.objects.create_user(email="other@x.com", password="Pass!")
        make_notif(other)
        make_notif(user)
        response = auth_client.get("/api/v1/notifications/")
        assert response.json()["count"] == 1

    def test_unread_count(self, auth_client, user):
        make_notif(user, read=False)
        make_notif(user, read=False)
        make_notif(user, read=True)
        response = auth_client.get("/api/v1/notifications/unread-count/")
        assert response.status_code == 200
        assert response.json()["count"] == 2

    def test_unread_count_unauthenticated_returns_401(self, api_client):
        assert api_client.get("/api/v1/notifications/unread-count/").status_code == 401

    def test_mark_one_read(self, auth_client, user):
        n = make_notif(user, read=False)
        response = auth_client.patch(f"/api/v1/notifications/{n.id}/")
        assert response.status_code == 200
        assert response.json()["is_read"] is True
        n.refresh_from_db()
        assert n.is_read is True

    def test_dismiss_one(self, auth_client, user):
        n = make_notif(user)
        response = auth_client.delete(f"/api/v1/notifications/{n.id}/")
        assert response.status_code == 204
        assert not Notification.objects.filter(id=n.id).exists()

    def test_cannot_read_another_users_notification(self, auth_client, user, db):
        other = User.objects.create_user(email="other2@x.com", password="Pass!")
        n = make_notif(other)
        assert auth_client.patch(f"/api/v1/notifications/{n.id}/").status_code == 404
        assert auth_client.delete(f"/api/v1/notifications/{n.id}/").status_code == 404

    def test_mark_all_read(self, auth_client, user):
        make_notif(user, read=False)
        make_notif(user, read=False)
        make_notif(user, read=False)
        response = auth_client.post("/api/v1/notifications/read-all/")
        assert response.status_code == 200
        assert response.json()["marked_read"] == 3
        assert Notification.objects.filter(user=user, is_read=False).count() == 0

    def test_dismiss_all(self, auth_client, user):
        make_notif(user)
        make_notif(user)
        make_notif(user)
        response = auth_client.delete("/api/v1/notifications/")
        assert response.status_code == 204
        assert Notification.objects.filter(user=user).count() == 0

    def test_list_newest_first(self, auth_client, user):
        make_notif(user)
        n2 = make_notif(user)
        results = auth_client.get("/api/v1/notifications/").json()["results"]
        assert results[0]["id"] == n2.id  # newest first


@pytest.mark.django_db
class TestNotifyHelper:
    def test_creates_notification(self, user):
        notify(user=user, kind=Notification.Kind.WELCOME, title="Hi!")
        assert Notification.objects.filter(user=user, kind="WELCOME").count() == 1

    def test_never_raises_on_bad_user(self):
        # Should not raise even with invalid user
        notify(user=None, kind="INVALID_KIND", title="Should not raise")

    def test_data_stored(self, user):
        notify(user=user, kind=Notification.Kind.RECORD_ADDED,
               title="T", body="B", data={"record_id": "abc"})
        n = Notification.objects.get(user=user)
        assert n.data["record_id"] == "abc"
        assert n.body == "B"


@pytest.mark.django_db
class TestWelcomeNotification:
    def test_welcome_fires_on_onboarding_complete(self, user):
        user.onboarded = True
        user.save(update_fields=["onboarded"])
        notifs = Notification.objects.filter(user=user, kind=Notification.Kind.WELCOME)
        assert notifs.count() == 1
        assert "Welcome" in notifs.first().title

    def test_welcome_not_fired_on_unrelated_save(self, user):
        user.name = "New Name"
        user.save(update_fields=["name"])
        assert Notification.objects.filter(user=user, kind=Notification.Kind.WELCOME).count() == 0


@pytest.mark.django_db
class TestRecordNotification:
    def test_allergy_add_creates_notification(self, auth_client, user):
        response = auth_client.post(
            "/api/v1/records/allergies/",
            {"substance": "Penicillin", "allergy_type": "DRUG", "severity": "MILD"},
            format="json",
        )
        assert response.status_code == 201
        notif = Notification.objects.filter(
            user=user, kind=Notification.Kind.RECORD_ADDED
        ).first()
        assert notif is not None
        assert "Penicillin" in notif.title

    def test_allergy_delete_creates_notification(self, auth_client, user):
        from apps.records.models import Allergy
        a = Allergy.objects.create(user=user, substance="Aspirin", allergy_type="DRUG", severity="MILD")
        auth_client.delete(f"/api/v1/records/allergies/{a.id}/")
        notif = Notification.objects.filter(
            user=user, kind=Notification.Kind.RECORD_DELETED
        ).first()
        assert notif is not None
        assert "Aspirin" in notif.title
