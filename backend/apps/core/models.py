"""
Abstract base models shared by every domain model in myHealthLog.

Three building blocks:
  TimeStampedModel  — created_at / updated_at audit fields.
  UUIDModel         — UUID primary key for public-facing models (prevents ID enumeration).
  SoftDeleteModel   — logical deletion; hard_delete() for permanent removal.
  BaseModel         — TimeStampedModel + SoftDeleteModel (the default for domain models).
"""

import uuid

from django.db import models
from django.utils import timezone


class TimeStampedModel(models.Model):
    """
    Abstract base that adds immutable created_at and auto-updated updated_at.
    All domain models inherit this.
    """

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class UUIDModel(models.Model):
    """
    Abstract base that replaces the default integer primary key with a UUID.

    Use for models whose IDs are ever exposed in URLs or API responses — UUID
    prevents sequential ID enumeration, which is a meaningful privacy protection
    for health records.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    class Meta:
        abstract = True


class SoftDeleteQuerySet(models.QuerySet):
    """
    QuerySet that treats 'deleted' as a logical flag, not a physical removal.
    The default manager filters out soft-deleted rows automatically.
    """

    def alive(self) -> "SoftDeleteQuerySet":
        """All rows that have not been soft-deleted."""
        return self.filter(deleted_at__isnull=True)

    def dead(self) -> "SoftDeleteQuerySet":
        """All soft-deleted rows (admin / data-recovery use)."""
        return self.filter(deleted_at__isnull=False)

    def delete(self):  # type: ignore[override]
        """Soft-delete: stamp deleted_at instead of issuing DELETE SQL."""
        return self.update(deleted_at=timezone.now())

    def hard_delete(self):
        """Permanently remove rows — use only when explicitly required."""
        return super().delete()


class SoftDeleteManager(models.Manager):
    def get_queryset(self) -> SoftDeleteQuerySet:
        return SoftDeleteQuerySet(self.model, using=self._db).alive()


class SoftDeleteModel(models.Model):
    """
    Abstract base that provides logical deletion.

    Call .delete() to soft-delete (sets deleted_at).
    Call .hard_delete() to permanently remove.
    The default manager hides soft-deleted rows; use .all_objects to include them.
    """

    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)

    objects = SoftDeleteManager()
    all_objects = models.Manager()  # bypasses the soft-delete filter

    class Meta:
        abstract = True

    def delete(self, using=None, keep_parents=False):  # type: ignore[override]
        self.deleted_at = timezone.now()
        self.save(update_fields=["deleted_at"])

    def hard_delete(self, using=None, keep_parents=False):
        super().delete(using=using, keep_parents=keep_parents)

    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None


class BaseModel(UUIDModel, TimeStampedModel, SoftDeleteModel):
    """
    Standard base for all domain models in myHealthLog.

    Provides:
      - UUID primary key (prevents ID enumeration)
      - created_at / updated_at timestamps
      - Soft-delete with objects / all_objects managers
      - Consistent default ordering (newest first)
    """

    class Meta:
        abstract = True
        ordering = ["-created_at"]
        get_latest_by = "created_at"
