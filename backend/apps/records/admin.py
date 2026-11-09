from django.contrib import admin

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


@admin.register(Allergy)
class AllergyAdmin(admin.ModelAdmin):
    list_display = ("substance", "allergy_type", "severity", "user", "is_verified", "created_at")
    list_filter = ("allergy_type", "severity", "is_verified")
    search_fields = ("substance", "user__email")


@admin.register(Medication)
class MedicationAdmin(admin.ModelAdmin):
    list_display = ("name", "dosage", "active", "user", "start_date", "created_at")
    list_filter = ("active",)
    search_fields = ("name", "user__email", "prescriber")


@admin.register(Condition)
class ConditionAdmin(admin.ModelAdmin):
    list_display = ("name", "status", "severity", "user", "onset_date", "created_at")
    list_filter = ("status", "severity")
    search_fields = ("name", "user__email", "icd10_code")


@admin.register(Appointment)
class AppointmentAdmin(admin.ModelAdmin):
    list_display = ("title", "status", "scheduled_for", "user", "facility")
    list_filter = ("status",)
    search_fields = ("title", "user__email", "clinician", "facility")


@admin.register(HealthDocument)
class HealthDocumentAdmin(admin.ModelAdmin):
    list_display = ("title", "doc_type", "ai_extraction_status", "user", "uploaded_at")
    list_filter = ("doc_type", "ai_extraction_status")
    search_fields = ("title", "user__email", "lab_name")
    readonly_fields = ("ai_extraction", "ai_extraction_status")


@admin.register(Procedure)
class ProcedureAdmin(admin.ModelAdmin):
    list_display = ("name", "performed_on", "facility", "user")
    search_fields = ("name", "user__email", "facility")


@admin.register(Immunization)
class ImmunizationAdmin(admin.ModelAdmin):
    list_display = ("vaccine", "dose_number", "administered_on", "user")
    search_fields = ("vaccine", "user__email")


@admin.register(VitalReading)
class VitalReadingAdmin(admin.ModelAdmin):
    list_display = ("vital_type", "value", "unit", "measured_at", "user")
    list_filter = ("vital_type",)
    search_fields = ("vital_type", "user__email", "label")
