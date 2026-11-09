from django.contrib import admin

from .models import CareProvider, CareProxyGrant, EmergencySettings


@admin.register(CareProvider)
class CareProviderAdmin(admin.ModelAdmin):
    list_display = ("name", "owner", "access", "status", "pin_enabled", "created_at")
    list_filter = ("access", "status", "pin_enabled")
    search_fields = ("name", "owner__email", "facility")
    readonly_fields = ("share_code_hash", "pin_hash")


@admin.register(EmergencySettings)
class EmergencySettingsAdmin(admin.ModelAdmin):
    list_display = ("owner", "pin_enabled", "updated_at")
    readonly_fields = ("token_hash", "pin_hash")


@admin.register(CareProxyGrant)
class CareProxyGrantAdmin(admin.ModelAdmin):
    list_display = ("owner", "proxy_email", "permission", "status", "invited_at")
    list_filter = ("permission", "status")
    search_fields = ("owner__email", "proxy_email")
