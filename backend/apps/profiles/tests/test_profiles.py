"""
Tests for profile and emergency contact endpoints.

Covers:
  - GET / PATCH profile
  - Emergency contact CRUD
  - Auth and validation failures
"""

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.profiles.models import EmergencyContact, HealthProfile

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def user(db):
    return User.objects.create_user(
        email="profile@example.com",
        password="StrongPass123!",
        name="Profile User",
    )


@pytest.fixture
def auth_client(api_client, user):
    api_client.force_authenticate(user=user)
    return api_client


@pytest.mark.django_db
class TestProfileView:
    def test_get_profile_unauthenticated_returns_401(self, api_client):
        response = api_client.get("/api/v1/profile/")
        assert response.status_code == 401

    def test_get_profile_returns_200(self, auth_client, user):
        response = auth_client.get("/api/v1/profile/")
        assert response.status_code == 200
        data = response.json()
        assert data["full_name"] == "Profile User"
        assert "emergencyContacts" in data
        assert "id" in data

    def test_patch_profile_updates_fields(self, auth_client, user):
        response = auth_client.patch(
            "/api/v1/profile/",
            {
                "full_name": "Updated Name",
                "blood_type": "O+",
                "sex": "MALE",
                "height_cm": 178,
            },
            format="json",
        )
        assert response.status_code == 200
        data = response.json()
        assert data["full_name"] == "Updated Name"
        assert data["blood_type"] == "O+"

        # Verify the User.name is kept in sync.
        user.refresh_from_db()
        assert user.name == "Updated Name"

    def test_patch_profile_invalid_height_returns_400(self, auth_client):
        response = auth_client.patch(
            "/api/v1/profile/",
            {"height_cm": 500},
            format="json",
        )
        assert response.status_code == 400

    def test_patch_profile_weight_creates_vital_reading(self, auth_client, user):
        """weightKg is a convenience field that creates a VitalReading."""
        response = auth_client.patch(
            "/api/v1/profile/",
            {"weightKg": 72.5},
            format="json",
        )
        assert response.status_code == 200
        # Verify the weight was stored as a VitalReading.
        from apps.records.models import VitalReading

        weight_reading = VitalReading.objects.filter(
            user=user, vital_type="WEIGHT"
        ).first()
        assert weight_reading is not None
        assert float(weight_reading.value) == 72.5
        # The read serializer should return the weight.
        profile_resp = auth_client.get("/api/v1/profile/")
        assert profile_resp.json()["weightKg"] == 72.5


@pytest.mark.django_db
class TestEmergencyContacts:
    def test_list_contacts_empty(self, auth_client):
        response = auth_client.get("/api/v1/profile/contacts/")
        assert response.status_code == 200
        assert response.json() == []

    def test_create_contact(self, auth_client, user):
        response = auth_client.post(
            "/api/v1/profile/contacts/",
            {
                "name": "Jane Doe",
                "relationship": "Spouse",
                "phone": "+2348012345678",
                "priority": 1,
            },
            format="json",
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Jane Doe"
        assert data["phone"] == "+2348012345678"

    def test_create_contact_missing_phone_returns_400(self, auth_client):
        response = auth_client.post(
            "/api/v1/profile/contacts/",
            {"name": "No Phone", "relationship": "Friend", "phone": ""},
            format="json",
        )
        assert response.status_code == 400

    def test_update_contact(self, auth_client, user):
        profile = HealthProfile.objects.get(user=user)
        contact = EmergencyContact.objects.create(
            profile=profile,
            name="Old Name",
            relationship="Parent",
            phone="123",
            priority=1,
        )
        response = auth_client.patch(
            f"/api/v1/profile/contacts/{contact.id}/",
            {"name": "New Name"},
            format="json",
        )
        assert response.status_code == 200
        assert response.json()["name"] == "New Name"

    def test_delete_contact(self, auth_client, user):
        profile = HealthProfile.objects.get(user=user)
        contact = EmergencyContact.objects.create(
            profile=profile,
            name="To Delete",
            relationship="Sibling",
            phone="456",
            priority=2,
        )
        response = auth_client.delete(f"/api/v1/profile/contacts/{contact.id}/")
        assert response.status_code == 204
        assert not EmergencyContact.objects.filter(id=contact.id).exists()

    def test_cannot_access_another_users_contact(self, api_client, user, db):
        other = User.objects.create_user(
            email="other@example.com", password="Pass123!"
        )
        other_profile = HealthProfile.objects.get(user=other)
        contact = EmergencyContact.objects.create(
            profile=other_profile,
            name="Private",
            relationship="Parent",
            phone="789",
            priority=1,
        )
        api_client.force_authenticate(user=user)
        # PATCH should return 404 (contact belongs to another user).
        response = api_client.patch(
            f"/api/v1/profile/contacts/{contact.id}/",
            {"name": "Hacked"},
            format="json",
        )
        assert response.status_code == 404


@pytest.mark.django_db
class TestPhotoUpload:
    def test_photo_upload_unauthenticated_returns_401(self, api_client):
        from django.core.files.uploadedfile import SimpleUploadedFile

        photo = SimpleUploadedFile(
            "test.jpg", b"file_content", content_type="image/jpeg"
        )
        response = api_client.patch(
            "/api/v1/profile/photo/", {"photo": photo}, format="multipart"
        )
        assert response.status_code == 401


@pytest.mark.django_db
class TestProxyProfileWrites:
    def test_full_proxy_updates_owner_profile_and_notifies_them(self, api_client):
        from apps.sharing.models import CareProxyGrant

        owner = User.objects.create_user(
            email="profile-owner@example.com", password="Pass123!", name="Owner"
        )
        proxy = User.objects.create_user(
            email="profile-proxy@example.com", password="Pass123!", name="Proxy Person"
        )
        CareProxyGrant.objects.create(
            owner=owner,
            proxy_user=proxy,
            proxy_email=proxy.email,
            permission="FULL",
            status="ACTIVE",
        )
        api_client.force_authenticate(user=proxy)

        response = api_client.patch(
            "/api/v1/profile/",
            {"blood_type": "O+"},
            format="json",
            HTTP_X_ACT_AS_USER=str(owner.id),
        )
        assert response.status_code == 200
        assert response.json()["blood_type"] == "O+"

        profile = HealthProfile.objects.get(user=owner)
        assert profile.blood_type == "O+"
        assert HealthProfile.objects.get(user=proxy).blood_type != "O+"

        note = owner.notifications.get(kind="RECORD_UPDATED")
        assert "Proxy Person" in note.title
        assert note.data["by_proxy"] is True

    def test_view_proxy_cannot_change_owner_profile(self, api_client):
        from apps.sharing.models import CareProxyGrant

        owner = User.objects.create_user(
            email="profile-view-owner@example.com", password="Pass123!"
        )
        proxy = User.objects.create_user(
            email="profile-view-proxy@example.com", password="Pass123!"
        )
        CareProxyGrant.objects.create(
            owner=owner,
            proxy_user=proxy,
            proxy_email=proxy.email,
            permission="VIEW",
            status="ACTIVE",
        )
        api_client.force_authenticate(user=proxy)

        response = api_client.patch(
            "/api/v1/profile/",
            {"blood_type": "A-"},
            format="json",
            HTTP_X_ACT_AS_USER=str(owner.id),
        )
        assert response.status_code == 403
        assert HealthProfile.objects.get(user=owner).blood_type in ("", None)
