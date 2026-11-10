"""
Tests for sharing & safety endpoints.

Covers:
  - Care provider share CRUD + revoke
  - Emergency settings GET / PATCH / regenerate token
  - Care proxy grant create / accept / decline / revoke
  - Provider access (unauthenticated code resolution)
  - Auth and cross-user isolation
"""

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.sharing.models import CareProvider, CareProxyGrant, EmergencySettings

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def user(db):
    return User.objects.create_user(
        email="sharing@example.com", password="StrongPass123!", name="Sharing User"
    )


@pytest.fixture
def auth_client(api_client, user):
    api_client.force_authenticate(user=user)
    return api_client


# ---------------------------------------------------------------------------
# Care Providers
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestCareProviderEndpoints:
    def test_list_unauthenticated_returns_401(self, api_client):
        response = api_client.get("/api/v1/sharing/providers/")
        assert response.status_code == 401

    def test_list_returns_200(self, auth_client):
        response = auth_client.get("/api/v1/sharing/providers/")
        assert response.status_code == 200
        assert "results" in response.json()

    def test_create_provider_returns_share_code(self, auth_client):
        response = auth_client.post(
            "/api/v1/sharing/providers/",
            {
                "name": "Dr. Smith",
                "role": "Cardiologist",
                "facility": "City Hospital",
                "scopes": ["profile", "medications", "conditions"],
                "access": "VIEW",
            },
            format="json",
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Dr. Smith"
        assert "share_code" in data
        assert len(data["share_code"]) > 0
        # The owner can see the same code again later, but only the hash and an
        # encrypted copy are stored.
        provider_id = data["id"]
        read_resp = auth_client.get(f"/api/v1/sharing/providers/{provider_id}/")
        assert read_resp.json()["share_code"] == data["share_code"]
        stored = CareProvider.objects.get(pk=provider_id)
        assert data["share_code"] not in stored.share_code_encrypted
        listed = auth_client.get("/api/v1/sharing/providers/").json()["results"]
        assert listed[0]["share_code"] == data["share_code"]

    def test_provider_window_never_receives_the_share_code(self, api_client, user):
        _, code = CareProvider.create_share(owner=user, name="Dr. A", scopes=["allergies"], pin="2468")
        response = api_client.post(
            "/api/v1/sharing/provider-access/", {"share_code": code, "pin": "2468"}, format="json"
        )
        assert response.status_code == 200
        assert "share_code" not in response.json()["provider"]
        assert "pin" not in response.json()["provider"]

    def test_create_provider_with_invalid_scope_returns_400(self, auth_client):
        response = auth_client.post(
            "/api/v1/sharing/providers/",
            {
                "name": "Dr. Bad",
                "scopes": ["invalid_scope"],
                "access": "VIEW",
            },
            format="json",
        )
        assert response.status_code == 400

    def test_create_provider_with_pin(self, auth_client):
        response = auth_client.post(
            "/api/v1/sharing/providers/",
            {
                "name": "Dr. PIN",
                "scopes": ["profile"],
                "access": "VIEW",
                "pin": "1234",
            },
            format="json",
        )
        assert response.status_code == 201
        assert response.json()["pin_enabled"] is True

    def test_reset_provider_pin(self, auth_client, api_client, user):
        provider, raw_code = CareProvider.create_share(
            owner=user,
            name="Dr. Reset PIN",
            scopes=["profile"],
            access="VIEW",
            pin="1234",
        )
        assert provider.verify_pin("1234")

        response = auth_client.patch(
            f"/api/v1/sharing/providers/{provider.id}/",
            {"pin": "5678"},
            format="json",
        )
        assert response.status_code == 200
        assert response.json()["pin_enabled"] is True

        provider.refresh_from_db()
        assert provider.verify_pin("5678")
        assert not provider.verify_pin("1234")

        # The window now accepts the new PIN and rejects the old one.
        old = api_client.post(
            "/api/v1/sharing/provider-access/",
            {"share_code": raw_code, "pin": "1234"},
            format="json",
        )
        assert old.status_code == 400
        new = api_client.post(
            "/api/v1/sharing/provider-access/",
            {"share_code": raw_code, "pin": "5678"},
            format="json",
        )
        assert new.status_code == 200

    def test_cannot_reset_pin_on_revoked_share(self, auth_client, user):
        provider, _ = CareProvider.create_share(
            owner=user,
            name="Dr. Revoked PIN",
            scopes=["profile"],
            access="VIEW",
            pin="1234",
        )
        provider.status = CareProvider.Status.REVOKED
        provider.save(update_fields=["status"])

        response = auth_client.patch(
            f"/api/v1/sharing/providers/{provider.id}/",
            {"pin": "5678"},
            format="json",
        )
        assert response.status_code == 400

    def test_revoke_provider(self, auth_client, user):
        provider, raw_code = CareProvider.create_share(
            owner=user,
            name="Dr. Revoke",
            scopes=["profile"],
            access="VIEW",
        )
        response = auth_client.post(
            f"/api/v1/sharing/providers/{provider.id}/"
        )
        assert response.status_code == 200
        assert response.json()["status"] == "REVOKED"

    def test_cannot_access_another_users_provider(self, api_client, user, db):
        other = User.objects.create_user(
            email="other@example.com", password="Pass123!"
        )
        provider, _ = CareProvider.create_share(
            owner=other, name="Dr. Private", scopes=["profile"], access="VIEW"
        )
        api_client.force_authenticate(user=user)
        response = api_client.get(f"/api/v1/sharing/providers/{provider.id}/")
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Emergency Settings
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestEmergencySettings:
    def test_get_creates_default_settings(self, auth_client, user):
        response = auth_client.get("/api/v1/sharing/emergency/")
        assert response.status_code == 200
        data = response.json()
        assert "token" in data  # raw token returned on first creation
        assert data["show_blood_type"] is True
        assert data["show_allergies"] is True
        assert EmergencySettings.objects.filter(owner=user).exists()

    def test_get_returns_the_same_token_every_time(self, auth_client, user):
        first = auth_client.get("/api/v1/sharing/emergency/").json()["token"]
        response = auth_client.get("/api/v1/sharing/emergency/")
        assert response.status_code == 200
        assert response.json()["token"] == first
        assert first not in EmergencySettings.objects.get(owner=user).token_encrypted

    def test_token_from_get_opens_the_public_card(self, auth_client, api_client):
        token = auth_client.get("/api/v1/sharing/emergency/").json()["token"]
        assert api_client.get(f"/api/v1/emergency/card/{token}/").status_code == 200

    def test_pin_is_shown_back_to_the_owner(self, auth_client):
        auth_client.get("/api/v1/sharing/emergency/")
        auth_client.patch("/api/v1/sharing/emergency/", {"pin_enabled": True, "pin": "4826"}, format="json")
        assert auth_client.get("/api/v1/sharing/emergency/").json()["pin"] == "4826"
        auth_client.patch("/api/v1/sharing/emergency/", {"pin_enabled": False}, format="json")
        assert auth_client.get("/api/v1/sharing/emergency/").json()["pin"] is None

    def test_patch_updates_toggles(self, auth_client, user):
        auth_client.get("/api/v1/sharing/emergency/")  # create
        response = auth_client.patch(
            "/api/v1/sharing/emergency/",
            {
                "show_blood_type": False,
                "show_note": True,
                "note": "Carry an EpiPen",
            },
            format="json",
        )
        assert response.status_code == 200
        data = response.json()
        assert data["show_blood_type"] is False
        assert data["show_note"] is True
        assert data["note"] == "Carry an EpiPen"

    def test_patch_sets_pin(self, auth_client, user):
        auth_client.get("/api/v1/sharing/emergency/")  # create
        response = auth_client.patch(
            "/api/v1/sharing/emergency/",
            {"pin_enabled": True, "pin": "4321"},
            format="json",
        )
        assert response.status_code == 200
        settings_obj = EmergencySettings.objects.get(owner=user)
        assert settings_obj.pin_enabled is True
        assert settings_obj.verify_pin("4321")

    def test_regenerate_token(self, auth_client, user):
        auth_client.get("/api/v1/sharing/emergency/")  # create with token
        old_hash = EmergencySettings.objects.get(owner=user).token_hash
        response = auth_client.post("/api/v1/sharing/emergency/regenerate/")
        assert response.status_code == 200
        assert "token" in response.json()
        new_hash = EmergencySettings.objects.get(owner=user).token_hash
        assert old_hash != new_hash


# ---------------------------------------------------------------------------
# Care Proxy Grants
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestCareProxyGrants:
    def test_create_grant(self, auth_client, user):
        response = auth_client.post(
            "/api/v1/sharing/proxies/",
            {
                "proxy_email": "proxy@example.com",
                "permission": "VIEW",
            },
            format="json",
        )
        assert response.status_code == 201
        data = response.json()
        assert data["proxy_email"] == "proxy@example.com"
        assert data["status"] == "INVITED"

    def test_create_grant_to_self_returns_400(self, auth_client, user):
        response = auth_client.post(
            "/api/v1/sharing/proxies/",
            {
                "proxy_email": user.email,
                "permission": "FULL",
            },
            format="json",
        )
        assert response.status_code == 400

    def test_create_duplicate_grant_returns_400(self, auth_client, user):
        auth_client.post(
            "/api/v1/sharing/proxies/",
            {"proxy_email": "dup@example.com", "permission": "VIEW"},
            format="json",
        )
        response = auth_client.post(
            "/api/v1/sharing/proxies/",
            {"proxy_email": "dup@example.com", "permission": "FULL"},
            format="json",
        )
        assert response.status_code == 400

    def test_list_grants(self, auth_client, user):
        response = auth_client.get("/api/v1/sharing/proxies/")
        assert response.status_code == 200
        data = response.json()
        assert "given" in data
        assert "received" in data

    def test_revoke_grant(self, auth_client, user):
        grant = CareProxyGrant.objects.create(
            owner=user,
            proxy_email="revoke@example.com",
            permission="VIEW",
        )
        response = auth_client.post(
            f"/api/v1/sharing/proxies/{grant.id}/revoke/"
        )
        assert response.status_code == 200
        assert response.json()["status"] == "REVOKED"

    def test_accept_grant(self, api_client, db):
        owner = User.objects.create_user(
            email="owner@example.com", password="Pass123!", name="Owner"
        )
        proxy = User.objects.create_user(
            email="proxy@example.com", password="Pass123!", name="Proxy User"
        )
        grant = CareProxyGrant.objects.create(
            owner=owner,
            proxy_email=proxy.email,
            permission="FULL",
        )
        api_client.force_authenticate(user=proxy)
        response = api_client.post(f"/api/v1/sharing/proxies/{grant.id}/accept/")
        assert response.status_code == 200
        assert response.json()["status"] == "ACTIVE"
        grant.refresh_from_db()
        assert grant.proxy_user == proxy

    def test_decline_grant(self, api_client, db):
        owner = User.objects.create_user(
            email="owner2@example.com", password="Pass123!"
        )
        proxy = User.objects.create_user(
            email="decliner@example.com", password="Pass123!"
        )
        grant = CareProxyGrant.objects.create(
            owner=owner,
            proxy_email=proxy.email,
            permission="VIEW",
        )
        api_client.force_authenticate(user=proxy)
        response = api_client.post(f"/api/v1/sharing/proxies/{grant.id}/decline/")
        assert response.status_code == 200
        assert response.json()["status"] == "DECLINED"

    def test_update_permission(self, auth_client, user):
        grant = CareProxyGrant.objects.create(
            owner=user,
            proxy_email="perm@example.com",
            permission="VIEW",
            status="ACTIVE",
        )
        response = auth_client.patch(
            f"/api/v1/sharing/proxies/{grant.id}/",
            {"permission": "FULL"},
            format="json",
        )
        assert response.status_code == 200
        assert response.json()["permission"] == "FULL"
        grant.refresh_from_db()
        assert grant.permission == "FULL"

    def test_update_permission_invalid_level_returns_400(self, auth_client, user):
        grant = CareProxyGrant.objects.create(
            owner=user,
            proxy_email="perm2@example.com",
            permission="VIEW",
            status="ACTIVE",
        )
        response = auth_client.patch(
            f"/api/v1/sharing/proxies/{grant.id}/",
            {"permission": "INVALID"},
            format="json",
        )
        assert response.status_code == 400

    def test_resend_invite(self, auth_client, user):
        grant = CareProxyGrant.objects.create(
            owner=user,
            proxy_email="resend@example.com",
            permission="VIEW",
        )
        original_time = grant.invited_at
        response = auth_client.post(
            f"/api/v1/sharing/proxies/{grant.id}/resend/"
        )
        assert response.status_code == 200
        grant.refresh_from_db()
        assert grant.invited_at > original_time

    def test_resend_active_grant_returns_400(self, auth_client, user):
        grant = CareProxyGrant.objects.create(
            owner=user,
            proxy_email="resend2@example.com",
            permission="VIEW",
            status="ACTIVE",
        )
        response = auth_client.post(
            f"/api/v1/sharing/proxies/{grant.id}/resend/"
        )
        assert response.status_code == 400


# ---------------------------------------------------------------------------
# Provider Access (unauthenticated)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestProviderAccess:
    def test_valid_code_returns_scoped_record(self, api_client, user):
        provider, raw_code = CareProvider.create_share(
            owner=user,
            name="Dr. Access",
            scopes=["profile", "allergies"],
            access="VIEW",
        )
        response = api_client.post(
            "/api/v1/sharing/provider-access/",
            {"share_code": raw_code},
            format="json",
        )
        assert response.status_code == 200
        data = response.json()
        assert "provider" in data
        assert "record" in data
        assert "profile" in data["record"]
        assert "allergies" in data["record"]
        # Scopes not granted should be absent.
        assert "medications" not in data["record"]

    def test_invalid_code_returns_404(self, api_client):
        response = api_client.post(
            "/api/v1/sharing/provider-access/",
            {"share_code": "MHL-XXXX-XXXX"},
            format="json",
        )
        assert response.status_code == 404

    def test_valid_code_wrong_pin_returns_400(self, api_client, user):
        provider, raw_code = CareProvider.create_share(
            owner=user,
            name="Dr. PIN",
            scopes=["profile"],
            access="VIEW",
            pin="5678",
        )
        response = api_client.post(
            "/api/v1/sharing/provider-access/",
            {"share_code": raw_code, "pin": "0000"},
            format="json",
        )
        assert response.status_code == 400

    def test_valid_code_correct_pin_returns_record(self, api_client, user):
        provider, raw_code = CareProvider.create_share(
            owner=user,
            name="Dr. PIN2",
            scopes=["profile"],
            access="VIEW",
            pin="9999",
        )
        response = api_client.post(
            "/api/v1/sharing/provider-access/",
            {"share_code": raw_code, "pin": "9999"},
            format="json",
        )
        assert response.status_code == 200
        assert "record" in response.json()


@pytest.mark.django_db
class TestProviderNote:
    def test_provider_can_add_note(self, api_client, user):
        provider, raw_code = CareProvider.create_share(
            owner=user,
            name="Dr. Note",
            scopes=["profile", "documents"],
            access="CONTRIBUTE",
        )
        response = api_client.post(
            "/api/v1/sharing/provider-access/note/",
            {"share_code": raw_code, "note": "Patient reviewed, BP stable."},
            format="json",
        )
        assert response.status_code == 201
        assert "document_id" in response.json()

        # Verify the note was added to the owner's record.
        from apps.records.models import HealthDocument

        docs = HealthDocument.objects.filter(user=user)
        assert docs.count() == 1
        assert "Dr. Note" in docs[0].title
        assert docs[0].notes == "Patient reviewed, BP stable."
        assert docs[0].provenance["addedByRole"] == "CARE_PROVIDER"

    def test_view_only_provider_cannot_add_note(self, api_client, user):
        provider, raw_code = CareProvider.create_share(
            owner=user,
            name="Dr. ViewOnly",
            scopes=["profile", "documents"],
            access="VIEW",
        )
        response = api_client.post(
            "/api/v1/sharing/provider-access/note/",
            {"share_code": raw_code, "note": "Should not be allowed."},
            format="json",
        )
        assert response.status_code == 400

    def test_provider_without_documents_scope_cannot_add_note(self, api_client, user):
        provider, raw_code = CareProvider.create_share(
            owner=user,
            name="Dr. NoDocs",
            scopes=["profile"],
            access="CONTRIBUTE",
        )
        response = api_client.post(
            "/api/v1/sharing/provider-access/note/",
            {"share_code": raw_code, "note": "Should not be allowed."},
            format="json",
        )
        assert response.status_code == 400

    def test_provider_note_invalid_code_returns_404(self, api_client):
        response = api_client.post(
            "/api/v1/sharing/provider-access/note/",
            {"share_code": "MHL-XXXX-XXXX", "note": "test"},
            format="json",
        )
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Care-proxy writes: a FULL grant acts on the owner's record, not the proxy's
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestCareProxyWrites:
    def _grant(self, owner, proxy, permission="FULL", status="ACTIVE"):
        return CareProxyGrant.objects.create(
            owner=owner,
            proxy_user=proxy,
            proxy_email=proxy.email,
            permission=permission,
            status=status,
        )

    def _users(self):
        owner = User.objects.create_user(
            email="proxy-owner@example.com", password="Pass123!", name="Owner"
        )
        proxy = User.objects.create_user(
            email="proxy-actor@example.com", password="Pass123!", name="Proxy Person"
        )
        return owner, proxy

    def test_full_grant_create_lands_on_owner_and_notifies_them(self, api_client):
        owner, proxy = self._users()
        self._grant(owner, proxy)
        api_client.force_authenticate(user=proxy)

        response = api_client.post(
            "/api/v1/records/allergies/",
            {"substance": "Penicillin", "allergy_type": "DRUG", "severity": "SEVERE"},
            format="json",
            HTTP_X_ACT_AS_USER=str(owner.id),
        )
        assert response.status_code == 201

        from apps.records.models import Allergy

        created = Allergy.objects.get(id=response.json()["id"])
        assert created.user_id == owner.id
        assert created.provenance["addedByRole"] == "CARE_PROXY"
        assert not Allergy.objects.filter(user=proxy).exists()

        note = owner.notifications.get(kind="RECORD_ADDED")
        assert "Proxy Person" in note.title
        assert note.data["by_proxy"] is True

    def test_full_grant_update_changes_owner_record(self, api_client):
        owner, proxy = self._users()
        self._grant(owner, proxy)
        api_client.force_authenticate(user=proxy)

        from apps.records.models import Allergy

        allergy = Allergy.objects.create(
            user=owner, substance="Dust", allergy_type="ENVIRONMENTAL", severity="MILD"
        )
        response = api_client.patch(
            f"/api/v1/records/allergies/{allergy.id}/",
            {"severity": "SEVERE"},
            format="json",
            HTTP_X_ACT_AS_USER=str(owner.id),
        )
        assert response.status_code == 200
        allergy.refresh_from_db()
        assert allergy.severity == "SEVERE"
        assert owner.notifications.filter(kind="RECORD_UPDATED").exists()
        assert not proxy.notifications.exists()

    def test_view_grant_can_read_but_not_write(self, api_client):
        owner, proxy = self._users()
        self._grant(owner, proxy, permission="VIEW")
        api_client.force_authenticate(user=proxy)

        read = api_client.get(
            "/api/v1/records/allergies/",
            HTTP_X_ACT_AS_USER=str(owner.id),
        )
        assert read.status_code == 200

        write = api_client.post(
            "/api/v1/records/allergies/",
            {"substance": "Latex", "allergy_type": "OTHER", "severity": "MILD"},
            format="json",
            HTTP_X_ACT_AS_USER=str(owner.id),
        )
        assert write.status_code == 403

    def test_proxy_cannot_act_without_an_active_grant(self, api_client):
        owner, proxy = self._users()
        self._grant(owner, proxy, status="REVOKED")
        api_client.force_authenticate(user=proxy)

        response = api_client.get(
            "/api/v1/records/allergies/",
            HTTP_X_ACT_AS_USER=str(owner.id),
        )
        assert response.status_code == 403


# ---------------------------------------------------------------------------
# Provider record writes (unauthenticated) — View & fill in
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestProviderRecordWrites:
    def _share(self, owner, access="CONTRIBUTE", scopes=("allergies",), pin=""):
        return CareProvider.create_share(
            owner=owner,
            name="Dr. Writer",
            scopes=list(scopes),
            access=access,
            pin=pin or None,
        )

    def test_provider_adds_record_in_granted_scope(self, api_client, user):
        provider, code = self._share(user)
        response = api_client.post(
            "/api/v1/sharing/provider-access/records/",
            {
                "share_code": code,
                "scope": "allergies",
                "action": "create",
                "data": {
                    "substance": "Sulfa drugs",
                    "allergy_type": "DRUG",
                    "severity": "SEVERE",
                },
            },
            format="json",
        )
        assert response.status_code == 201
        assert response.json()["substance"] == "Sulfa drugs"

        from apps.records.models import Allergy

        saved = Allergy.objects.get(user=user)
        assert saved.substance == "Sulfa drugs"
        assert saved.provenance["addedByRole"] == "CARE_PROVIDER"
        assert user.notifications.filter(kind="RECORD_ADDED").exists()

    def test_provider_updates_record_in_granted_scope(self, api_client, user):
        provider, code = self._share(user)
        from apps.records.models import Allergy

        allergy = Allergy.objects.create(
            user=user, substance="Pollen", allergy_type="ENVIRONMENTAL", severity="MILD"
        )
        response = api_client.post(
            "/api/v1/sharing/provider-access/records/",
            {
                "share_code": code,
                "scope": "allergies",
                "action": "update",
                "id": str(allergy.id),
                "data": {"severity": "SEVERE", "notes": "Worse in spring."},
            },
            format="json",
        )
        assert response.status_code == 200
        allergy.refresh_from_db()
        assert allergy.severity == "SEVERE"
        assert allergy.notes == "Worse in spring."
        assert user.notifications.filter(kind="RECORD_UPDATED").exists()

    def test_view_only_provider_cannot_write(self, api_client, user):
        provider, code = self._share(user, access="VIEW")
        response = api_client.post(
            "/api/v1/sharing/provider-access/records/",
            {
                "share_code": code,
                "scope": "allergies",
                "data": {"substance": "Latex", "allergy_type": "OTHER", "severity": "MILD"},
            },
            format="json",
        )
        assert response.status_code == 400
        from apps.records.models import Allergy

        assert not Allergy.objects.filter(user=user).exists()

    def test_provider_cannot_write_outside_granted_scope(self, api_client, user):
        provider, code = self._share(user, scopes=("allergies",))
        response = api_client.post(
            "/api/v1/sharing/provider-access/records/",
            {
                "share_code": code,
                "scope": "medications",
                "data": {"name": "Aspirin", "dosage": "75mg", "frequency": "Daily"},
            },
            format="json",
        )
        assert response.status_code == 400
        from apps.records.models import Medication

        assert not Medication.objects.filter(user=user).exists()

    def test_provider_can_only_update_records_belonging_to_the_share_owner(
        self, api_client, user
    ):
        other = User.objects.create_user(
            email="other-owner@example.com", password="Pass123!"
        )
        provider, code = self._share(user)
        from apps.records.models import Allergy

        foreign = Allergy.objects.create(
            user=other, substance="Shellfish", allergy_type="FOOD", severity="MILD"
        )
        response = api_client.post(
            "/api/v1/sharing/provider-access/records/",
            {
                "share_code": code,
                "scope": "allergies",
                "action": "update",
                "id": str(foreign.id),
                "data": {"severity": "SEVERE"},
            },
            format="json",
        )
        assert response.status_code == 404
        foreign.refresh_from_db()
        assert foreign.severity == "MILD"

    def test_provider_write_requires_the_share_pin(self, api_client, user):
        provider, code = self._share(user, pin="4321")
        payload = {
            "share_code": code,
            "scope": "allergies",
            "data": {"substance": "Latex", "allergy_type": "OTHER", "severity": "MILD"},
        }
        wrong = api_client.post(
            "/api/v1/sharing/provider-access/records/",
            {**payload, "pin": "0000"},
            format="json",
        )
        assert wrong.status_code == 400

        right = api_client.post(
            "/api/v1/sharing/provider-access/records/",
            {**payload, "pin": "4321"},
            format="json",
        )
        assert right.status_code == 201


@pytest.mark.django_db
class TestProviderWritesBeyondLists:
    """Fill-in access covers basic info, documents and immunisations too."""

    def test_provider_updates_basic_info(self, api_client, user):
        _, code = CareProvider.create_share(owner=user, name="Dr. B", scopes=["profile"], access="CONTRIBUTE")
        response = api_client.post(
            "/api/v1/sharing/provider-access/records/",
            {"share_code": code, "scope": "profile", "action": "update", "data": {"blood_type": "O+"}},
            format="json",
        )
        assert response.status_code == 200
        user.health_profile.refresh_from_db()
        assert user.health_profile.blood_type == "O+"

    def test_provider_uploads_a_document(self, api_client, user):
        import json

        from django.core.files.uploadedfile import SimpleUploadedFile

        from apps.records.models import HealthDocument

        _, code = CareProvider.create_share(owner=user, name="Dr. C", scopes=["documents"], access="CONTRIBUTE")
        pdf = SimpleUploadedFile("result.pdf", b"%PDF-1.4\n%%EOF\n", content_type="application/pdf")
        response = api_client.post(
            "/api/v1/sharing/provider-access/records/",
            {
                "share_code": code,
                "scope": "documents",
                "action": "create",
                "data": json.dumps({"title": "FBC", "doc_type": "LAB_RESULT"}),
                "file": pdf,
            },
            format="multipart",
        )
        assert response.status_code == 201, response.content
        doc = HealthDocument.objects.get(user=user)
        assert doc.title == "FBC"
        assert doc.provenance["addedByRole"] == "CARE_PROVIDER"

    def test_view_only_provider_cannot_change_basic_info(self, api_client, user):
        _, code = CareProvider.create_share(owner=user, name="Dr. D", scopes=["profile"], access="VIEW")
        response = api_client.post(
            "/api/v1/sharing/provider-access/records/",
            {"share_code": code, "scope": "profile", "data": {"blood_type": "AB-"}},
            format="json",
        )
        assert response.status_code == 400
