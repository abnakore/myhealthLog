"""
Health profile models.

HealthProfile   — one per User; holds demographics and clinical identifiers.
EmergencyContact — ordered list of people to call in an emergency.

These sit separately from clinical records (Allergy, Medication, …) because
a profile is *about* the person, not a clinical event.  Separating them also
makes it easy to share only the profile (or only the records) with a provider.
"""


from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel
from apps.core.utils import upload_to_profile_photos
from apps.core.validators import (
    validate_file_size,
    validate_image_extension,
)


class HealthProfile(TimeStampedModel):
    """
    Core demographics for a myHealthLog user.

    One-to-one with User.  Created automatically by signal on registration.
    All clinical fields are optional — the user fills them in during onboarding
    or at any time from the Profile screen.

    FHIR mapping: Patient resource.
    """

    # Choices -----------------------------------------------------------------
    class Sex(models.TextChoices):
        MALE = "MALE", "Male"
        FEMALE = "FEMALE", "Female"
        OTHER = "OTHER", "Other"

    class BloodType(models.TextChoices):
        A_POS = "A+", "A+"
        A_NEG = "A-", "A-"
        B_POS = "B+", "B+"
        B_NEG = "B-", "B-"
        AB_POS = "AB+", "AB+"
        AB_NEG = "AB-", "AB-"
        O_POS = "O+", "O+"
        O_NEG = "O-", "O-"

    class Genotype(models.TextChoices):
        AA = "AA", "AA"
        AS = "AS", "AS"
        AC = "AC", "AC"
        SS = "SS", "SS"
        SC = "SC", "SC"

    # Fields ------------------------------------------------------------------
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="health_profile",
    )
    full_name = models.CharField(max_length=255, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    sex = models.CharField(
        max_length=10, choices=Sex.choices, blank=True, default=""
    )
    blood_type = models.CharField(
        max_length=5, choices=BloodType.choices, blank=True, default=""
    )
    genotype = models.CharField(
        max_length=5, choices=Genotype.choices, blank=True, default=""
    )
    height_cm = models.DecimalField(
        max_digits=5, decimal_places=1, null=True, blank=True
    )
    phone = models.CharField(max_length=30, blank=True, default="")
    city = models.CharField(max_length=100, blank=True, default="")
    state = models.CharField(max_length=100, blank=True, default="")
    country = models.CharField(max_length=100, blank=True, default="")
    address = models.TextField(blank=True, default="")
    photo = models.ImageField(
        upload_to=upload_to_profile_photos,
        null=True,
        blank=True,
        validators=[validate_file_size, validate_image_extension],
    )
    # Conditions and life stages the person wants the app to focus on, as
    # references: [{"kind": "pregnancy"}, {"kind": "condition", "id": "<uuid>"},
    # {"kind": "elderly"}]. Ranked on read by apps.contexts.focus.
    care_focus = models.JSONField(default=list, blank=True)

    class Meta:
        verbose_name = "Health Profile"
        verbose_name_plural = "Health Profiles"

    def __str__(self) -> str:
        return f"{self.full_name or self.user.email} ({self.user_id})"


class EmergencyContact(TimeStampedModel):
    """
    One entry in a user's list of people to call in an emergency.

    Ordered by priority (1 = first to call).  The profile view keeps at
    least one contact — no hard minimum is enforced at the DB level so a
    fresh account can be empty.

    FHIR mapping: Patient.contact.
    """

    import uuid as _uuid
    id = models.UUIDField(primary_key=True, default=_uuid.uuid4, editable=False)

    profile = models.ForeignKey(
        HealthProfile,
        on_delete=models.CASCADE,
        related_name="emergency_contacts",
    )
    name = models.CharField(max_length=255)
    relationship = models.CharField(max_length=100, blank=True, default="")
    phone = models.CharField(max_length=30)
    alt_phone = models.CharField(max_length=30, blank=True, default="")
    priority = models.PositiveSmallIntegerField(default=1)
    language = models.CharField(max_length=100, blank=True, default="")
    notes = models.TextField(blank=True, default="")

    class Meta:
        ordering = ["priority", "id"]
        verbose_name = "Emergency Contact"
        verbose_name_plural = "Emergency Contacts"

    def __str__(self) -> str:
        return f"{self.name} ({self.relationship or 'contact'}) — {self.phone}"
