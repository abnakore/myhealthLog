"""
Profile views.

GET  /api/v1/profile/               — retrieve the authenticated user's profile
PATCH /api/v1/profile/              — update profile fields
PATCH /api/v1/profile/photo/        — upload / replace profile photo
GET  /api/v1/profile/contacts/      — list emergency contacts
POST /api/v1/profile/contacts/      — add emergency contact
PUT  /api/v1/profile/contacts/<id>/ — replace emergency contact
DELETE /api/v1/profile/contacts/<id>/ — remove emergency contact
"""

import logging

from rest_framework import status
from rest_framework.generics import get_object_or_404
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.sharing.proxy import resolve_active_owner

from .models import EmergencyContact, HealthProfile
from .serializers import (
    EmergencyContactSerializer,
    EmergencyContactWriteSerializer,
    HealthProfileReadSerializer,
    HealthProfileWriteSerializer,
    PhotoUploadSerializer,
)

logger = logging.getLogger(__name__)


def _notify_proxy_change(owner, actor, what: str) -> None:
    """Tell the record owner when their proxy changed something — never raises."""
    if owner is None or actor is None or owner.id == actor.id:
        return
    try:
        from apps.notifications.models import Notification
        from apps.notifications.utils import notify

        actor_name = actor.name or actor.email
        notify(
            user=owner,
            kind=Notification.Kind.RECORD_UPDATED,
            title=f"{actor_name} updated your profile",
            body=f"{actor_name} (your care proxy) {what}.",
            data={"link": "/app/profile", "changed_by": actor_name, "by_proxy": True},
        )
    except Exception:
        logger.exception("Failed to notify owner %s of a proxy profile change", owner.id)


class ProfileView(APIView):
    """
    GET  — read full profile + emergency contacts.
    PATCH — partial update of profile fields (no emergency contacts here).
    """

    permission_classes = [IsAuthenticated]

    def _get_profile(self, user) -> HealthProfile:
        profile, _ = HealthProfile.objects.get_or_create(
            user=user, defaults={"full_name": user.name or ""}
        )
        return profile

    def get(self, request):
        owner = resolve_active_owner(request)
        profile = self._get_profile(owner)
        serializer = HealthProfileReadSerializer(
            profile, context={"request": request}
        )
        return Response(serializer.data)

    def patch(self, request):
        owner = resolve_active_owner(request, require_write=True)
        profile = self._get_profile(owner)
        serializer = HealthProfileWriteSerializer(
            profile, data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()

        # Keep the record owner's User.name in sync with profile full_name.
        new_name = serializer.validated_data.get("full_name")
        if new_name and new_name != owner.name:
            owner.name = new_name
            owner.save(update_fields=["name"])

        logger.info("Profile updated for user %s by %s", owner.id, request.user.id)
        _notify_proxy_change(owner, request.user, "changed your profile details")
        return Response(
            HealthProfileReadSerializer(profile, context={"request": request}).data
        )


class PhotoUploadView(APIView):
    """
    PATCH  /api/v1/profile/photo/ — upload a profile photo.
           Accepts multipart/form-data with a 'photo' field.
    DELETE /api/v1/profile/photo/ — remove the current profile photo.
    """

    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def patch(self, request):
        owner = resolve_active_owner(request, require_write=True)
        serializer = PhotoUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        profile, _ = HealthProfile.objects.get_or_create(
            user=owner, defaults={"full_name": owner.name or ""}
        )
        # Delete the old photo file before replacing it.
        if profile.photo:
            profile.photo.delete(save=False)

        profile.photo = serializer.validated_data["photo"]
        profile.save(update_fields=["photo", "updated_at"])
        logger.info("Profile photo updated for user %s by %s", owner.id, request.user.id)
        _notify_proxy_change(owner, request.user, "changed your profile photo")

        return Response(
            HealthProfileReadSerializer(profile, context={"request": request}).data
        )

    def delete(self, request):
        owner = resolve_active_owner(request, require_write=True)
        profile, _ = HealthProfile.objects.get_or_create(
            user=owner, defaults={"full_name": owner.name or ""}
        )
        if profile.photo:
            profile.photo.delete(save=False)
            profile.photo = None
            profile.save(update_fields=["photo", "updated_at"])
            logger.info("Profile photo removed for user %s by %s", owner.id, request.user.id)
        _notify_proxy_change(owner, request.user, "removed your profile photo")

        return Response(
            HealthProfileReadSerializer(profile, context={"request": request}).data
        )


class EmergencyContactListView(APIView):
    """
    GET  /api/v1/profile/contacts/  — list all emergency contacts.
    POST /api/v1/profile/contacts/  — add a new emergency contact.
    """

    permission_classes = [IsAuthenticated]

    def _get_profile(self, user) -> HealthProfile:
        profile, _ = HealthProfile.objects.get_or_create(
            user=user, defaults={"full_name": user.name or ""}
        )
        return profile

    def get(self, request):
        owner = resolve_active_owner(request)
        profile = self._get_profile(owner)
        contacts = profile.emergency_contacts.all()
        return Response(EmergencyContactSerializer(contacts, many=True).data)

    def post(self, request):
        owner = resolve_active_owner(request, require_write=True)
        profile = self._get_profile(owner)
        serializer = EmergencyContactWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        contact = serializer.save(profile=profile)
        logger.info(
            "Emergency contact added for user %s: %s",
            owner.id,
            contact.id,
        )
        _notify_proxy_change(owner, request.user, f"added emergency contact {contact.name}")
        return Response(
            EmergencyContactSerializer(contact).data,
            status=status.HTTP_201_CREATED,
        )


class EmergencyContactDetailView(APIView):
    """
    PUT    /api/v1/profile/contacts/<id>/ — replace an emergency contact.
    PATCH  /api/v1/profile/contacts/<id>/ — partial update.
    DELETE /api/v1/profile/contacts/<id>/ — remove.
    """

    permission_classes = [IsAuthenticated]

    def _get_contact(self, owner, pk) -> EmergencyContact:
        return get_object_or_404(
            EmergencyContact, pk=pk, profile__user=owner
        )

    def put(self, request, pk):
        owner = resolve_active_owner(request, require_write=True)
        contact = self._get_contact(owner, pk)
        serializer = EmergencyContactWriteSerializer(contact, data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        _notify_proxy_change(owner, request.user, f"changed emergency contact {contact.name}")
        return Response(EmergencyContactSerializer(contact).data)

    def patch(self, request, pk):
        owner = resolve_active_owner(request, require_write=True)
        contact = self._get_contact(owner, pk)
        serializer = EmergencyContactWriteSerializer(
            contact, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        _notify_proxy_change(owner, request.user, f"changed emergency contact {contact.name}")
        return Response(EmergencyContactSerializer(contact).data)

    def delete(self, request, pk):
        owner = resolve_active_owner(request, require_write=True)
        contact = self._get_contact(owner, pk)
        name = contact.name
        contact.delete()
        logger.info(
            "Emergency contact %s deleted for user %s", pk, owner.id
        )
        _notify_proxy_change(owner, request.user, f"removed emergency contact {name}")
        return Response(status=status.HTTP_204_NO_CONTENT)
