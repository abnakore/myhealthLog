"""
Sharing & Safety models for myHealthLog.

Three trust features:

1. CareProvider      — a doctor / lab given *scoped* read (or contribute) access
                       to part of the record via a share code.

2. EmergencySettings — per-user settings for the emergency card: token, PIN,
                       and which sections to reveal to a first responder.

3. CareProxyGrant    — access between two accounts (Phase 2).
                       An owner invites another person to open their record.
                       Two permission levels: VIEW (read-only) or FULL (read+write).

Security model:
  - Share codes and emergency tokens are stored as SHA-256 hashes. The raw
    code is returned to the owner once at creation and never persisted.
  - A PIN is hashed with the same function; it is compared by hash, not plaintext.
  - Regenerating an emergency token invalidates the old one by construction.
"""


from django.conf import settings
from django.db import models

from apps.core.models import BaseModel
from apps.core.utils import generate_emergency_token, generate_share_code, hash_token

# ---------------------------------------------------------------------------
# CareProvider
# ---------------------------------------------------------------------------


class CareProvider(BaseModel):
    """
    A scoped share link given to a healthcare provider or laboratory.

    The provider opens the shared view by entering the share code (and
    optional PIN).  They can read the record within the granted scopes and,
    when access == CONTRIBUTE, add a single note per record item.
    """

    class Access(models.TextChoices):
        VIEW = "VIEW", "View only"
        CONTRIBUTE = "CONTRIBUTE", "View & fill in"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Waiting to open"
        ACTIVE = "ACTIVE", "Active"
        EXPIRED = "EXPIRED", "Expired"
        REVOKED = "REVOKED", "Revoked"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="care_providers",
    )
    name = models.CharField(max_length=255)
    role = models.CharField(max_length=100, blank=True, default="")
    facility = models.CharField(max_length=255, blank=True, default="")

    # The scopes the provider may see — stored as a JSON list of ShareScope strings.
    scopes = models.JSONField(default=list)
    access = models.CharField(max_length=20, choices=Access.choices, default=Access.VIEW)

    # The share code is stored as a SHA-256 hash.
    share_code_hash = models.CharField(max_length=64, unique=True, db_index=True)
    # Optional PIN — SHA-256 hashed.
    pin_hash = models.CharField(max_length=64, blank=True, default="")
    pin_enabled = models.BooleanField(default=False)

    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True
    )
    expires_at = models.DateTimeField(null=True, blank=True)
    last_accessed_at = models.DateTimeField(null=True, blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Care Provider"
        verbose_name_plural = "Care Providers"

    def __str__(self) -> str:
        return f"{self.name} ({self.status}) — {self.owner_id}"

    # ------------------------------------------------------------------
    # Factory helpers — call these to create shares, not the constructor
    # ------------------------------------------------------------------

    @classmethod
    def create_share(
        cls,
        owner,
        name: str,
        scopes: list,
        access: str = Access.VIEW,
        role: str = "",
        facility: str = "",
        pin: str | None = None,
        expires_at=None,
    ) -> tuple["CareProvider", str]:
        """
        Mint a new share, return the (instance, raw_code) pair.

        The raw_code is returned once and never stored; the hash is stored.
        """
        raw_code = generate_share_code()
        pin_hash = hash_token(pin) if pin else ""
        instance = cls.objects.create(
            owner=owner,
            name=name,
            scopes=scopes,
            access=access,
            role=role,
            facility=facility,
            share_code_hash=hash_token(raw_code),
            pin_hash=pin_hash,
            pin_enabled=bool(pin),
            expires_at=expires_at,
        )
        return instance, raw_code

    def verify_pin(self, pin: str) -> bool:
        if not self.pin_enabled or not self.pin_hash:
            return True
        return hash_token(pin) == self.pin_hash


# ---------------------------------------------------------------------------
# EmergencySettings
# ---------------------------------------------------------------------------


class EmergencySettings(models.Model):
    """
    Per-user settings for the emergency card.

    One row per user.  Created with safe defaults on first access.
    The token is stored as a SHA-256 hash; regenerate() mints a new raw token
    and invalidates the old one.
    """

    owner = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="emergency_settings",
        primary_key=True,
    )
    # Hashed token — validated against the hash on every public card request.
    token_hash = models.CharField(max_length=64, unique=True, db_index=True)

    pin_enabled = models.BooleanField(default=False)
    # PIN stored as SHA-256 hash.
    pin_hash = models.CharField(max_length=64, blank=True, default="")

    # Section toggles — match the EmergencyToggleKey enum in the frontend.
    show_blood_type = models.BooleanField(default=True)
    show_allergies = models.BooleanField(default=True)
    show_medications = models.BooleanField(default=True)
    show_conditions = models.BooleanField(default=True)
    show_contacts = models.BooleanField(default=True)
    show_note = models.BooleanField(default=False)
    note = models.TextField(blank=True, default="")

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Emergency Settings"
        verbose_name_plural = "Emergency Settings"

    def __str__(self) -> str:
        return f"Emergency settings for {self.owner_id}"

    def verify_pin(self, pin: str) -> bool:
        if not self.pin_enabled or not self.pin_hash:
            return True
        return hash_token(pin) == self.pin_hash

    def regenerate_token(self) -> str:
        """Mint a new raw token, store its hash, and return the raw token."""
        raw = generate_emergency_token()
        self.token_hash = hash_token(raw)
        self.save(update_fields=["token_hash", "updated_at"])
        return raw

    @classmethod
    def get_or_create_for_user(cls, user) -> tuple["EmergencySettings", str | None]:
        """
        Return the settings for a user, creating them with a fresh token if needed.

        Returns (settings, raw_token_if_new_or_none).
        """
        try:
            return cls.objects.get(owner=user), None
        except cls.DoesNotExist:
            raw = generate_emergency_token()
            settings_obj = cls.objects.create(
                owner=user,
                token_hash=hash_token(raw),
            )
            return settings_obj, raw


# ---------------------------------------------------------------------------
# CareProxyGrant
# ---------------------------------------------------------------------------


class CareProxyGrant(BaseModel):
    """
    An access grant between two users.

    The owner invites someone (by email) to open their record.
    Accepting creates a live link from the proxy's account to the owner's record.

    INVITED  — invite sent, not yet accepted.
    ACTIVE   — accepted; access is live.
    DECLINED — the invitee declined.
    REVOKED  — the owner withdrew access.
    """

    class Permission(models.TextChoices):
        VIEW = "VIEW", "View only"
        FULL = "FULL", "Full access"

    class Status(models.TextChoices):
        INVITED = "INVITED", "Invite sent"
        ACTIVE = "ACTIVE", "Active"
        DECLINED = "DECLINED", "Declined"
        REVOKED = "REVOKED", "Revoked"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="proxy_grants_given",
    )
    proxy_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="proxy_grants_received",
    )
    proxy_email = models.EmailField(db_index=True)
    proxy_name = models.CharField(max_length=255, blank=True, default="")

    permission = models.CharField(
        max_length=10, choices=Permission.choices, default=Permission.VIEW
    )
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.INVITED, db_index=True
    )
    message = models.TextField(blank=True, default="")

    invited_at = models.DateTimeField(auto_now_add=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Care Proxy Grant"
        verbose_name_plural = "Care Proxy Grants"
        indexes = [
            models.Index(fields=["owner", "status"]),
            models.Index(fields=["proxy_email", "status"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["owner", "proxy_email"],
                condition=models.Q(status__in=["INVITED", "ACTIVE"]),
                name="unique_active_proxy_grant",
            )
        ]

    def __str__(self) -> str:
        return (
            f"Grant: {self.owner_id} → {self.proxy_email} "
            f"({self.permission}, {self.status})"
        )
