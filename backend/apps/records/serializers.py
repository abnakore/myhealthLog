"""
Serialisers for all 8 health record types.

Pattern: ReadSerializer + WriteSerializer per model.
  Read  — nested, computed fields, all fields exposed.
  Write — accepts the exact shape the frontend sends (matching model.ts drafts).

File fields are accepted via MultiPartParser.  The serialiser receives the
File object; the model field handles upload path computation and validation.
"""

from rest_framework import serializers

from apps.core.serializers import BaseModelSerializer
from apps.core.validators import (
    sniff_mime,
    validate_document_content,
    validate_document_extension,
    validate_file_size,
)

# Every uploaded record file passes size, extension and real-content checks.
FILE_VALIDATORS = [validate_file_size, validate_document_extension, validate_document_content]

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

# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def _document_url(request, obj, field_name: str = "document_file") -> str | None:
    """
    A short-lived signed URL for a record's file, or None if there is none.

    Files are never served from a public /media/ path: the URL carries a signed,
    expiring token that names exactly one record's file, and the file view
    re-checks that the record still exists before serving it.
    """
    from apps.records.files import signed_file_url

    file_field = getattr(obj, field_name, None)
    if not file_field:
        return None
    return signed_file_url(obj, field_name)


ATTACHMENT_READ_FIELDS = [
    "document_file_name",
    "document_mime_type",
    "document_file_size",
    "fileUrl",
    "ai_extraction",
    "ai_extraction_status",
]


class AttachmentReadMixin(serializers.Serializer):
    fileUrl = serializers.SerializerMethodField()

    def get_fileUrl(self, obj) -> str | None:
        return _document_url(self.context.get("request"), obj)


class AttachmentWriteMixin(serializers.Serializer):
    """
    Accepts an optional `file` (multipart) and `remove_file` flag on any record.

    A new file replaces the old one and queues a fresh AI reading of it.
    """

    file = serializers.FileField(
        required=False, allow_null=True, write_only=True, validators=FILE_VALIDATORS
    )
    remove_file = serializers.BooleanField(required=False, default=False, write_only=True)

    def _apply_file(self, instance, file, remove: bool) -> None:
        if file:
            if instance.document_file:
                instance.document_file.delete(save=False)
            instance.document_file = file
            instance.document_file_name = file.name
            instance.document_mime_type = sniff_mime(file) or getattr(file, "content_type", "") or ""
            instance.document_file_size = getattr(file, "size", 0) or 0
            instance.ai_extraction = None
            instance.ai_extraction_status = "PENDING"
            instance._file_changed = True
        elif remove and instance.document_file:
            instance.document_file.delete(save=False)
            instance.document_file = None
            instance.document_file_name = ""
            instance.document_mime_type = ""
            instance.document_file_size = 0
            instance.ai_extraction = None
            instance.ai_extraction_status = ""

    def create(self, validated_data):
        file = validated_data.pop("file", None)
        validated_data.pop("remove_file", None)
        instance = self.Meta.model(**validated_data)
        self._apply_file(instance, file, False)
        instance.save()
        return instance

    def update(self, instance, validated_data):
        file = validated_data.pop("file", None)
        remove = validated_data.pop("remove_file", False)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        self._apply_file(instance, file, remove)
        instance.save()
        return instance


# ---------------------------------------------------------------------------
# Allergy
# ---------------------------------------------------------------------------


class AllergyReadSerializer(AttachmentReadMixin, serializers.ModelSerializer):
    class Meta:
        model = Allergy
        fields = [
            "id",
            "substance",
            "allergy_type",
            "severity",
            "reactions",
            "triggers",
            "first_reaction_date",
            "is_verified",
            "notes",
            "source",
            "condition_ids",
            "provenance",
            "is_critical",
            *ATTACHMENT_READ_FIELDS,
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class AllergyWriteSerializer(AttachmentWriteMixin, BaseModelSerializer):
    class Meta:
        model = Allergy
        fields = [
            "substance",
            "allergy_type",
            "severity",
            "reactions",
            "triggers",
            "first_reaction_date",
            "is_verified",
            "notes",
            "source",
            "condition_ids",
            "file",
            "remove_file",
        ]

    def validate_substance(self, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise serializers.ValidationError("Substance name is required.")
        return stripped


# ---------------------------------------------------------------------------
# Medication
# ---------------------------------------------------------------------------


class MedicationReadSerializer(AttachmentReadMixin, serializers.ModelSerializer):

    class Meta:
        model = Medication
        fields = [
            "id",
            "name",
            "dosage",
            "form",
            "route",
            "frequency",
            "duration",
            "start_date",
            "end_date",
            "prescriber",
            "reason",
            "notes",
            "active",
            "source",
            "condition_ids",
            "provenance",
            *ATTACHMENT_READ_FIELDS,
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class MedicationWriteSerializer(AttachmentWriteMixin, BaseModelSerializer):
    class Meta:
        model = Medication
        fields = [
            "name",
            "dosage",
            "form",
            "route",
            "frequency",
            "duration",
            "start_date",
            "end_date",
            "prescriber",
            "reason",
            "notes",
            "active",
            "source",
            "condition_ids",
            "file",
            "remove_file",
        ]

    def validate_name(self, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise serializers.ValidationError("Medication name is required.")
        return stripped

    def validate(self, attrs):
        start = attrs.get("start_date")
        end = attrs.get("end_date")
        if start and end and end < start:
            raise serializers.ValidationError(
                {"end_date": "End date cannot be before start date."}
            )
        return attrs

    def to_internal_value(self, data):
        # A multipart form omits an unchecked boolean; on create that must mean
        # "use the model default" (active), not False.
        if (
            self.instance is None
            and hasattr(data, "getlist")
            and "active" not in data
        ):
            data = data.copy()
            data["active"] = "true"
        return super().to_internal_value(data)


# ---------------------------------------------------------------------------
# Condition
# ---------------------------------------------------------------------------


class ConditionReadSerializer(AttachmentReadMixin, serializers.ModelSerializer):

    class Meta:
        model = Condition
        fields = [
            "id",
            "name",
            "status",
            "severity",
            "onset_date",
            "resolved_date",
            "icd10_code",
            "diagnosed_by",
            "notes",
            "source",
            "provenance",
            *ATTACHMENT_READ_FIELDS,
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class ConditionWriteSerializer(AttachmentWriteMixin, BaseModelSerializer):
    class Meta:
        model = Condition
        fields = [
            "name",
            "status",
            "severity",
            "onset_date",
            "resolved_date",
            "icd10_code",
            "diagnosed_by",
            "notes",
            "source",
            "file",
            "remove_file",
        ]

    def validate_name(self, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise serializers.ValidationError("Condition name is required.")
        return stripped

    def validate(self, attrs):
        status_val = attrs.get("status", "")
        resolved = attrs.get("resolved_date")
        if resolved and status_val not in ("RESOLVED",):
            # Allow resolved_date only when status is RESOLVED.
            attrs["resolved_date"] = None
        return attrs


# ---------------------------------------------------------------------------
# Appointment
# ---------------------------------------------------------------------------


class AppointmentReadSerializer(AttachmentReadMixin, serializers.ModelSerializer):
    class Meta:
        model = Appointment
        fields = [
            "id",
            "title",
            "clinician",
            "facility",
            "scheduled_for",
            "status",
            "reason",
            "notes",
            "condition_ids",
            "provenance",
            *ATTACHMENT_READ_FIELDS,
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class AppointmentWriteSerializer(AttachmentWriteMixin, BaseModelSerializer):
    class Meta:
        model = Appointment
        fields = [
            "title",
            "clinician",
            "facility",
            "scheduled_for",
            "status",
            "reason",
            "notes",
            "condition_ids",
            "file",
            "remove_file",
        ]

    def validate_title(self, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise serializers.ValidationError("Appointment title is required.")
        return stripped


# ---------------------------------------------------------------------------
# HealthDocument
# ---------------------------------------------------------------------------


class HealthDocumentReadSerializer(serializers.ModelSerializer):
    fileUrl = serializers.SerializerMethodField()

    class Meta:
        model = HealthDocument
        fields = [
            "id",
            "title",
            "doc_type",
            "file_name",
            "file_size",
            "mime_type",
            "document_date",
            "uploaded_at",
            "notes",
            "lab_name",
            "imaging_type",
            "body_area",
            "findings",
            "provider",
            "condition_ids",
            "provenance",
            "ai_extraction",
            "ai_extraction_status",
            "fileUrl",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_fileUrl(self, obj) -> str | None:
        return _document_url(self.context.get("request"), obj)


class HealthDocumentWriteSerializer(BaseModelSerializer):
    file = serializers.FileField(write_only=True, validators=FILE_VALIDATORS)

    class Meta:
        model = HealthDocument
        fields = [
            "title",
            "doc_type",
            "document_date",
            "notes",
            "lab_name",
            "imaging_type",
            "body_area",
            "findings",
            "provider",
            "condition_ids",
            "file",
        ]

    def validate_title(self, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise serializers.ValidationError("Document title is required.")
        return stripped

    def create(self, validated_data):
        file = validated_data.pop("file")
        instance = HealthDocument(
            **validated_data,
            document_file=file,
            file_name=file.name,
            file_size=file.size,
            mime_type=sniff_mime(file) or file.content_type or "",
        )
        instance.save()
        return instance

    def update(self, instance, validated_data):
        file = validated_data.pop("file", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if file:
            if instance.document_file:
                instance.document_file.delete(save=False)
            instance.document_file = file
            instance.file_name = file.name
            instance.file_size = file.size
            instance.mime_type = sniff_mime(file) or file.content_type or ""
            # Re-trigger AI extraction on file replacement (the view queues it).
            instance.ai_extraction = None
            instance.ai_extraction_status = "PENDING"
            instance._file_changed = True
        instance.save()
        return instance


# ---------------------------------------------------------------------------
# Procedure
# ---------------------------------------------------------------------------


class ProcedureReadSerializer(serializers.ModelSerializer):
    class Meta:
        model = Procedure
        fields = [
            "id",
            "name",
            "performed_on",
            "facility",
            "clinician",
            "outcome",
            "notes",
            "condition_ids",
            "provenance",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class ProcedureWriteSerializer(BaseModelSerializer):
    class Meta:
        model = Procedure
        fields = [
            "name",
            "performed_on",
            "facility",
            "clinician",
            "outcome",
            "notes",
            "condition_ids",
        ]

    def validate_name(self, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise serializers.ValidationError("Procedure name is required.")
        return stripped


# ---------------------------------------------------------------------------
# Immunization
# ---------------------------------------------------------------------------


class ImmunizationReadSerializer(serializers.ModelSerializer):
    class Meta:
        model = Immunization
        fields = [
            "id",
            "vaccine",
            "dose_number",
            "administered_on",
            "next_due",
            "notes",
            "condition_ids",
            "provenance",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class ImmunizationWriteSerializer(BaseModelSerializer):
    class Meta:
        model = Immunization
        fields = [
            "vaccine",
            "dose_number",
            "administered_on",
            "next_due",
            "notes",
            "condition_ids",
        ]

    def validate_vaccine(self, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise serializers.ValidationError("Vaccine name is required.")
        return stripped


# ---------------------------------------------------------------------------
# VitalReading
# ---------------------------------------------------------------------------


class VitalReadingReadSerializer(AttachmentReadMixin, serializers.ModelSerializer):

    class Meta:
        model = VitalReading
        fields = [
            "id",
            "vital_type",
            "value",
            "value2",
            "unit",
            "measured_at",
            "context",
            "label",
            "notes",
            "condition_ids",
            "provenance",
            *ATTACHMENT_READ_FIELDS,
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class VitalReadingWriteSerializer(AttachmentWriteMixin, BaseModelSerializer):
    class Meta:
        model = VitalReading
        fields = [
            "vital_type",
            "value",
            "value2",
            "unit",
            "measured_at",
            "context",
            "label",
            "notes",
            "condition_ids",
            "file",
            "remove_file",
        ]

    def validate(self, attrs):
        # On a partial edit, judge against the stored values for fields not sent.
        current = self.instance
        vt = attrs.get("vital_type", getattr(current, "vital_type", ""))
        value2 = attrs.get("value2", getattr(current, "value2", None))
        label = attrs.get("label", getattr(current, "label", "")) or ""
        if vt == "BLOOD_PRESSURE" and not value2:
            raise serializers.ValidationError(
                {"value2": "Diastolic (value2) is required for blood pressure readings."}
            )
        if vt == "CUSTOM" and not label.strip():
            raise serializers.ValidationError(
                {"label": "Label is required for custom vital readings."}
            )
        return attrs
