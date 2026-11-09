from django.contrib import admin

from .models import EmergencyContact, HealthProfile


class EmergencyContactInline(admin.TabularInline):
    model = EmergencyContact
    extra = 0
    fields = ("name", "relationship", "phone", "priority")


@admin.register(HealthProfile)
class HealthProfileAdmin(admin.ModelAdmin):
    list_display = ("full_name", "user", "blood_type", "genotype", "created_at")
    search_fields = ("full_name", "user__email")
    inlines = [EmergencyContactInline]
