"""
User model for myHealthLog.

Uses email as the login identifier.  UUID primary key prevents sequential ID
enumeration across accounts.  The `onboarded` flag drives frontend routing —
a freshly registered user is redirected to the 7-step onboarding wizard until
they complete it.

auth_method tracks whether the account was created with email/password or
via Google OAuth so the profile page can show the right options.
"""

import uuid

from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import models
from django.utils import timezone

from .managers import UserManager


class User(AbstractBaseUser, PermissionsMixin):
    """
    Central account record for myHealthLog.

    One User → one HealthProfile (created by signal on registration).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True, db_index=True)
    name = models.CharField(max_length=255, blank=True)

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(default=timezone.now)

    # Onboarding flag — False until the user completes the onboarding wizard.
    onboarded = models.BooleanField(default=False)

    # How this account was created.
    AUTH_METHOD_PASSWORD = "password"
    AUTH_METHOD_GOOGLE = "google"
    AUTH_METHOD_CHOICES = [
        (AUTH_METHOD_PASSWORD, "Email / password"),
        (AUTH_METHOD_GOOGLE, "Google"),
    ]
    auth_method = models.CharField(
        max_length=20,
        choices=AUTH_METHOD_CHOICES,
        default=AUTH_METHOD_PASSWORD,
    )

    # Last login IP — stored for audit / suspicious-login detection.
    last_login_ip = models.GenericIPAddressField(null=True, blank=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []  # email is USERNAME_FIELD, nothing else required for createsuperuser

    class Meta:
        ordering = ["-date_joined"]
        verbose_name = "User"
        verbose_name_plural = "Users"

    def __str__(self) -> str:
        return self.email

    @property
    def display_name(self) -> str:
        return self.name.strip() or self.email.split("@")[0]
