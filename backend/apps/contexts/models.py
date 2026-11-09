"""
HealthContext model — condition-aware profiles (lenses over the record).

A HealthContext is not a duplicate of clinical data.  It is a *lens*:
  - CONDITION context: anchored on an existing Condition (by UUID reference).
  - LIFE_STAGE context: a stage-of-life (currently: pregnancy) that carries
    a small amount of metadata genuinely unique to that stage.

Removing a context removes a lens, not any clinical record.
"""

from django.conf import settings
from django.db import models

from apps.core.models import BaseModel


class HealthContext(BaseModel):
    """
    A lens over a user's health record.

    kind = CONDITION → conditionId points to a Condition UUID.
    kind = LIFE_STAGE → key = "pregnancy", pregnancy_data holds the metadata.
    """

    class Kind(models.TextChoices):
        CONDITION = "CONDITION", "Condition"
        LIFE_STAGE = "LIFE_STAGE", "Life stage"

    class LifeStageKey(models.TextChoices):
        PREGNANCY = "pregnancy", "Pregnancy"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="health_contexts",
    )
    kind = models.CharField(max_length=20, choices=Kind.choices)

    # CONDITION context: UUID of the related Condition (string reference, no FK)
    condition_id = models.CharField(max_length=100, blank=True, default="")

    # Additional linked condition IDs (e.g. gestational diabetes in a pregnancy)
    condition_ids = models.JSONField(default=list, blank=True)

    # LIFE_STAGE context: which stage
    key = models.CharField(
        max_length=50, choices=LifeStageKey.choices, blank=True, default=""
    )

    # Pregnancy-specific metadata (JSON); null for CONDITION contexts.
    pregnancy_data = models.JSONField(null=True, blank=True)

    class Meta(BaseModel.Meta):
        verbose_name = "Health Context"
        verbose_name_plural = "Health Contexts"
        indexes = [
            models.Index(fields=["user", "kind"]),
        ]

    def __str__(self) -> str:
        if self.kind == self.Kind.CONDITION:
            return f"Condition lens ({self.condition_id}) — {self.user_id}"
        return f"Life stage lens ({self.key}) — {self.user_id}"
