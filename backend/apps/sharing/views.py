"""
Sharing & Safety views.

Authenticated:
  GET/POST /api/v1/sharing/providers/         — list / create care provider shares
  GET/PATCH/DELETE /api/v1/sharing/providers/<id>/ — manage one share
  POST /api/v1/sharing/providers/<id>/revoke/ — revoke a share

  GET/PATCH /api/v1/sharing/emergency/        — read / update emergency card settings
  POST /api/v1/sharing/emergency/regenerate/  — mint a new emergency token (returns raw)

  GET/POST /api/v1/sharing/proxies/           — list / create proxy grants
  GET/PATCH /api/v1/sharing/proxies/<id>/     — manage one grant
  POST /api/v1/sharing/proxies/<id>/revoke/   — revoke a grant
  POST /api/v1/sharing/proxies/<id>/accept/   — accept an incoming invitation
  POST /api/v1/sharing/proxies/<id>/decline/  — decline an incoming invitation

Unauthenticated:
  POST /api/v1/sharing/provider-access/       — provider opens a share with a code+PIN
"""

import logging

from django.utils import timezone
from rest_framework import status
from rest_framework.generics import get_object_or_404
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from apps.core.exceptions import BusinessRuleError
from apps.core.pagination import StandardResultsSetPagination

from .models import CareProvider, CareProxyGrant, EmergencySettings
from .serializers import (
    CareProviderCreateSerializer,
    CareProviderOwnerSerializer,
    CareProviderReadSerializer,
    CareProviderUpdateSerializer,
    CareProxyGrantCreateSerializer,
    CareProxyGrantReadSerializer,
    EmergencySettingsSerializer,
    EmergencySettingsUpdateSerializer,
    ProviderAccessRequestSerializer,
    ProviderNoteSerializer,
    ProviderRecordWriteSerializer,
)
from .services import ProviderAccessService

logger = logging.getLogger(__name__)


def _email_proxy_invite(grant, owner, resent: bool = False) -> None:
    """Email the invitee — the only way someone without an account learns of it."""
    from django.contrib.auth import get_user_model

    from apps.notifications.emails import app_url, send_email

    has_account = get_user_model().objects.filter(email__iexact=grant.proxy_email).exists()
    who = owner.name or owner.email
    level = (
        "view their record"
        if grant.permission == CareProxyGrant.Permission.VIEW
        else "view and update their record on their behalf"
    )
    paragraphs = [
        f"{who} has invited you to be their care proxy on myHealthLog, so you can {level}.",
    ]
    if grant.message:
        paragraphs.append(f'Their message: "{grant.message}"')
    if has_account:
        paragraphs.append("Sign in to accept or decline the invitation.")
        button = ("Review the invitation", app_url("/app/proxy"))
    else:
        paragraphs.append(
            f"Create a free account with this email address ({grant.proxy_email}) and the "
            "invitation will be waiting for you."
        )
        button = ("Create your account", app_url(f"/register?email={grant.proxy_email}"))
    send_email(
        grant.proxy_email,
        ("Reminder: " if resent else "") + f"{who} invited you to their health record",
        "You've been invited as a care proxy",
        paragraphs,
        button,
    )


class ProviderAccessThrottle(AnonRateThrottle):
    """Per-IP cap on the public share-code endpoints (code guessing)."""

    scope = "provider_access"


# ---------------------------------------------------------------------------
# Care Providers
# ---------------------------------------------------------------------------


class CareProviderListView(APIView):
    """
    GET  — list all share links the user has created.
    POST — create a new share link; returns the raw share code once.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        providers = CareProvider.objects.filter(owner=request.user).order_by("-created_at")
        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(providers, request)
        return paginator.get_paginated_response(
            CareProviderOwnerSerializer(page, many=True).data
        )

    def post(self, request):
        serializer = CareProviderCreateSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()

        data = CareProviderOwnerSerializer(instance).data
        data["share_code"] = instance._raw_code
        if instance.pin_enabled:
            data["pin_enabled"] = True

        logger.info(
            "CareProvider share created: %s for user %s", instance.id, request.user.id
        )
        # Notify the owner that their share was created
        try:
            from apps.notifications.models import Notification
            from apps.notifications.utils import notify

            notify(
                user=request.user,
                kind=Notification.Kind.PROVIDER_CREATED,
                title=f"Access code created for {instance.name}",
                body=(
                    f"Share this code with {instance.name}"
                    + (f" at {instance.facility}" if instance.facility else "")
                    + ". It opens only the parts of your record you chose."
                ),
                data={
                    "provider_id": str(instance.id),
                    "provider_name": instance.name,
                    "link": "/app/providers",
                },
            )
        except Exception:
            logger.exception("Failed to send provider-created notification for %s", instance.id)

        return Response(data, status=status.HTTP_201_CREATED)


class CareProviderDetailView(APIView):
    """
    GET    — retrieve one share link.
    PATCH  — update name / role / scopes.
    DELETE — hard-delete the share record.
    """

    permission_classes = [IsAuthenticated]

    def _get_provider(self, user, pk):
        return get_object_or_404(CareProvider, pk=pk, owner=user)

    def get(self, request, pk):
        provider = self._get_provider(request.user, pk)
        return Response(CareProviderOwnerSerializer(provider).data)

    def patch(self, request, pk):
        provider = self._get_provider(request.user, pk)
        serializer = CareProviderUpdateSerializer(
            provider, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(CareProviderOwnerSerializer(provider).data)

    def delete(self, request, pk):
        provider = self._get_provider(request.user, pk)
        provider.hard_delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def post(self, request, pk):
        """POST .../revoke/ — revoke a share link."""
        provider = self._get_provider(request.user, pk)
        if provider.status == CareProvider.Status.REVOKED:
            raise BusinessRuleError("This share is already revoked.")
        provider.status = CareProvider.Status.REVOKED
        provider.save(update_fields=["status"])
        logger.info("Share %s revoked by user %s", pk, request.user.id)
        return Response(CareProviderOwnerSerializer(provider).data)


# ---------------------------------------------------------------------------
# Emergency Settings
# ---------------------------------------------------------------------------


class EmergencySettingsView(APIView):
    """
    GET   — read emergency card settings.
    PATCH — update toggles / PIN / note.
    """

    permission_classes = [IsAuthenticated]

    def _get_settings(self, user):
        settings_obj, raw_token = EmergencySettings.get_or_create_for_user(user)
        return settings_obj, raw_token

    def get(self, request):
        settings_obj, _ = self._get_settings(request.user)
        return Response(EmergencySettingsSerializer(settings_obj).data)

    def patch(self, request):
        settings_obj, _ = self._get_settings(request.user)
        serializer = EmergencySettingsUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(instance=settings_obj)
        return Response(EmergencySettingsSerializer(settings_obj).data)


class EmergencyTokenRegenerateView(APIView):
    """
    POST /api/v1/sharing/emergency/regenerate/
    Mint a new emergency token.  The old token is invalidated immediately.
    Returns the new token; the settings page can show it again at any time.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        settings_obj, _ = EmergencySettings.get_or_create_for_user(request.user)
        raw_token = settings_obj.regenerate_token()
        logger.info("Emergency token regenerated for user %s", request.user.id)
        return Response({**EmergencySettingsSerializer(settings_obj).data, "token": raw_token})


# ---------------------------------------------------------------------------
# Care Proxy Grants
# ---------------------------------------------------------------------------


class CareProxyGrantListView(APIView):
    """
    GET  — list grants the user has given AND invitations they have received.
    POST — invite someone to be a proxy.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        given = CareProxyGrant.objects.filter(
            owner=request.user
        ).select_related("owner", "proxy_user").order_by("-invited_at")
        received = CareProxyGrant.objects.filter(
            proxy_email=request.user.email,
            status__in=[CareProxyGrant.Status.INVITED, CareProxyGrant.Status.ACTIVE],
        ).select_related("owner", "proxy_user").order_by("-invited_at")
        return Response(
            {
                "given": CareProxyGrantReadSerializer(given, many=True).data,
                "received": CareProxyGrantReadSerializer(received, many=True).data,
            }
        )

    def post(self, request):
        serializer = CareProxyGrantCreateSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        grant = serializer.save()
        logger.info(
            "Proxy grant created: %s invited %s (%s)",
            request.user.id,
            grant.proxy_email,
            grant.permission,
        )
        # Notify the invitee if they already have an account
        try:
            from django.contrib.auth import get_user_model

            from apps.notifications.models import Notification
            from apps.notifications.utils import notify

            User = get_user_model()
            invitee = User.objects.filter(email=grant.proxy_email).first()
            if invitee:
                notify(
                    user=invitee,
                    kind=Notification.Kind.PROXY_INVITE_RECEIVED,
                    title=f"{request.user.name or 'Someone'} invited you to their record",
                    body=(
                        f"{request.user.name or 'A myHealthLog user'} has invited you to access "
                        f"their health record with {grant.get_permission_display()} access."
                    ),
                    data={
                        "grant_id": str(grant.id),
                        "owner_name": request.user.name or "",
                        "permission": grant.permission,
                        "link": "/app/proxy",
                    },
                )
        except Exception:
            logger.exception("Failed to send proxy invite notification for grant %s", grant.id)
        _email_proxy_invite(grant, request.user)

        return Response(
            CareProxyGrantReadSerializer(grant).data,
            status=status.HTTP_201_CREATED,
        )


class CareProxyGrantDetailView(APIView):
    """
    GET  — retrieve a grant.
    POST — action endpoint (revoke / accept / decline) — keyed by url_path.
    """

    permission_classes = [IsAuthenticated]

    def _get_grant_as_owner(self, user, pk):
        return get_object_or_404(CareProxyGrant, pk=pk, owner=user)

    def _get_grant_as_proxy(self, user, pk):
        return get_object_or_404(
            CareProxyGrant,
            pk=pk,
            proxy_email=user.email,
            status=CareProxyGrant.Status.INVITED,
        )

    def get(self, request, pk):
        # Both the owner and the addressed proxy may read the grant.
        try:
            grant = self._get_grant_as_owner(request.user, pk)
        except Exception:
            grant = get_object_or_404(
                CareProxyGrant,
                pk=pk,
                proxy_email=request.user.email,
            )
        return Response(CareProxyGrantReadSerializer(grant).data)

    def revoke(self, request, pk):
        """Revoke a grant the user gave."""
        grant = self._get_grant_as_owner(request.user, pk)
        if grant.status == CareProxyGrant.Status.REVOKED:
            raise BusinessRuleError("This grant is already revoked.")
        grant.status = CareProxyGrant.Status.REVOKED
        grant.revoked_at = timezone.now()
        grant.save(update_fields=["status", "revoked_at"])
        logger.info("Proxy grant %s revoked by user %s", pk, request.user.id)
        # Notify the proxy that their access was revoked
        try:
            from apps.notifications.models import Notification
            from apps.notifications.utils import notify

            if grant.proxy_user:
                notify(
                    user=grant.proxy_user,
                    kind=Notification.Kind.PROXY_ACCESS_REVOKED,
                    title=f"Access to {request.user.name or 'a record'} has been revoked",
                    body=f"{request.user.name or 'The record owner'} has removed your access to their health record.",
                    data={"grant_id": str(grant.id), "owner_name": request.user.name or ""},
                )
        except Exception:
            logger.exception("Failed to send revoke notification for grant %s", pk)
        from apps.notifications.emails import send_email

        send_email(
            grant.proxy_email,
            f"Your access to {request.user.name or 'a health record'} has ended",
            "Care proxy access ended",
            [
                f"{request.user.name or 'The record owner'} has removed your access to their "
                "health record on myHealthLog. You can no longer open or change it.",
            ],
        )
        return Response(CareProxyGrantReadSerializer(grant).data)

    def accept(self, request, pk):
        """Accept an invitation addressed to the authenticated user."""
        grant = self._get_grant_as_proxy(request.user, pk)
        grant.status = CareProxyGrant.Status.ACTIVE
        grant.proxy_user = request.user
        grant.proxy_name = request.user.name or request.user.email
        grant.accepted_at = timezone.now()
        grant.save(update_fields=["status", "proxy_user", "proxy_name", "accepted_at"])
        logger.info("Proxy grant %s accepted by user %s", pk, request.user.id)
        # Notify the owner that their invitation was accepted
        try:
            from apps.notifications.models import Notification
            from apps.notifications.utils import notify

            notify(
                user=grant.owner,
                kind=Notification.Kind.PROXY_INVITE_ACCEPTED,
                title=f"{request.user.name or grant.proxy_email} accepted your invitation",
                body=(
                    f"{request.user.name or grant.proxy_email} can now access your health record "
                    f"with {grant.get_permission_display()} access."
                ),
                data={
                    "grant_id": str(grant.id),
                    "proxy_name": request.user.name or grant.proxy_email,
                    "link": "/app/proxy",
                },
            )
        except Exception:
            logger.exception("Failed to send accept notification for grant %s", pk)
        from apps.notifications.emails import app_url, send_email

        send_email(
            grant.owner.email,
            f"{request.user.name or grant.proxy_email} accepted your invitation",
            "Your care proxy is connected",
            [
                f"{request.user.name or grant.proxy_email} accepted your invitation and can now "
                f"access your health record ({grant.get_permission_display().lower()}).",
                "You can change their permission or remove them at any time.",
            ],
            ("Manage care proxies", app_url("/app/proxy")),
        )
        return Response(CareProxyGrantReadSerializer(grant).data)

    def decline(self, request, pk):
        """Decline an invitation addressed to the authenticated user."""
        grant = self._get_grant_as_proxy(request.user, pk)
        grant.status = CareProxyGrant.Status.DECLINED
        grant.save(update_fields=["status"])
        # Notify the owner that their invitation was declined
        try:
            from apps.notifications.models import Notification
            from apps.notifications.utils import notify

            notify(
                user=grant.owner,
                kind=Notification.Kind.PROXY_INVITE_DECLINED,
                title=f"{request.user.name or grant.proxy_email} declined your invitation",
                body=f"{request.user.name or grant.proxy_email} has declined access to your health record.",
                data={
                    "grant_id": str(grant.id),
                    "proxy_name": request.user.name or grant.proxy_email,
                    "link": "/app/proxy",
                },
            )
        except Exception:
            logger.exception("Failed to send decline notification for grant %s", pk)
        from apps.notifications.emails import app_url, send_email

        send_email(
            grant.owner.email,
            f"{request.user.name or grant.proxy_email} declined your invitation",
            "Invitation declined",
            [f"{request.user.name or grant.proxy_email} declined access to your health record."],
            ("Manage care proxies", app_url("/app/proxy")),
        )
        return Response(CareProxyGrantReadSerializer(grant).data)

    def patch(self, request, pk):
        """
        Update a grant the user gave (e.g. change permission level).

        Only the owner may call this, and only on an ACTIVE or INVITED grant.
        """
        grant = self._get_grant_as_owner(request.user, pk)
        if grant.status not in (CareProxyGrant.Status.INVITED, CareProxyGrant.Status.ACTIVE):
            raise BusinessRuleError("Only active or pending grants can be modified.")
        permission = request.data.get("permission")
        if permission not in CareProxyGrant.Permission.values:
            raise BusinessRuleError("Invalid permission level.")
        grant.permission = permission
        grant.save(update_fields=["permission"])
        logger.info("Proxy grant %s permission updated to %s by user %s", pk, permission, request.user.id)
        return Response(CareProxyGrantReadSerializer(grant).data)

    def resend(self, request, pk):
        """Re-stamp invited_at on an INVITED grant (owner only)."""
        grant = self._get_grant_as_owner(request.user, pk)
        if grant.status != CareProxyGrant.Status.INVITED:
            raise BusinessRuleError("Only pending invitations can be resent.")
        grant.invited_at = timezone.now()
        grant.save(update_fields=["invited_at"])
        logger.info("Proxy grant %s invite resent by user %s", pk, request.user.id)
        _email_proxy_invite(grant, request.user, resent=True)
        return Response(CareProxyGrantReadSerializer(grant).data)


# ---------------------------------------------------------------------------
# Provider access (unauthenticated) — a provider opens a share link
# ---------------------------------------------------------------------------


class ProviderAccessView(APIView):
    """
    POST /api/v1/sharing/provider-access/
    A healthcare provider opens a share link using their code + optional PIN.
    Returns the scoped record view if the code is valid.
    """

    permission_classes = [AllowAny]
    throttle_classes = [ProviderAccessThrottle]

    def post(self, request):
        serializer = ProviderAccessRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        provider = ProviderAccessService.resolve(
            share_code=serializer.validated_data["share_code"],
            pin=serializer.validated_data.get("pin", ""),
        )

        # Notify the owner when a provider opens their shared link for the first
        # time. resolve() has already stamped last_accessed_at, so it records
        # whether this was the first open before doing so.
        first_open = getattr(provider, "_first_open", False)

        if first_open:
            try:
                from apps.notifications.models import Notification
                from apps.notifications.utils import notify

                notify(
                    user=provider.owner,
                    kind=Notification.Kind.SHARE_FIRST_OPENED,
                    title=f"{provider.name} opened your shared record",
                    body=(
                        f"{provider.name}"
                        + (f" from {provider.facility}" if provider.facility else "")
                        + " has opened the access link you shared with them."
                    ),
                    data={
                        "provider_id": str(provider.id),
                        "provider_name": provider.name,
                        "link": "/app/providers",
                    },
                )
            except Exception:
                logger.exception("Failed to notify owner of provider first-open for provider %s", provider.id)
            from apps.notifications.emails import app_url, send_email

            send_email(
                provider.owner.email,
                f"{provider.name} opened your shared health record",
                "Your access code was used",
                [
                    f"{provider.name}"
                    + (f" ({provider.facility})" if provider.facility else "")
                    + " just opened the parts of your record you shared with them.",
                    "If you didn't expect this, revoke the code now. It stops working at once.",
                ],
                ("Review care providers", app_url("/app/providers")),
            )

        record = ProviderAccessService.compile_scoped_record(provider)
        return Response(
            {
                "provider": CareProviderReadSerializer(provider).data,
                "record": record,
            }
        )


class ProviderNoteView(APIView):
    """
    POST /api/v1/sharing/provider-access/note/

    A healthcare provider with CONTRIBUTE access and the 'documents' scope
    may add a note to the owner's record. The note is stored as a
    HealthDocument with the provider's name in the provenance.
    """

    permission_classes = [AllowAny]
    throttle_classes = [ProviderAccessThrottle]

    def post(self, request):
        serializer = ProviderNoteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        provider = ProviderAccessService.resolve(
            share_code=serializer.validated_data["share_code"],
            pin=serializer.validated_data.get("pin", ""),
        )

        if provider.access != CareProvider.Access.CONTRIBUTE:
            raise BusinessRuleError("This share does not allow adding notes.")
        if "documents" not in provider.scopes:
            raise BusinessRuleError("This share does not include the documents scope.")

        note_text = serializer.validated_data["note"].strip()
        owner = provider.owner
        from django.utils import timezone as tz

        from apps.records.models import HealthDocument

        doc = HealthDocument.objects.create(
            user=owner,
            title=f"Note from {provider.name}",
            doc_type=HealthDocument.DocType.OTHER,
            document_file=None,
            file_name="",
            file_size=0,
            mime_type="",
            notes=note_text,
            provider=provider.facility or provider.name,
            provenance={
                "addedBy": provider.name,
                "addedById": str(provider.id),
                "addedByRole": "CARE_PROVIDER",
                "addedAt": tz.now().isoformat(),
            },
        )
        # Notify the record owner that the provider added a note
        try:
            from apps.notifications.models import Notification
            from apps.notifications.utils import notify

            notify(
                user=owner,
                kind=Notification.Kind.PROVIDER_NOTE_ADDED,
                title=f"{provider.name} added a note to your record",
                body=note_text[:120] + ("…" if len(note_text) > 120 else ""),
                data={
                    "record_type": "document",
                    "record_id": str(doc.id),
                    "provider_name": provider.name,
                    "link": "/app/documents",
                },
            )
        except Exception:
            logger.exception("Failed to send provider-note notification for document %s", doc.id)
        logger.info(
            "Provider note added by %s to user %s's record (document %s)",
            provider.id,
            owner.id,
            doc.id,
        )
        return Response(
            {
                "detail": "Note added to the record.",
                "document_id": str(doc.id),
            },
            status=status.HTTP_201_CREATED,
        )


# ---------------------------------------------------------------------------
# Provider record writes (unauthenticated) — View & fill in
# ---------------------------------------------------------------------------


def _provider_write_target(scope: str):
    """
    Map a share scope to (model, write serializer, read serializer, label, link).

    Imported lazily so the sharing app keeps no import-time dependency on the
    records app, and so a scope that is not writable simply has no entry.
    """
    from apps.records import models as m
    from apps.records import serializers as s

    from apps.profiles import models as pm
    from apps.profiles import serializers as ps

    return {
        "profile": (pm.HealthProfile, ps.HealthProfileWriteSerializer, ps.HealthProfileReadSerializer, "basic info", "/app/profile"),
        "allergies": (m.Allergy, s.AllergyWriteSerializer, s.AllergyReadSerializer, "allergy", "/app/allergies"),
        "medications": (m.Medication, s.MedicationWriteSerializer, s.MedicationReadSerializer, "medication", "/app/medications"),
        "conditions": (m.Condition, s.ConditionWriteSerializer, s.ConditionReadSerializer, "condition", "/app/conditions"),
        "measurements": (m.VitalReading, s.VitalReadingWriteSerializer, s.VitalReadingReadSerializer, "measurement", "/app/measurements"),
        "appointments": (m.Appointment, s.AppointmentWriteSerializer, s.AppointmentReadSerializer, "appointment", "/app/appointments"),
        "documents": (m.HealthDocument, s.HealthDocumentWriteSerializer, s.HealthDocumentReadSerializer, "document", "/app/documents"),
        "immunizations": (m.Immunization, s.ImmunizationWriteSerializer, s.ImmunizationReadSerializer, "immunisation", "/app/medical-summary"),
    }.get(scope)


class ProviderRecordSaveView(APIView):
    """
    POST /api/v1/sharing/provider-access/records/

    A care provider with View & fill in access adds or edits one record inside
    a scope the owner granted. The scope is checked on every call, so a code
    that only covers allergies can never touch medications. Every write lands
    on the owner's record and raises a notification for the owner.
    """

    permission_classes = [AllowAny]
    throttle_classes = [ProviderAccessThrottle]

    def post(self, request):
        serializer = ProviderRecordWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        provider = ProviderAccessService.resolve(
            share_code=serializer.validated_data["share_code"],
            pin=serializer.validated_data.get("pin", ""),
        )

        if provider.access != CareProvider.Access.CONTRIBUTE:
            raise BusinessRuleError("This share only allows viewing the record.")

        scope = serializer.validated_data["scope"]
        if scope not in provider.scopes:
            raise BusinessRuleError("This share does not include that part of the record.")

        action = serializer.validated_data["action"]

        target = _provider_write_target(scope)
        if target is None:
            raise BusinessRuleError("That part of the record cannot be edited here.")
        model, write_cls, read_cls, label, link = target

        owner = provider.owner
        payload = dict(serializer.validated_data["data"])
        # A document arrives as multipart: the record in `data`, the file beside it.
        upload = request.FILES.get("file")
        if upload is not None:
            payload["file"] = upload

        if scope == "profile":
            # Basic info is one row per person: always an edit, never a new record.
            action = "update"
            instance, _ = model.objects.get_or_create(user=owner)
            write = write_cls(instance, data=payload, partial=True, context={"request": request})
        elif action == "update":
            record_id = serializer.validated_data.get("id")
            if not record_id:
                raise BusinessRuleError("Choose the record to change.")
            instance = get_object_or_404(model, pk=record_id, user=owner)
            write = write_cls(instance, data=payload, partial=True, context={"request": request})
        else:
            write = write_cls(data=payload, context={"request": request})

        write.is_valid(raise_exception=True)

        if action == "update":
            instance = write.save()
            kind = "RECORD_UPDATED"
            verb = "updated"
        else:
            instance = write.save(
                user=owner,
                provenance={
                    "addedBy": provider.name,
                    "addedById": str(provider.id),
                    "addedByRole": "CARE_PROVIDER",
                    "addedAt": timezone.now().isoformat(),
                },
            )
            kind = "RECORD_ADDED"
            verb = "added"

        # "an allergy", "a medication"; basic info reads "your basic info".
        article = "your" if scope == "profile" else ("an" if label[:1] in "aeiou" else "a")
        where = "" if scope == "profile" else " in your record"
        try:
            from apps.notifications.models import Notification
            from apps.notifications.utils import notify

            notify(
                user=owner,
                kind=kind,
                title=f"{provider.name} {verb} {article} {label}{where}",
                body=(
                    f"{provider.name}"
                    + (f" from {provider.facility}" if provider.facility else "")
                    + f" ({provider.get_access_display().lower()}) {verb} {article} {label} using the access link you shared."
                ),
                data={
                    "record_type": scope,
                    "record_id": str(instance.id),
                    "provider_name": provider.name,
                    "link": link,
                },
            )
        except Exception:
            logger.exception("Failed to notify owner of provider %s write", provider.id)

        logger.info(
            "Provider %s %s %s %s on user %s's record",
            provider.id,
            verb,
            label,
            instance.id,
            owner.id,
        )
        return Response(
            read_cls(instance, context={"request": request}).data,
            status=status.HTTP_201_CREATED if action == "create" else status.HTTP_200_OK,
        )
