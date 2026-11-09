"""
Profile serialisers.

EmergencyContactSerializer    — nested inside HealthProfileSerializer
HealthProfileReadSerializer   — full read (GET /profile/)
HealthProfileWriteSerializer  — update (PATCH /profile/)
PhotoUploadSerializer         — photo-only PATCH
"""

from apps.core.validators import validate_file_size, validate_image_extension
from rest_framework import serializers

from apps.core.serializers import BaseModelSerializer

from .models import EmergencyContact, HealthProfile


class EmergencyContactSerializer(serializers.ModelSerializer):
    """Full representation of one emergency contact."""

    class Meta:
        model = EmergencyContact
        fields = [
            "id",
            "name",
            "relationship",
            "phone",
            "alt_phone",
            "priority",
            "language",
            "notes",
        ]


class HealthProfileReadSerializer(serializers.ModelSerializer):
    """
    Complete profile for the authenticated user.

    Matches the frontend HealthProfile type exactly.
    """

    emergencyContacts = EmergencyContactSerializer(
        source="emergency_contacts",
        many=True,
        read_only=True,
    )
    photoUrl = serializers.SerializerMethodField()
    # Convenience field: latest weight is stored as a VitalReading;
    # this is computed server-side.
    weightKg = serializers.SerializerMethodField()

    class Meta:
        model = HealthProfile
        fields = [
            "id",
            "full_name",
            "date_of_birth",
            "sex",
            "blood_type",
            "genotype",
            "height_cm",
            "weightKg",
            "phone",
            "city",
            "state",
            "country",
            "address",
            "photoUrl",
            "emergencyContacts",
            "created_at",
            "updated_at",
        ]

    def get_photoUrl(self, obj) -> str | None:
        if not obj.photo:
            return None
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(obj.photo.url)
        return obj.photo.url

    def get_weightKg(self, obj) -> float | None:
        """Latest weight reading from VitalReading — convenience denorm."""
        latest = (
            obj.user.vital_readings.filter(vital_type="WEIGHT")
            .order_by("-measured_at")
            .first()
        )
        if latest:
            return float(latest.value)
        return None


class HealthProfileWriteSerializer(BaseModelSerializer):
    """
    Fields the user may update on their profile.
    Emergency contacts are managed separately via /profile/contacts/ endpoints.

    weightKg is a convenience write-only field: when provided, it creates a
    VitalReading of type WEIGHT so the latest-weight computed field works.
    """

    weightKg = serializers.FloatField(write_only=True, required=False, allow_null=True)

    class Meta:
        model = HealthProfile
        fields = [
            "full_name",
            "date_of_birth",
            "sex",
            "blood_type",
            "genotype",
            "height_cm",
            "phone",
            "city",
            "state",
            "country",
            "address",
            "weightKg",
        ]

    def validate_height_cm(self, value):
        if value is not None and not (50 <= float(value) <= 300):
            raise serializers.ValidationError(
                "Height must be between 50 and 300 cm."
            )
        return value

    def validate_weightKg(self, value):
        if value is not None and not (20 <= float(value) <= 500):
            raise serializers.ValidationError(
                "Weight must be between 20 and 500 kg."
            )
        return value

    def update(self, instance, validated_data):
        weight = validated_data.pop("weightKg", None)
        instance = super().update(instance, validated_data)
        if weight is not None:
            from django.utils import timezone

            from apps.records.models import VitalReading

            VitalReading.objects.create(
                user=instance.user,
                vital_type="WEIGHT",
                value=weight,
                unit="kg",
                measured_at=timezone.now(),
            )
        return instance


class PhotoUploadSerializer(serializers.Serializer):
    """Photo-only upload for profile picture."""

    photo = serializers.ImageField(validators=[validate_file_size, validate_image_extension])


class EmergencyContactWriteSerializer(serializers.ModelSerializer):
    """Create / update one emergency contact."""

    class Meta:
        model = EmergencyContact
        fields = [
            "name",
            "relationship",
            "phone",
            "alt_phone",
            "priority",
            "language",
            "notes",
        ]

    def validate_phone(self, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise serializers.ValidationError("Phone number is required.")
        return stripped
