from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ("email", "name", "onboarded", "auth_method", "is_active", "date_joined")
    list_filter = ("is_active", "is_staff", "onboarded", "auth_method")
    search_fields = ("email", "name")
    ordering = ("-date_joined",)
    readonly_fields = ("last_login", "date_joined", "last_login_ip")

    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Personal", {"fields": ("name", "auth_method", "last_login_ip")}),
        ("Status", {"fields": ("onboarded", "is_active", "is_staff", "is_superuser")}),
        ("Permissions", {"fields": ("groups", "user_permissions")}),
        ("Dates", {"fields": ("last_login", "date_joined")}),
    )
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("email", "name", "password1", "password2"),
            },
        ),
    )
