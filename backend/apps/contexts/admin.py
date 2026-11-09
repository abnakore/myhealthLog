from django.contrib import admin

from .models import HealthContext


@admin.register(HealthContext)
class HealthContextAdmin(admin.ModelAdmin):
    list_display = ("kind", "key", "condition_id", "user", "created_at")
    list_filter = ("kind",)
    search_fields = ("user__email", "condition_id")
