"""
Serialisers for the sharing & safety features.

CareProviderCreateSerializer   — POST to create a share link (returns raw_code once)
CareProviderReadSerializer     — GET, list/retrieve (never exposes raw codes)
EmergencySettingsSerializer    — GET / PATCH for the user's emergency card settings
EmergencySettingsUpdateSerializer — accepts the raw PIN for hashing
CareProxyGrantSerializer       — read + write for proxy grants
ProviderAccessSerializer       — what a provider reads when they open the share link
"""

from rest_framework import serializers

from apps.core.validators import validate_pin

from .models import CareProvider, CareProxyGrant, EmergencySettings

# ---------------------------------------------------------------------------
# CareProvider
# ---------------------------------------------------------------------------

SHARE_SCOPES = {
    "profile", "allergies", "medications", "conditions",
    "measurements", "appointments", "documents", "immunizations",
}


def _clean_scopes(value):
    invalid = set(value) - SHARE_SCOPES
    if invalid:
        raise serializers.ValidationError(f"Invalid scopes: {', '.join(sorted(invalid))}.")
    if not value:
        raise serializers.ValidationError("Choose at least one part of the record to share.")
    return sorted(set(value))  # deduplicate, stable order


class CareProviderReadSerializer(serializers.ModelSerializer):
    """
    Safe read view of a care provider share.
    Never exposes the raw share code or hashed PIN.
    """

    class Meta:
        model = CareProvider
        fields = [
            "id",
            "name",
            "role",
            "facility",
            "scopes",
            "access",
            "pin_enabled",
            "status",
            "expires_at",
            "last_accessed_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class CareProviderOwnerSerializer(CareProviderReadSerializer):
    """
    The owner's own view of a share: adds the code and PIN back so the link and
    QR can be reopened at any time. Never used for the provider-facing window.
    """

    share_code = serializers.SerializerMethodField()
    pin = serializers.SerializerMethodField()

    class Meta(CareProviderReadSerializer.Meta):
        fields = [*CareProviderReadSerializer.Meta.fields, "share_code", "pin"]
        read_only_fields = fields

    def get_share_code(self, obj):
        return obj.raw_share_code

    def get_pin(self, obj):
        return obj.raw_pin


class CareProviderCreateSerializer(serializers.Serializer):
    """
    Create a new care provider share link.

    Returns the raw share code in the response (once, never again).
    The caller must copy it — we cannot recover it.
    """

    name = serializers.CharField(max_length=255)
    role = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")
    facility = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    scopes = serializers.ListField(child=serializers.CharField(), min_length=1)
    access = serializers.ChoiceField(choices=CareProvider.Access.choices, default=CareProvider.Access.VIEW)
    pin = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        write_only=True,
        validators=[validate_pin],
        help_text="Optional 4-8 digit PIN to gate the share link.",
    )
    expires_at = serializers.DateTimeField(required=False, allow_null=True)

    def validate_scopes(self, value):
        return _clean_scopes(value)

    def create(self, validated_data):
        pin = validated_data.pop("pin", None) or None
        owner = self.context["request"].user
        instance, raw_code = CareProvider.create_share(
            owner=owner,
            pin=pin,
            **validated_data,
        )
        # Attach the raw code as a non-model attribute for the view to include
        # in the response.
        instance._raw_code = raw_code
        return instance


class CareProviderUpdateSerializer(serializers.ModelSerializer):
    """
    Update an existing share: details, scopes, access, expiry — or its PIN.

    PIN handling (the code itself is never re-shown, so the PIN is how the
    owner tightens or loosens a code that is already out in the world):
      - "pin": "1234"        set a PIN, or replace the current one
      - "remove_pin": true   drop the PIN so the code alone opens the share
    Any PIN change clears the wrong-PIN lockout for this share.
    """

    pin = serializers.CharField(
        required=False,
        allow_blank=False,
        write_only=True,
        validators=[validate_pin],
        help_text="New 4-8 digit PIN for this share.",
    )
    remove_pin = serializers.BooleanField(required=False, default=False, write_only=True)
    scopes = serializers.ListField(child=serializers.CharField(), required=False)

    class Meta:
        model = CareProvider
        fields = [
            "name",
            "role",
            "facility",
            "scopes",
            "access",
            "expires_at",
            "status",
            "pin",
            "remove_pin",
        ]

    def validate_scopes(self, value):
        return _clean_scopes(value)

    def validate_status(self, value):
        # Revoking has its own endpoint (and can't be undone here); an owner may
        # only pause/resume between the live states.
        if value not in (CareProvider.Status.PENDING, CareProvider.Status.ACTIVE):
            raise serializers.ValidationError("Use the revoke action to end a share.")
        return value

    def validate(self, attrs):
        instance = self.instance
        if instance and instance.status == CareProvider.Status.REVOKED:
            raise serializers.ValidationError("A revoked share cannot be modified.")
        if attrs.get("pin") and attrs.get("remove_pin"):
            raise serializers.ValidationError(
                {"pin": "Send a new PIN or remove the PIN, not both."}
            )
        return attrs

    def update(self, instance, validated_data):
        from .services import ProviderAccessService

        raw_pin = validated_data.pop("pin", None)
        remove_pin = validated_data.pop("remove_pin", False)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if raw_pin:
            instance.set_pin(raw_pin)
        elif remove_pin:
            instance.set_pin(None)
        instance.save()
        if raw_pin or remove_pin:
            ProviderAccessService.clear_pin_failures(instance)
        return instance


# ---------------------------------------------------------------------------
# EmergencySettings
# ---------------------------------------------------------------------------


class EmergencySettingsSerializer(serializers.ModelSerializer):
    """
    Read-only representation of the owner's emergency settings. The token and
    PIN are decrypted for the owner so the card can always be shown and reprinted.
    """

    token = serializers.SerializerMethodField()
    pin = serializers.SerializerMethodField()

    def get_token(self, obj):
        return obj.current_token()

    def get_pin(self, obj):
        return obj.raw_pin

    class Meta:
        model = EmergencySettings
        fields = [
            "pin_enabled",
            "show_blood_type",
            "show_allergies",
            "show_medications",
            "show_conditions",
            "show_contacts",
            "show_note",
            "note",
            "updated_at",
            "token",
            "pin",
        ]
        read_only_fields = ["updated_at"]


class EmergencySettingsUpdateSerializer(serializers.Serializer):
    """
    PATCH the user's emergency settings.

    If pin / disable_pin are provided they are hashed/cleared appropriately.
    """

    pin_enabled = serializers.BooleanField(required=False)
    pin = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        write_only=True,
        validators=[validate_pin],
    )
    show_blood_type = serializers.BooleanField(required=False)
    show_allergies = serializers.BooleanField(required=False)
    show_medications = serializers.BooleanField(required=False)
    show_conditions = serializers.BooleanField(required=False)
    show_contacts = serializers.BooleanField(required=False)
    show_note = serializers.BooleanField(required=False)
    note = serializers.CharField(required=False, allow_blank=True)

    def save(self, instance: EmergencySettings):
        data = self.validated_data
        for field in (
            "show_blood_type", "show_allergies", "show_medications",
            "show_conditions", "show_contacts", "show_note", "note",
        ):
            if field in data:
                setattr(instance, field, data[field])

        pin_enabled = data.get("pin_enabled")
        raw_pin = data.get("pin")

        if pin_enabled is False:
            instance.pin_enabled = False
            instance.set_pin(None)
        elif raw_pin:
            instance.pin_enabled = True
            instance.set_pin(raw_pin)
        elif pin_enabled is True:
            instance.pin_enabled = True

        instance.save()
        return instance


# ---------------------------------------------------------------------------
# CareProxyGrant
# ---------------------------------------------------------------------------


class CareProxyGrantReadSerializer(serializers.ModelSerializer):
    owner_name = serializers.SerializerMethodField()

    class Meta:
        model = CareProxyGrant
        fields = [
            "id",
            "owner",
            "owner_name",
            "proxy_user",
            "proxy_email",
            "proxy_name",
            "permission",
            "status",
            "message",
            "invited_at",
            "accepted_at",
            "revoked_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_owner_name(self, obj) -> str:
        return obj.owner.name or obj.owner.email


class CareProxyGrantCreateSerializer(serializers.Serializer):
    """Invite someone to be a care proxy."""

    proxy_email = serializers.EmailField()
    permission = serializers.ChoiceField(choices=CareProxyGrant.Permission.choices)
    message = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_proxy_email(self, value: str) -> str:
        owner = self.context["request"].user
        if value.strip().lower() == owner.email.lower():
            raise serializers.ValidationError(
                "You cannot grant proxy access to yourself."
            )
        # Prevent duplicate active/pending grants.
        if CareProxyGrant.objects.filter(
            owner=owner,
            proxy_email__iexact=value,
            status__in=["INVITED", "ACTIVE"],
        ).exists():
            raise serializers.ValidationError(
                "An active or pending invite already exists for this email."
            )
        return value.strip().lower()

    def create(self, validated_data):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        owner = self.context["request"].user
        email = validated_data["proxy_email"]

        # Look up whether the invitee has an account already.
        proxy_user = User.objects.filter(email=email).first()
        return CareProxyGrant.objects.create(
            owner=owner,
            proxy_user=proxy_user,
            proxy_email=email,
            proxy_name=proxy_user.name if proxy_user else "",
            permission=validated_data["permission"],
            message=validated_data.get("message", ""),
        )


# ---------------------------------------------------------------------------
# Provider access — the view a provider gets when they open a share
# ---------------------------------------------------------------------------


class ProviderAccessRequestSerializer(serializers.Serializer):
    """What a provider submits to open a share link."""

    share_code = serializers.CharField()
    pin = serializers.CharField(required=False, allow_blank=True, default="")


class ProviderNoteSerializer(serializers.Serializer):
    """A provider submitting a note to add to the owner's record."""

    share_code = serializers.CharField()
    pin = serializers.CharField(required=False, allow_blank=True, default="")
    note = serializers.CharField(
        min_length=1,
        max_length=5000,
        error_messages={
            "blank": "Note text is required.",
            "max_length": "Notes must be under 5000 characters.",
        },
    )


# The scopes a provider may write to when the share is View & fill in. The
# serializer for each lives in the records app; they are looked up lazily in
# the view so this module stays free of a records import.
PROVIDER_WRITABLE_SCOPES = (
    "profile",
    "allergies",
    "medications",
    "conditions",
    "measurements",
    "appointments",
    "documents",
    "immunizations",
)


class _JSONObjectField(serializers.Field):
    """A JSON object sent either as a JSON body value or, in a multipart upload, as a string."""

    def to_internal_value(self, data):
        import json

        if isinstance(data, str):
            try:
                data = json.loads(data)
            except ValueError as exc:
                raise serializers.ValidationError("Send the record as a JSON object.") from exc
        if not isinstance(data, dict):
            raise serializers.ValidationError("Send the record as a JSON object.")
        return data

    def to_representation(self, value):
        return value


class ProviderRecordWriteSerializer(serializers.Serializer):
    """
    A provider adding or changing one record inside a granted scope.

    `data` is the same payload the owner's own write endpoints accept; it is
    validated per scope with the matching record write serializer in the view.
    """

    share_code = serializers.CharField()
    pin = serializers.CharField(required=False, allow_blank=True, default="")
    scope = serializers.ChoiceField(choices=PROVIDER_WRITABLE_SCOPES)
    action = serializers.ChoiceField(choices=("create", "update"), default="create")
    id = serializers.UUIDField(required=False, allow_null=True)
    data = _JSONObjectField()
