"""
Notification model for myHealthLog.

A notification belongs to one user (the recipient). It carries:
  - kind      — machine-readable event type (see Kind choices)
  - title     — short human-readable headline
  - body      — one-sentence detail
  - data      — arbitrary JSON for the frontend to deep-link or render extra context
  - is_read   — True once the user has opened or acknowledged it
  - created_at — when the event happened

Design decisions:
  - Hard-delete on dismiss: notifications that are deleted are gone. There is
    no soft-delete here — a dismissed notification has no clinical value.
  - All notification creation goes through the module-level `notify()` helper so
    there is exactly one place that writes to this table.
  - No foreign keys to clinical records — the `data` JSON holds a reference
    (e.g. {"record_type": "allergy", "record_id": "abc"}) so a delete of the
    underlying record never cascades into an obscure notification failure.
"""

from django.conf import settings
from django.db import models


class Notification(models.Model):
    """One in-app notification for one user."""

    class Kind(models.TextChoices):
        # Account
        WELCOME             = "WELCOME",             "Welcome to myHealthLog"
        # Records
        RECORD_ADDED        = "RECORD_ADDED",        "Record added"
        RECORD_UPDATED      = "RECORD_UPDATED",      "Record updated"
        RECORD_DELETED      = "RECORD_DELETED",      "Record deleted"
        # Documents / AI
        DOCUMENT_EXTRACTED  = "DOCUMENT_EXTRACTED",  "Document processed"
        DOCUMENT_EXTRACT_FAILED = "DOCUMENT_EXTRACT_FAILED", "Document processing failed"
        # Provider sharing
        PROVIDER_CREATED    = "PROVIDER_CREATED",    "Care provider access granted"
        PROVIDER_NOTE_ADDED = "PROVIDER_NOTE_ADDED", "Care provider added a note"
        SHARE_FIRST_OPENED  = "SHARE_FIRST_OPENED",  "Your shared record was opened"
        # Proxy
        PROXY_INVITE_RECEIVED = "PROXY_INVITE_RECEIVED", "Proxy invite received"
        PROXY_INVITE_ACCEPTED = "PROXY_INVITE_ACCEPTED", "Proxy invite accepted"
        PROXY_INVITE_DECLINED = "PROXY_INVITE_DECLINED", "Proxy invite declined"
        PROXY_ACCESS_REVOKED  = "PROXY_ACCESS_REVOKED",  "Proxy access revoked"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
        db_index=True,
    )
    kind = models.CharField(
        max_length=40,
        choices=Kind.choices,
        db_index=True,
    )
    title = models.CharField(max_length=255)
    body = models.TextField(blank=True, default="")
    # Arbitrary JSON: record IDs, names, links the frontend can use
    data = models.JSONField(default=dict, blank=True)
    is_read = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Notification"
        verbose_name_plural = "Notifications"
        indexes = [
            models.Index(fields=["user", "is_read", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"[{self.kind}] {self.title} → {self.user_id}"
