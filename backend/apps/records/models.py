"""
Clinical health record models for myHealthLog.

All 8 record types are defined here:
  Allergy, Medication, Condition, Appointment, HealthDocument,
  Procedure, Immunization, VitalReading.

Design decisions:
  - All inherit from BaseModel (UUID PK, timestamps, soft-delete).
  - Every record carries `user`, `source`, and optional `provenance` JSON.
  - `condition_ids` is a JSON array of Condition UUIDs — a deliberate
    denormalisation that mirrors the frontend type and avoids a heavy M2M
    table for a list that rarely exceeds 3-4 items.
  - FHIR-relevant fields (icd10_code, loinc_code, etc.) are present from
    day one so the FHIR export never has to fall back to text-only codings.
  - File fields use UUIDs for upload paths (prevent enumeration/collision).
"""


import uuid

from django.conf import settings
from django.db import models

from apps.core.models import BaseModel
from apps.core.utils import upload_to_health_documents
from apps.core.validators import (
    validate_document_extension,
    validate_file_size,
    validate_icd10_code,
)

# ---------------------------------------------------------------------------
# Shared choice classes
# ---------------------------------------------------------------------------


class RecordSource(models.TextChoices):
    SELF_REPORTED = "SELF_REPORTED", "Self-reported"
    CLINICIAN = "CLINICIAN", "Clinician"
    IMPORTED = "IMPORTED", "Imported"


class AIStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    PROCESSING = "PROCESSING", "Processing"
    DONE = "DONE", "Done"
    FAILED = "FAILED", "Failed"
    SKIPPED = "SKIPPED", "Skipped"


class AttachmentMixin(models.Model):
    """
    An optional supporting file on any record (a prescription photo, a clinic
    letter, a monitor printout), plus the AI reading of that file.

    Every record kind carries the same fields so every record page can show its
    file and its AI analysis the same way a HealthDocument does.
    """

    document_file = models.FileField(
        upload_to=upload_to_health_documents,
        null=True,
        blank=True,
        validators=[validate_file_size, validate_document_extension],
    )
    document_file_name = models.CharField(max_length=255, blank=True, default="")
    document_mime_type = models.CharField(max_length=100, blank=True, default="")
    document_file_size = models.PositiveBigIntegerField(default=0)
    # Empty status means "no file, nothing to analyse".
    ai_extraction = models.JSONField(null=True, blank=True)
    ai_extraction_status = models.CharField(
        max_length=20, choices=AIStatus.choices, blank=True, default=""
    )

    class Meta:
        abstract = True


# ---------------------------------------------------------------------------
# Allergy
# ---------------------------------------------------------------------------


class Allergy(AttachmentMixin, BaseModel):
    """
    A substance the user is allergic to.

    FHIR mapping: AllergyIntolerance resource.
    """

    class AllergyType(models.TextChoices):
        DRUG = "DRUG", "Drug"
        FOOD = "FOOD", "Food"
        ENVIRONMENTAL = "ENVIRONMENTAL", "Environmental"
        OTHER = "OTHER", "Other"

    class Severity(models.TextChoices):
        MILD = "MILD", "Mild"
        MODERATE = "MODERATE", "Moderate"
        SEVERE = "SEVERE", "Severe"
        ANAPHYLAXIS = "ANAPHYLAXIS", "Anaphylaxis"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="allergies",
    )
    substance = models.CharField(max_length=255, db_index=True)
    allergy_type = models.CharField(
        max_length=20, choices=AllergyType.choices, default=AllergyType.DRUG
    )
    severity = models.CharField(
        max_length=20, choices=Severity.choices, default=Severity.MILD
    )
    # Reactions and triggers stored as JSON arrays (frontend sends string arrays)
    reactions = models.JSONField(default=list, blank=True)
    triggers = models.JSONField(default=list, blank=True)
    first_reaction_date = models.DateField(null=True, blank=True)
    is_verified = models.BooleanField(default=False)
    notes = models.TextField(blank=True, default="")
    source = models.CharField(
        max_length=20, choices=RecordSource.choices, default=RecordSource.SELF_REPORTED
    )
    # Links to related Condition UUIDs — stored as JSON array for performance.
    condition_ids = models.JSONField(default=list, blank=True)
    # Who added this record (JSON object with addedBy, addedByRole, addedAt).
    provenance = models.JSONField(null=True, blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Allergy"
        verbose_name_plural = "Allergies"
        indexes = [
            models.Index(fields=["user", "-created_at"]),
            models.Index(fields=["severity"]),
        ]

    def __str__(self) -> str:
        return f"{self.substance} ({self.severity}) — {self.user_id}"

    @property
    def is_critical(self) -> bool:
        """True for SEVERE and ANAPHYLAXIS — shown prominently on the emergency card."""
        return self.severity in (self.Severity.SEVERE, self.Severity.ANAPHYLAXIS)


# ---------------------------------------------------------------------------
# Medication
# ---------------------------------------------------------------------------


class Medication(AttachmentMixin, BaseModel):
    """
    A medicine the user is taking or has taken.

    FHIR mapping: MedicationStatement resource.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="medications",
    )
    name = models.CharField(max_length=255, db_index=True)
    dosage = models.CharField(max_length=100, blank=True, default="")
    form = models.CharField(max_length=100, blank=True, default="")
    route = models.CharField(max_length=100, blank=True, default="")
    frequency = models.CharField(max_length=255, blank=True, default="")
    duration = models.CharField(max_length=100, blank=True, default="")
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    prescriber = models.CharField(max_length=255, blank=True, default="")
    reason = models.TextField(blank=True, default="")
    notes = models.TextField(blank=True, default="")
    active = models.BooleanField(default=True, db_index=True)
    source = models.CharField(
        max_length=20, choices=RecordSource.choices, default=RecordSource.SELF_REPORTED
    )
    condition_ids = models.JSONField(default=list, blank=True)
    provenance = models.JSONField(null=True, blank=True)


    class Meta(BaseModel.Meta):
        verbose_name = "Medication"
        verbose_name_plural = "Medications"
        indexes = [
            models.Index(fields=["user", "active", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.name} {self.dosage} — {self.user_id}"


# ---------------------------------------------------------------------------
# Condition
# ---------------------------------------------------------------------------


class Condition(AttachmentMixin, BaseModel):
    """
    A medical condition the user has or has had.

    FHIR mapping: Condition resource.
    """

    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        RESOLVED = "RESOLVED", "Resolved"
        IN_REMISSION = "IN_REMISSION", "In remission"

    class Severity(models.TextChoices):
        MILD = "MILD", "Mild"
        MODERATE = "MODERATE", "Moderate"
        SEVERE = "SEVERE", "Severe"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="conditions",
    )
    name = models.CharField(max_length=255, db_index=True)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.ACTIVE, db_index=True
    )
    severity = models.CharField(
        max_length=20, choices=Severity.choices, blank=True, default=""
    )
    onset_date = models.DateField(null=True, blank=True)
    resolved_date = models.DateField(null=True, blank=True)
    # ICD-10 code — optional, typed in by the user or extracted from a document.
    icd10_code = models.CharField(
        max_length=20,
        blank=True,
        default="",
        validators=[validate_icd10_code],
    )
    diagnosed_by = models.CharField(max_length=255, blank=True, default="")
    notes = models.TextField(blank=True, default="")
    source = models.CharField(
        max_length=20, choices=RecordSource.choices, default=RecordSource.SELF_REPORTED
    )
    provenance = models.JSONField(null=True, blank=True)


    class Meta(BaseModel.Meta):
        verbose_name = "Condition"
        verbose_name_plural = "Conditions"
        indexes = [
            models.Index(fields=["user", "status", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.status}) — {self.user_id}"


# ---------------------------------------------------------------------------
# Appointment
# ---------------------------------------------------------------------------


class Appointment(AttachmentMixin, BaseModel):
    """
    A healthcare appointment — past or future.

    FHIR mapping: Appointment resource.
    """

    class Status(models.TextChoices):
        SCHEDULED = "SCHEDULED", "Scheduled"
        ATTENDED = "ATTENDED", "Attended"
        MISSED = "MISSED", "Missed"
        CANCELLED = "CANCELLED", "Cancelled"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="appointments",
    )
    title = models.CharField(max_length=255)
    clinician = models.CharField(max_length=255, blank=True, default="")
    facility = models.CharField(max_length=255, blank=True, default="")
    scheduled_for = models.DateTimeField(db_index=True)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.SCHEDULED, db_index=True
    )
    reason = models.TextField(blank=True, default="")
    notes = models.TextField(blank=True, default="")
    condition_ids = models.JSONField(default=list, blank=True)
    provenance = models.JSONField(null=True, blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Appointment"
        verbose_name_plural = "Appointments"
        indexes = [
            models.Index(fields=["user", "status", "scheduled_for"]),
        ]

    def __str__(self) -> str:
        return f"{self.title} on {self.scheduled_for} — {self.user_id}"


# ---------------------------------------------------------------------------
# HealthDocument
# ---------------------------------------------------------------------------


class HealthDocument(BaseModel):
    """
    An uploaded health document — lab result, scan, prescription, etc.

    FHIR mapping: DocumentReference resource.
    AI extraction is triggered on upload; results are stored in `ai_extraction`.
    """

    class DocType(models.TextChoices):
        LAB_RESULT = "LAB_RESULT", "Lab result"
        PRESCRIPTION = "PRESCRIPTION", "Prescription"
        SCAN = "SCAN", "Imaging / scan"
        DISCHARGE_SUMMARY = "DISCHARGE_SUMMARY", "Discharge summary"
        OTHER = "OTHER", "Other"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="health_documents",
    )
    title = models.CharField(max_length=255)
    doc_type = models.CharField(
        max_length=30, choices=DocType.choices, default=DocType.OTHER, db_index=True
    )
    document_file = models.FileField(
        upload_to=upload_to_health_documents,
        validators=[validate_file_size, validate_document_extension],
    )
    file_name = models.CharField(max_length=255, blank=True, default="")
    file_size = models.PositiveBigIntegerField(default=0)
    mime_type = models.CharField(max_length=100, blank=True, default="")
    document_date = models.DateField(null=True, blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    notes = models.TextField(blank=True, default="")

    # Lab-result specific
    lab_name = models.CharField(max_length=255, blank=True, default="")

    # Scan-specific
    imaging_type = models.CharField(max_length=100, blank=True, default="")
    body_area = models.CharField(max_length=255, blank=True, default="")
    findings = models.TextField(blank=True, default="")
    provider = models.CharField(max_length=255, blank=True, default="")

    condition_ids = models.JSONField(default=list, blank=True)
    provenance = models.JSONField(null=True, blank=True)

    # AI extraction results — stored after async processing.
    ai_extraction = models.JSONField(null=True, blank=True)
    ai_extraction_status = models.CharField(
        max_length=20,
        choices=[
            ("PENDING", "Pending"),
            ("PROCESSING", "Processing"),
            ("DONE", "Done"),
            ("FAILED", "Failed"),
            ("SKIPPED", "Skipped"),
        ],
        default="PENDING",
    )

    class Meta(BaseModel.Meta):
        verbose_name = "Health Document"
        verbose_name_plural = "Health Documents"
        indexes = [
            models.Index(fields=["user", "doc_type", "-uploaded_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.title} ({self.doc_type}) — {self.user_id}"


# ---------------------------------------------------------------------------
# Procedure
# ---------------------------------------------------------------------------


class Procedure(BaseModel):
    """
    A medical procedure performed on the user.

    FHIR mapping: Procedure resource.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="procedures",
    )
    name = models.CharField(max_length=255, db_index=True)
    performed_on = models.DateField()
    facility = models.CharField(max_length=255, blank=True, default="")
    clinician = models.CharField(max_length=255, blank=True, default="")
    outcome = models.TextField(blank=True, default="")
    notes = models.TextField(blank=True, default="")
    condition_ids = models.JSONField(default=list, blank=True)
    provenance = models.JSONField(null=True, blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Procedure"
        verbose_name_plural = "Procedures"

    def __str__(self) -> str:
        return f"{self.name} on {self.performed_on} — {self.user_id}"


# ---------------------------------------------------------------------------
# Immunization
# ---------------------------------------------------------------------------


class Immunization(BaseModel):
    """
    A vaccine administered to the user.

    FHIR mapping: Immunization resource.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="immunizations",
    )
    vaccine = models.CharField(max_length=255, db_index=True)
    dose_number = models.PositiveSmallIntegerField(null=True, blank=True)
    administered_on = models.DateField()
    next_due = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True, default="")
    condition_ids = models.JSONField(default=list, blank=True)
    provenance = models.JSONField(null=True, blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Immunization"
        verbose_name_plural = "Immunizations"

    def __str__(self) -> str:
        return f"{self.vaccine} (dose {self.dose_number or 1}) — {self.user_id}"


# ---------------------------------------------------------------------------
# VitalReading
# ---------------------------------------------------------------------------


class VitalReading(AttachmentMixin, BaseModel):
    """
    A single vital-sign measurement.

    Blood pressure uses value (systolic) + value2 (diastolic).
    CUSTOM readings use the label field for the metric name.

    FHIR mapping: Observation resource.
    LOINC codes are resolved at export time; they are not stored here.
    """

    class VitalType(models.TextChoices):
        BLOOD_PRESSURE = "BLOOD_PRESSURE", "Blood Pressure"
        PULSE = "PULSE", "Pulse"
        RESPIRATORY_RATE = "RESPIRATORY_RATE", "Respiratory Rate"
        TEMPERATURE = "TEMPERATURE", "Temperature"
        SPO2 = "SPO2", "Oxygen Saturation (SpO₂)"
        BLOOD_GLUCOSE = "BLOOD_GLUCOSE", "Blood Glucose"
        WEIGHT = "WEIGHT", "Weight"
        HEIGHT = "HEIGHT", "Height"
        BMI = "BMI", "BMI"
        PAIN = "PAIN", "Pain Score"
        PEAK_FLOW = "PEAK_FLOW", "Peak Flow"
        CUSTOM = "CUSTOM", "Custom"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="vital_readings",
    )
    vital_type = models.CharField(
        max_length=30, choices=VitalType.choices, db_index=True
    )
    value = models.DecimalField(max_digits=10, decimal_places=3)
    # Second value for paired readings (BP diastolic, etc.)
    value2 = models.DecimalField(max_digits=10, decimal_places=3, null=True, blank=True)
    unit = models.CharField(max_length=30)
    measured_at = models.DateTimeField(db_index=True)
    context = models.CharField(max_length=255, blank=True, default="")
    # Display name for CUSTOM readings.
    label = models.CharField(max_length=100, blank=True, default="")
    notes = models.TextField(blank=True, default="")
    condition_ids = models.JSONField(default=list, blank=True)
    provenance = models.JSONField(null=True, blank=True)


    class Meta(BaseModel.Meta):
        verbose_name = "Vital Reading"
        verbose_name_plural = "Vital Readings"
        indexes = [
            models.Index(fields=["user", "vital_type", "-measured_at"]),
        ]

    def __str__(self) -> str:
        display = f"{self.value}{' / ' + str(self.value2) if self.value2 else ''} {self.unit}"
        return f"{self.vital_type}: {display} at {self.measured_at} — {self.user_id}"


# ---------------------------------------------------------------------------
# Record review
# ---------------------------------------------------------------------------


class RecordReview(models.Model):
    """
    The latest automatic review of one record: rule findings, differences
    between the form and its attached document, and a short AI insight.

    One row per record (updated in place on every save), so the record page
    can always show the current state. Reviews are informational; they never
    block or change the record itself.
    """

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        DONE = "DONE", "Done"
        FAILED = "FAILED", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="record_reviews",
    )
    record_type = models.CharField(max_length=20)
    record_id = models.UUIDField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    # [{"level", "rule", "title", "detail", "data"}], most serious first
    findings = models.JSONField(default=list, blank=True)
    # [{"field", "form", "document", "suggestion", "detail"}]
    mismatches = models.JSONField(default=list, blank=True)
    # {"summary", "points", "urgency"} or null
    ai_insight = models.JSONField(null=True, blank=True)
    # DONE | SKIPPED | FAILED
    ai_status = models.CharField(max_length=10, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Record Review"
        verbose_name_plural = "Record Reviews"
        constraints = [
            models.UniqueConstraint(fields=["record_type", "record_id"], name="one_review_per_record"),
        ]
        indexes = [models.Index(fields=["user", "-updated_at"])]

    def __str__(self) -> str:
        return f"Review of {self.record_type} {self.record_id} ({self.status})"
