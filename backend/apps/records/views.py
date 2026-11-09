"""
ViewSets for all 8 health record types.

All viewsets follow the same pattern:
  - IsAuthenticated (default from settings)
  - get_queryset scoped to request.user (no cross-user access possible here)
  - Care-proxy writes stamp provenance with the acting user's identity
  - File uploads handled via MultiPartParser
  - AI document extraction triggered asynchronously on create

URL routing is in records/urls.py.
"""

import logging

from django.db import transaction
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core.pagination import StandardResultsSetPagination
from apps.sharing.proxy import acting_for_another, resolve_active_owner

from .models import (
    Allergy,
    Appointment,
    Condition,
    HealthDocument,
    Immunization,
    Medication,
    Procedure,
    VitalReading,
)
from .serializers import (
    AllergyReadSerializer,
    AllergyWriteSerializer,
    AppointmentReadSerializer,
    AppointmentWriteSerializer,
    ConditionReadSerializer,
    ConditionWriteSerializer,
    HealthDocumentReadSerializer,
    HealthDocumentWriteSerializer,
    ImmunizationReadSerializer,
    ImmunizationWriteSerializer,
    MedicationReadSerializer,
    MedicationWriteSerializer,
    ProcedureReadSerializer,
    ProcedureWriteSerializer,
    VitalReadingReadSerializer,
    VitalReadingWriteSerializer,
)

logger = logging.getLogger(__name__)


def _build_provenance(request, owner) -> dict:
    """
    Build a provenance dict for a record being added.

    Records the authenticated user's identity and role so a proxy's additions
    are attributable to them rather than to the record owner.
    """
    from django.utils import timezone

    user = request.user
    return {
        "addedBy": user.name or user.email,
        "addedById": str(user.id),
        "addedByRole": "CARE_PROXY" if acting_for_another(request, owner) else "OWNER",
        "addedAt": timezone.now().isoformat(),
    }


# ---------------------------------------------------------------------------
# Notification helper
# ---------------------------------------------------------------------------

# Maps viewset class name to a human-readable record type label
_RECORD_LABELS: dict[str, str] = {
    "AllergyViewSet":        "allergy",
    "MedicationViewSet":     "medication",
    "ConditionViewSet":      "condition",
    "AppointmentViewSet":    "appointment",
    "HealthDocumentViewSet": "document",
    "ProcedureViewSet":      "procedure",
    "ImmunizationViewSet":   "immunization",
    "VitalReadingViewSet":   "measurement",
}

_RECORD_TYPE_KEYS: dict[str, str] = {
    "AllergyViewSet":        "allergy",
    "MedicationViewSet":     "medication",
    "ConditionViewSet":      "condition",
    "AppointmentViewSet":    "appointment",
    "HealthDocumentViewSet": "document",
    "ProcedureViewSet":      "procedure",
    "ImmunizationViewSet":   "immunization",
    "VitalReadingViewSet":   "vital",
}


def _record_name(instance) -> str:
    """Best human-readable name we can pull off a record instance."""
    for attr in ("substance", "name", "title", "vaccine", "vital_type"):
        val = getattr(instance, attr, None)
        if val:
            return str(val)
    return "record"


def _notify_record(user, kind: str, instance, viewset_class_name: str, actor=None) -> None:
    """Fire a notification for a record CRUD event — never raises.

    When a care proxy made the change, the record owner is told who it was;
    the owner's notification is the audit trail for the proxy's write.
    """
    try:
        from apps.notifications.models import Notification
        from apps.notifications.utils import notify

        label = _RECORD_LABELS.get(viewset_class_name, "record")
        record_type = _RECORD_TYPE_KEYS.get(viewset_class_name, "record")
        record_name = _record_name(instance)

        verb = {
            Notification.Kind.RECORD_ADDED:   "added",
            Notification.Kind.RECORD_UPDATED: "updated",
            Notification.Kind.RECORD_DELETED: "deleted",
        }.get(kind, "changed")

        by_proxy = actor is not None and getattr(actor, "id", None) != getattr(user, "id", None)
        actor_name = (getattr(actor, "name", "") or getattr(actor, "email", "")) if by_proxy else ""

        if by_proxy:
            article = "an" if label[:1] in "aeiou" else "a"
            title = f"{actor_name} {verb} {article} {label}: {record_name}"
            body = (
                f"{actor_name} (your care proxy) {verb} \"{record_name}\" in your record."
            )
        else:
            title = f"{label.capitalize()} {verb}: {record_name}"
            body = {
                Notification.Kind.RECORD_ADDED:   f"New {label} \"{record_name}\" saved to your record.",
                Notification.Kind.RECORD_UPDATED: f"\"{record_name}\" has been updated.",
                Notification.Kind.RECORD_DELETED: f"\"{record_name}\" was removed from your record.",
            }.get(kind, "")

        notify(
            user=user,
            kind=kind,
            title=title,
            body=body,
            data={
                "record_type": record_type,
                "record_id": str(getattr(instance, "id", "")),
                "record_name": record_name,
                "changed_by": actor_name or None,
                "by_proxy": by_proxy,
            },
        )
    except Exception:
        logger.exception(
            "Failed to send record notification (kind=%s) for user %s", kind, getattr(user, "id", user)
        )


def _queue_attachment_extraction(record_type: str | None, instance) -> None:
    """After the transaction commits, have the worker read a newly attached file."""
    if not record_type or not getattr(instance, "_file_changed", False):
        return
    record_id = str(instance.id)

    def _send():
        try:
            from .tasks import extract_attachment_with_ai

            extract_attachment_with_ai.delay(record_type, record_id)
        except Exception:
            logger.exception("Failed to queue AI extraction for %s %s", record_type, record_id)

    transaction.on_commit(_send)


def _invalidate_summaries(owner) -> None:
    """A changed record makes any cached AI summary of it stale."""
    try:
        from apps.emergency.services import AIDynamicSummaryService

        AIDynamicSummaryService.invalidate(str(owner.id))
    except Exception:
        logger.debug("Could not invalidate AI summary for %s", getattr(owner, "id", owner))


class BaseRecordViewSet(viewsets.ModelViewSet):
    """
    Base viewset for all health record types.

    Subclasses define:
      - queryset (scoped by user in get_queryset)
      - read_serializer_class
      - write_serializer_class
      - model (for get_queryset auto-scoping)
    """

    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsSetPagination
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    read_serializer_class = None
    write_serializer_class = None
    # Key used by extract_attachment_with_ai; None for kinds without attachments.
    attachment_type: str | None = None

    def get_active_owner(self, *, require_write: bool = False):
        """Whose record this request acts on — self, or a proxy's owner."""
        return resolve_active_owner(self.request, require_write=require_write)

    def get_queryset(self):
        return self.queryset.filter(user=self.get_active_owner())

    def destroy(self, request, *args, **kwargs):
        self.get_active_owner(require_write=True)
        return super().destroy(request, *args, **kwargs)

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return self.write_serializer_class
        return self.read_serializer_class

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["request"] = self.request
        return ctx

    def _read_response(self, instance, status_code):
        """Answer with the read serializer, not the write one.

        The write serializers exist to validate input; their output has no `id`
        or computed fields, which left clients unable to link to or act on the
        record they had just created or edited.
        """
        serializer = self.read_serializer_class(
            instance, context=self.get_serializer_context()
        )
        return Response(serializer.data, status=status_code)

    def create(self, request, *args, **kwargs):
        # Resolve before touching any data: a view-only proxy must not get a
        # validation pass over someone else's record.
        self.get_active_owner(require_write=True)
        write = self.get_serializer(data=request.data)
        write.is_valid(raise_exception=True)
        self.perform_create(write)
        headers = self.get_success_headers(write.data)
        response = self._read_response(write.instance, status.HTTP_201_CREATED)
        for key, value in headers.items():
            response[key] = value
        return response

    def update(self, request, *args, **kwargs):
        self.get_active_owner(require_write=True)
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        write = self.get_serializer(instance, data=request.data, partial=partial)
        write.is_valid(raise_exception=True)
        self.perform_update(write)
        return self._read_response(write.instance, status.HTTP_200_OK)

    @transaction.atomic
    def perform_create(self, serializer):
        owner = self.get_active_owner(require_write=True)
        instance = serializer.save(
            user=owner,
            provenance=_build_provenance(self.request, owner),
        )
        logger.info(
            "%s created for user %s by %s",
            self.__class__.__name__,
            owner.id,
            self.request.user.id,
        )
        _queue_attachment_extraction(self.attachment_type, instance)
        _invalidate_summaries(owner)
        _notify_record(
            owner,
            "RECORD_ADDED",
            instance,
            self.__class__.__name__,
            actor=self.request.user,
        )

    @transaction.atomic
    def perform_update(self, serializer):
        owner = self.get_active_owner(require_write=True)
        instance = serializer.save()
        logger.info(
            "%s updated by user %s (record owner %s)",
            self.__class__.__name__,
            self.request.user.id,
            owner.id,
        )
        _queue_attachment_extraction(self.attachment_type, instance)
        _invalidate_summaries(owner)
        _notify_record(
            owner,
            "RECORD_UPDATED",
            instance,
            self.__class__.__name__,
            actor=self.request.user,
        )

    def perform_destroy(self, instance):
        owner = self.get_active_owner(require_write=True)
        # Capture name before deletion
        _notify_record(
            owner,
            "RECORD_DELETED",
            instance,
            self.__class__.__name__,
            actor=self.request.user,
        )
        instance.delete()
        _invalidate_summaries(owner)

    @action(detail=True, methods=["post"], url_path="retry-extraction")
    def retry_extraction(self, request, pk=None):
        """
        Re-run the AI reading of this record's attached file.

        POST /api/v1/records/<kind>/<id>/retry-extraction/
        """
        self.get_active_owner(require_write=True)
        record = self.get_object()
        if not self.attachment_type or not getattr(record, "document_file", None):
            return Response(
                {"detail": "This record has no attached file to analyse."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if record.ai_extraction_status == "PROCESSING":
            return Response(
                {"detail": "Extraction is already in progress."},
                status=status.HTTP_409_CONFLICT,
            )
        record.ai_extraction_status = "PENDING"
        record.save(update_fields=["ai_extraction_status"])
        record._file_changed = True
        _queue_attachment_extraction(self.attachment_type, record)
        return Response({"detail": "Extraction re-queued."})


# ---------------------------------------------------------------------------
# Allergy
# ---------------------------------------------------------------------------


class AllergyViewSet(BaseRecordViewSet):
    """
    CRUD for allergies.

    list:     GET  /api/v1/records/allergies/
    create:   POST /api/v1/records/allergies/
    retrieve: GET  /api/v1/records/allergies/<id>/
    update:   PUT  /api/v1/records/allergies/<id>/
    partial_update: PATCH /api/v1/records/allergies/<id>/
    destroy:  DELETE /api/v1/records/allergies/<id>/
    """

    queryset = Allergy.objects.select_related("user")
    read_serializer_class = AllergyReadSerializer
    write_serializer_class = AllergyWriteSerializer
    attachment_type = "allergy"
    search_fields = ["substance", "notes"]
    ordering_fields = ["created_at", "severity", "substance"]
    filterset_fields = ["severity", "allergy_type", "is_verified"]


# ---------------------------------------------------------------------------
# Medication
# ---------------------------------------------------------------------------


class MedicationViewSet(BaseRecordViewSet):
    """
    CRUD for medications.

    list:     GET  /api/v1/records/medications/
    create:   POST /api/v1/records/medications/
    retrieve: GET  /api/v1/records/medications/<id>/
    update:   PUT  /api/v1/records/medications/<id>/
    partial_update: PATCH /api/v1/records/medications/<id>/
    destroy:  DELETE /api/v1/records/medications/<id>/
    """

    queryset = Medication.objects.select_related("user")
    read_serializer_class = MedicationReadSerializer
    write_serializer_class = MedicationWriteSerializer
    attachment_type = "medication"
    search_fields = ["name", "prescriber", "reason"]
    ordering_fields = ["created_at", "start_date", "name"]
    filterset_fields = ["active"]



# ---------------------------------------------------------------------------
# Condition
# ---------------------------------------------------------------------------


class ConditionViewSet(BaseRecordViewSet):
    """CRUD for conditions."""

    queryset = Condition.objects.select_related("user")
    read_serializer_class = ConditionReadSerializer
    write_serializer_class = ConditionWriteSerializer
    attachment_type = "condition"
    search_fields = ["name", "icd10_code", "diagnosed_by"]
    ordering_fields = ["created_at", "onset_date", "name"]
    filterset_fields = ["status", "severity"]


# ---------------------------------------------------------------------------
# Appointment
# ---------------------------------------------------------------------------


class AppointmentViewSet(BaseRecordViewSet):
    """CRUD for appointments."""

    queryset = Appointment.objects.select_related("user")
    read_serializer_class = AppointmentReadSerializer
    write_serializer_class = AppointmentWriteSerializer
    attachment_type = "appointment"
    search_fields = ["title", "clinician", "facility"]
    ordering_fields = ["scheduled_for", "created_at"]
    filterset_fields = ["status"]


# ---------------------------------------------------------------------------
# HealthDocument
# ---------------------------------------------------------------------------


class HealthDocumentViewSet(BaseRecordViewSet):
    """
    CRUD for health documents.

    On create, triggers async AI extraction via Celery.
    ai_extraction_status progresses: PENDING → PROCESSING → DONE | FAILED.
    """

    queryset = HealthDocument.objects.select_related("user")
    read_serializer_class = HealthDocumentReadSerializer
    write_serializer_class = HealthDocumentWriteSerializer
    search_fields = ["title", "lab_name", "provider", "findings"]
    ordering_fields = ["uploaded_at", "created_at", "document_date"]
    filterset_fields = ["doc_type", "ai_extraction_status"]

    def perform_create(self, serializer):
        owner = self.get_active_owner(require_write=True)
        instance = serializer.save(
            user=owner,
            provenance=_build_provenance(self.request, owner),
        )
        # Notify immediately that the document was added
        _notify_record(
            owner, "RECORD_ADDED", instance, self.__class__.__name__, actor=self.request.user
        )
        _invalidate_summaries(owner)
        # Trigger AI extraction asynchronously (non-blocking).
        transaction.on_commit(
            lambda: self._trigger_extraction(str(instance.id))
        )
        logger.info(
            "HealthDocument %s created for user %s — AI extraction queued.",
            instance.id,
            owner.id,
        )

    def perform_update(self, serializer):
        super().perform_update(serializer)
        # A replaced file means the old AI reading no longer describes it.
        instance = serializer.instance
        if getattr(instance, "_file_changed", False):
            doc_id = str(instance.id)
            transaction.on_commit(lambda: self._trigger_extraction(doc_id))

    @staticmethod
    def _trigger_extraction(document_id: str) -> None:
        """Queue the AI extraction task after the transaction commits."""
        try:
            from .tasks import extract_document_with_ai

            extract_document_with_ai.delay(document_id)
        except Exception:
            logger.exception(
                "Failed to queue AI extraction for document %s", document_id
            )

    @action(detail=True, methods=["post"], url_path="retry-extraction")
    def retry_extraction(self, request, pk=None):
        """
        Manually retry AI extraction for a failed or skipped document.

        POST /api/v1/records/documents/<id>/retry-extraction/
        """
        self.get_active_owner(require_write=True)
        doc = self.get_object()
        if doc.ai_extraction_status in ("PROCESSING",):
            return Response(
                {"detail": "Extraction is already in progress."},
                status=status.HTTP_409_CONFLICT,
            )
        doc.ai_extraction_status = "PENDING"
        doc.save(update_fields=["ai_extraction_status"])
        transaction.on_commit(
            lambda: self._trigger_extraction(str(doc.id))
        )
        return Response({"detail": "Extraction re-queued."})


# ---------------------------------------------------------------------------
# Procedure
# ---------------------------------------------------------------------------


class ProcedureViewSet(BaseRecordViewSet):
    """CRUD for procedures."""

    queryset = Procedure.objects.select_related("user")
    read_serializer_class = ProcedureReadSerializer
    write_serializer_class = ProcedureWriteSerializer
    search_fields = ["name", "facility", "clinician"]
    ordering_fields = ["performed_on", "created_at"]


# ---------------------------------------------------------------------------
# Immunization
# ---------------------------------------------------------------------------


class ImmunizationViewSet(BaseRecordViewSet):
    """CRUD for immunizations."""

    queryset = Immunization.objects.select_related("user")
    read_serializer_class = ImmunizationReadSerializer
    write_serializer_class = ImmunizationWriteSerializer
    search_fields = ["vaccine"]
    ordering_fields = ["administered_on", "created_at"]


# ---------------------------------------------------------------------------
# VitalReading
# ---------------------------------------------------------------------------


class VitalReadingViewSet(BaseRecordViewSet):
    """CRUD for vital readings (measurements)."""

    queryset = VitalReading.objects.select_related("user")
    read_serializer_class = VitalReadingReadSerializer
    write_serializer_class = VitalReadingWriteSerializer
    attachment_type = "vital"
    search_fields = ["vital_type", "label", "context"]
    ordering_fields = ["measured_at", "created_at"]
    filterset_fields = ["vital_type"]

    @action(detail=False, methods=["get"], url_path="latest")
    def latest(self, request):
        """
        Return the most recent reading of each vital type.

        GET /api/v1/records/vitals/latest/
        Used by the dashboard and emergency summary to show current readings.
        """
        qs = self.get_queryset().order_by("vital_type", "label", "-measured_at")
        seen = set()
        results = []
        for reading in qs:
            key = (reading.vital_type, reading.label)
            if key not in seen:
                seen.add(key)
                results.append(reading)

        serializer = VitalReadingReadSerializer(
            results, many=True, context={"request": request}
        )
        return Response(serializer.data)
