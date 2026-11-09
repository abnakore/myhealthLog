"""
Care-provider PIN management, wrong-PIN lockout, share-code normalisation,
and the emails sharing actions send.
"""

import pytest
from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from rest_framework.test import APIClient

from apps.sharing.models import CareProvider, CareProxyGrant

User = get_user_model()


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def owner(db):
    return User.objects.create_user(email="owner@example.com", password="StrongPass123!", name="Ada Owner")


@pytest.fixture
def owner_client(owner):
    client = APIClient()
    client.force_authenticate(user=owner)
    return client


def _share(owner, pin=None):
    provider, code = CareProvider.create_share(
        owner=owner, name="Dr. Bello", scopes=["allergies"], pin=pin
    )
    return provider, code


def _open(code, pin=""):
    return APIClient().post(
        "/api/v1/sharing/provider-access/", {"share_code": code, "pin": pin}, format="json"
    )


@pytest.mark.django_db
class TestProviderPin:
    def test_owner_can_set_a_pin_on_a_code_without_one(self, owner, owner_client):
        provider, code = _share(owner)
        assert _open(code).status_code == 200

        r = owner_client.patch(f"/api/v1/sharing/providers/{provider.id}/", {"pin": "4321"}, format="json")
        assert r.status_code == 200
        assert r.json()["pin_enabled"] is True
        assert _open(code).status_code == 400
        assert _open(code, "4321").status_code == 200

    def test_owner_can_change_the_pin(self, owner, owner_client):
        provider, code = _share(owner, pin="1111")
        owner_client.patch(f"/api/v1/sharing/providers/{provider.id}/", {"pin": "2222"}, format="json")
        assert _open(code, "1111").status_code == 400
        assert _open(code, "2222").status_code == 200

    def test_owner_can_remove_the_pin(self, owner, owner_client):
        provider, code = _share(owner, pin="1111")
        r = owner_client.patch(
            f"/api/v1/sharing/providers/{provider.id}/", {"remove_pin": True}, format="json"
        )
        assert r.status_code == 200
        assert r.json()["pin_enabled"] is False
        assert _open(code).status_code == 200

    def test_pin_and_remove_together_is_rejected(self, owner, owner_client):
        provider, _ = _share(owner, pin="1111")
        r = owner_client.patch(
            f"/api/v1/sharing/providers/{provider.id}/",
            {"pin": "2222", "remove_pin": True},
            format="json",
        )
        assert r.status_code == 400

    def test_bad_pin_format_is_rejected(self, owner, owner_client):
        provider, _ = _share(owner)
        r = owner_client.patch(f"/api/v1/sharing/providers/{provider.id}/", {"pin": "12"}, format="json")
        assert r.status_code == 400

    def test_another_user_cannot_reset_my_pin(self, owner, db):
        provider, _ = _share(owner, pin="1111")
        other = User.objects.create_user(email="x@example.com", password="StrongPass123!", name="X")
        client = APIClient()
        client.force_authenticate(user=other)
        r = client.patch(f"/api/v1/sharing/providers/{provider.id}/", {"pin": "9999"}, format="json")
        assert r.status_code == 404

    def test_scopes_are_validated_on_edit(self, owner, owner_client):
        provider, _ = _share(owner)
        r = owner_client.patch(
            f"/api/v1/sharing/providers/{provider.id}/", {"scopes": ["passwords"]}, format="json"
        )
        assert r.status_code == 400


@pytest.mark.django_db
class TestPinLockout:
    def test_five_wrong_pins_lock_the_code_and_reset_unlocks_it(self, owner, owner_client):
        provider, code = _share(owner, pin="1234")
        for _ in range(5):
            assert _open(code, "0000").status_code == 400
        # Even the right PIN is refused while locked.
        locked = _open(code, "1234")
        assert locked.status_code == 400
        assert "Too many wrong PINs" in locked.json()["error"]["message"]

        owner_client.patch(f"/api/v1/sharing/providers/{provider.id}/", {"pin": "5678"}, format="json")
        assert _open(code, "5678").status_code == 200

    def test_success_clears_earlier_misses(self, owner):
        _, code = _share(owner, pin="1234")
        for _ in range(4):
            _open(code, "0000")
        assert _open(code, "1234").status_code == 200
        for _ in range(4):
            assert _open(code, "0000").status_code == 400
        assert _open(code, "1234").status_code == 200


@pytest.mark.django_db
class TestShareCodeNormalisation:
    def test_lowercase_spaces_and_missing_dashes_still_open(self, owner):
        _, code = _share(owner)
        compact = code.replace("-", "").lower()
        assert _open(compact).status_code == 200
        assert _open(f"  {code.lower()}  ").status_code == 200


@pytest.mark.django_db
class TestFirstOpenNotification:
    def test_owner_is_notified_and_emailed_once(self, owner, django_capture_on_commit_callbacks):
        from apps.notifications.models import Notification

        _, code = _share(owner)
        with django_capture_on_commit_callbacks(execute=True):
            _open(code)
            _open(code)
        assert Notification.objects.filter(user=owner, kind="SHARE_FIRST_OPENED").count() == 1
        assert [m.to for m in mail.outbox] == [[owner.email]]


@pytest.mark.django_db
class TestProxyEmails:
    def test_invite_emails_someone_without_an_account(self, owner_client, django_capture_on_commit_callbacks):
        with django_capture_on_commit_callbacks(execute=True):
            r = owner_client.post(
                "/api/v1/sharing/proxies/",
                {"proxy_email": "newperson@example.com", "permission": "VIEW"},
                format="json",
            )
        assert r.status_code == 201
        assert len(mail.outbox) == 1
        assert mail.outbox[0].to == ["newperson@example.com"]
        assert "register?email=newperson@example.com" in mail.outbox[0].body

    def test_accept_and_revoke_email_the_other_party(self, owner, owner_client, django_capture_on_commit_callbacks):
        proxy = User.objects.create_user(email="proxy@example.com", password="StrongPass123!", name="Pat Proxy")
        grant = CareProxyGrant.objects.create(owner=owner, proxy_email=proxy.email, permission="VIEW")
        proxy_client = APIClient()
        proxy_client.force_authenticate(user=proxy)

        with django_capture_on_commit_callbacks(execute=True):
            assert proxy_client.post(f"/api/v1/sharing/proxies/{grant.id}/accept/").status_code == 200
        assert mail.outbox[-1].to == [owner.email]

        with django_capture_on_commit_callbacks(execute=True):
            assert owner_client.post(f"/api/v1/sharing/proxies/{grant.id}/revoke/").status_code == 200
        assert mail.outbox[-1].to == [proxy.email]

    def test_emails_carry_no_health_data(self, owner, owner_client, django_capture_on_commit_callbacks):
        from apps.records.models import Allergy

        Allergy.objects.create(user=owner, substance="Penicillin", severity="ANAPHYLAXIS")
        with django_capture_on_commit_callbacks(execute=True):
            owner_client.post(
                "/api/v1/sharing/proxies/",
                {"proxy_email": "someone@example.com", "permission": "FULL"},
                format="json",
            )
        assert "Penicillin" not in mail.outbox[0].body
