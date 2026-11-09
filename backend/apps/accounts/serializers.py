"""
Serialisers for authentication endpoints.

RegisterSerializer      — POST /api/v1/auth/register/
CustomTokenObtainPair   — POST /api/v1/auth/login/  (extends simplejwt)
UserReadSerializer      — GET  /api/v1/auth/me/
PasswordChangeSerializer — POST /api/v1/auth/password/change/
OnboardingCompleteSerializer — POST /api/v1/auth/onboarding/complete/
"""

import logging

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from apps.core.utils import get_client_ip

User = get_user_model()
logger = logging.getLogger(__name__)


class UserReadSerializer(serializers.ModelSerializer):
    """
    Safe read-only representation of the authenticated user.
    Returned by /auth/me/ and embedded in token responses.
    """

    photoUrl = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "name",
            "onboarded",
            "auth_method",
            "date_joined",
            "photoUrl",
        ]
        read_only_fields = fields

    def get_photoUrl(self, obj) -> str | None:
        """Return the profile photo URL if one exists."""
        try:
            photo = obj.health_profile.photo
            if photo:
                request = self.context.get("request")
                if request:
                    return request.build_absolute_uri(photo.url)
                return photo.url
        except Exception:
            logger.debug("Photo URL resolution failed for user %s", obj.user_id)
        return None


class RegisterSerializer(serializers.Serializer):
    """
    Validates new-account registration.
    name, email, password are all required.
    """

    name = serializers.CharField(max_length=255, min_length=1)
    email = serializers.EmailField()
    password = serializers.CharField(
        write_only=True,
        min_length=8,
        style={"input_type": "password"},
    )

    def validate_email(self, value: str) -> str:
        normalised = value.strip().lower()
        if User.objects.filter(email=normalised).exists():
            raise serializers.ValidationError(
                "An account with this email already exists."
            )
        return normalised

    def validate_password(self, value: str) -> str:
        validate_password(value)
        return value

    def create(self, validated_data: dict) -> User:
        user = User.objects.create_user(
            email=validated_data["email"],
            password=validated_data["password"],
            name=validated_data["name"].strip(),
            auth_method=User.AUTH_METHOD_PASSWORD,
        )
        logger.info("New user registered: %s", user.id)
        return user


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Extends the default JWT login serialiser to:
      - Embed the user profile in the response.
      - Record the last login IP address.
    """

    def validate(self, attrs: dict) -> dict:
        data = super().validate(attrs)
        request = self.context.get("request")

        # Stamp last login IP
        if request:
            self.user.last_login_ip = get_client_ip(request)
            self.user.save(update_fields=["last_login_ip"])

        data["user"] = UserReadSerializer(
            self.user, context=self.context
        ).data
        return data


class PasswordChangeSerializer(serializers.Serializer):
    """
    Change password for an authenticated user.
    Requires the current password for confirmation.
    """

    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True)

    def validate_current_password(self, value: str) -> str:
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Current password is incorrect.")
        return value

    def validate(self, attrs: dict) -> dict:
        if attrs["new_password"] != attrs["confirm_password"]:
            raise serializers.ValidationError(
                {"confirm_password": "Passwords do not match."}
            )
        validate_password(attrs["new_password"], self.context["request"].user)
        return attrs

    def save(self, **kwargs) -> None:
        user = self.context["request"].user
        user.set_password(self.validated_data["new_password"])
        user.save(update_fields=["password"])
        logger.info("Password changed for user %s", user.id)


class GoogleTokenSerializer(serializers.Serializer):
    """
    Exchange a Google ID token (from the frontend) for a myHealthLog JWT pair.

    The frontend completes the Google OAuth flow and receives an id_token.
    It sends that token here; we verify it with Google, then find or create
    the matching User and mint our own JWT pair.
    """

    id_token = serializers.CharField()


class OnboardingCompleteSerializer(serializers.Serializer):
    """
    Mark onboarding as complete for the authenticated user.
    Accepts no input — the completion is implicit.
    """

    pass


class PasswordResetRequestSerializer(serializers.Serializer):
    """
    Request a password reset email for a given email address.
    POST /api/v1/auth/password/reset/

    Accepts any well-formed address. Whether the account exists is deliberately
    not revealed here: the view answers 200 either way so the endpoint cannot be
    used to discover which emails are registered.
    """

    email = serializers.EmailField()

    def validate_email(self, value: str) -> str:
        return value.strip().lower()


class PasswordResetConfirmSerializer(serializers.Serializer):
    """
    Confirm password reset with the uid + token from the emailed link.
    POST /api/v1/auth/password/reset/confirm/
    """

    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True)

    def validate(self, attrs: dict) -> dict:
        if attrs["new_password"] != attrs["confirm_password"]:
            raise serializers.ValidationError(
                {"confirm_password": "Passwords do not match."}
            )
        from django.contrib.auth.password_validation import validate_password
        validate_password(attrs["new_password"])
        return attrs

    def save(self, **kwargs) -> None:
        from django.contrib.auth.tokens import default_token_generator
        from django.utils.http import urlsafe_base64_decode

        User = get_user_model()
        invalid = serializers.ValidationError(
            {"token": "Invalid or expired reset token."}
        )
        try:
            uid = urlsafe_base64_decode(self.validated_data["uid"]).decode()
            user = User.objects.get(pk=uid)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist, UnicodeDecodeError):
            raise invalid from None

        if not default_token_generator.check_token(user, self.validated_data["token"]):
            raise invalid

        user.set_password(self.validated_data["new_password"])
        user.save(update_fields=["password"])
        logger.info("Password reset for user %s", user.id)
