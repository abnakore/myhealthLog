"""
Authentication views for myHealthLog.

Endpoints:
    POST /api/v1/auth/register/           RegisterView
    POST /api/v1/auth/login/              CustomTokenObtainPairView
    POST /api/v1/auth/refresh/            TokenRefreshView (simplejwt)
    POST /api/v1/auth/logout/             LogoutView
    GET  /api/v1/auth/me/                 MeView
    POST /api/v1/auth/password/change/    PasswordChangeView
    POST /api/v1/auth/google/             GoogleLoginView
    POST /api/v1/auth/onboarding/complete/ OnboardingCompleteView
"""

import logging

from django.conf import settings
from django.contrib.auth import get_user_model
from google.auth.exceptions import GoogleAuthError
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from apps.core.exceptions import BusinessRuleError

from .serializers import (
    CustomTokenObtainPairSerializer,
    GoogleTokenSerializer,
    OnboardingCompleteSerializer,
    PasswordChangeSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    RegisterSerializer,
    UserReadSerializer,
)

User = get_user_model()
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _google_client_id() -> str:
    """The OAuth client ID a Google ID token must be minted for."""
    return (
        getattr(settings, "SOCIAL_AUTH_GOOGLE_OAUTH2_KEY", "")
        or getattr(settings, "GOOGLE_OAUTH2_CLIENT_ID", "")
    ).strip()


def _verify_google_id_token(id_token: str) -> dict:
    """
    Verify a Google ID token and return its claims.

    The token is checked against Google's published signing keys, including
    signature, issuer, expiry and audience (our client ID), so a forged or
    replayed token from the browser cannot sign anyone in.
    """
    client_id = _google_client_id()
    if not client_id:
        raise BusinessRuleError("Google sign-in is not configured on this server.")

    try:
        claims = google_id_token.verify_oauth2_token(
            id_token,
            google_requests.Request(),
            client_id,
            clock_skew_in_seconds=10,
        )
    except (ValueError, GoogleAuthError) as exc:
        logger.warning("Google ID token rejected: %s", exc)
        raise BusinessRuleError(
            "Could not verify the Google token. Please try signing in again."
        ) from exc

    if claims.get("email_verified") not in (True, "true", "True"):
        raise BusinessRuleError("Google has not verified this email address.")
    return claims


def _tokens_for_user(user: User) -> dict:
    """Mint a JWT pair for a user and return as a dict."""
    refresh = RefreshToken.for_user(user)
    return {
        "access": str(refresh.access_token),
        "refresh": str(refresh),
    }


# ---------------------------------------------------------------------------
# Views
# ---------------------------------------------------------------------------


class AuthRateThrottle(AnonRateThrottle):
    """Per-IP cap on credential endpoints (password guessing, signup spam)."""

    scope = "auth"


class RegisterView(generics.CreateAPIView):
    """
    Register a new user and return JWT tokens + the user profile.

    POST /api/v1/auth/register/
    Body: { "name": str, "email": str, "password": str }
    Response 201: { "user": {...}, "access": str, "refresh": str }
    """

    permission_classes = [AllowAny]
    serializer_class = RegisterSerializer
    throttle_classes = [AuthRateThrottle]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        tokens = _tokens_for_user(user)
        from apps.notifications.emails import app_url, send_email

        first = (user.name or "").split()[0] if user.name else "there"
        send_email(
            user.email,
            "Welcome to myHealthLog",
            f"Welcome, {first}",
            [
                "Your myHealthLog account is ready. Add your allergies, medicines and "
                "conditions once, and they are there for every clinic visit, for the people "
                "you trust, and for your emergency card.",
                "If you did not create this account, reply to this email and we will remove it.",
            ],
            ("Open myHealthLog", app_url("/app")),
        )
        return Response(
            {"user": UserReadSerializer(user, context={"request": request}).data, **tokens},
            status=status.HTTP_201_CREATED,
        )


class CustomTokenObtainPairView(TokenObtainPairView):
    """
    Login with email + password, returns access, refresh, and user profile.

    POST /api/v1/auth/login/
    Body: { "email": str, "password": str }
    Response 200: { "access": str, "refresh": str, "user": {...} }
    """

    serializer_class = CustomTokenObtainPairSerializer
    throttle_classes = [AuthRateThrottle]


class LogoutView(APIView):
    """
    Blacklist the provided refresh token (effective logout).

    POST /api/v1/auth/logout/
    Body: { "refresh": str }
    Response 205: {}
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            token = RefreshToken(request.data.get("refresh", ""))
            token.blacklist()
            logger.info("User %s logged out", request.user.id)
        except TokenError:
            raise BusinessRuleError("Invalid or already-expired refresh token.") from None
        return Response(status=status.HTTP_205_RESET_CONTENT)


class MeView(APIView):
    """
    Return the authenticated user's profile.

    GET /api/v1/auth/me/
    Response 200: UserReadSerializer
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserReadSerializer(request.user, context={"request": request})
        return Response(serializer.data)

    def patch(self, request):
        """Update the user's display name."""
        name = request.data.get("name", "").strip()
        if name:
            request.user.name = name
            request.user.save(update_fields=["name"])
        return Response(
            UserReadSerializer(request.user, context={"request": request}).data
        )


class PasswordChangeView(APIView):
    """
    Change the authenticated user's password.

    POST /api/v1/auth/password/change/
    Body: { "current_password": str, "new_password": str, "confirm_password": str }
    Response 200: { "detail": "Password changed." }
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = PasswordChangeSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"detail": "Password changed successfully."})


class GoogleLoginView(APIView):
    """
    Exchange a Google id_token for myHealthLog JWT tokens.

    The frontend completes the OAuth popup / redirect and receives a Google
    ID token.  It sends that token here.  We verify it with Google's userinfo
    endpoint, find or create the corresponding User, and return our own JWT pair.

    POST /api/v1/auth/google/
    Body: { "id_token": str }
    Response 200: { "user": {...}, "access": str, "refresh": str, "is_new": bool }
    """

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = GoogleTokenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        claims = _verify_google_id_token(serializer.validated_data["id_token"])

        email = (claims.get("email") or "").strip().lower()
        name = (claims.get("name") or "").strip()

        if not email:
            raise BusinessRuleError("Google did not return an email address.")

        user, created = User.objects.get_or_create(
            email=email,
            defaults={
                "name": name,
                "auth_method": User.AUTH_METHOD_GOOGLE,
            },
        )
        if not created and not user.name and name:
            user.name = name
            user.save(update_fields=["name"])

        tokens = _tokens_for_user(user)
        logger.info(
            "Google login for user %s (new=%s)", user.id, created
        )
        return Response(
            {
                "user": UserReadSerializer(user, context={"request": request}).data,
                "is_new": created,
                **tokens,
            }
        )


class OnboardingCompleteView(APIView):
    """
    Mark the current user's onboarding as complete.

    Called by the frontend at the end of the 7-step onboarding wizard.

    POST /api/v1/auth/onboarding/complete/
    Response 200: { "user": {...} }
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not request.user.onboarded:
            request.user.onboarded = True
            request.user.save(update_fields=["onboarded"])
            logger.info("Onboarding completed for user %s", request.user.id)
        return Response(
            UserReadSerializer(request.user, context={"request": request}).data
        )


class PasswordResetRequestView(APIView):
    """
    Send a password reset link to the user's email.

    POST /api/v1/auth/password/reset/
    Body: { "email": str }
    If the email exists, a reset link token is generated and emailed.
    Response 200: { "detail": "If an account with that email exists, you will receive a password reset link." }
    """

    permission_classes = [AllowAny]
    throttle_classes = [AuthRateThrottle]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]

        from django.contrib.auth.tokens import default_token_generator
        from django.utils.encoding import force_bytes
        from django.utils.http import urlsafe_base64_encode

        User = get_user_model()
        user = User.objects.filter(email=email).first()

        detail = "If an account with that email exists, you will receive a password reset link."
        if user is None:
            return Response({"detail": detail}, status=status.HTTP_200_OK)

        uidb64 = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        reset_url = (
            f"{settings.FRONTEND_URL.rstrip('/')}/reset-password"
            f"?uid={uidb64}&token={token}"
        )

        # Queued through Celery; the response is identical either way, so the
        # caller cannot learn whether the address has an account.
        from apps.notifications.emails import send_email

        send_email(
            user.email,
            "Reset your myHealthLog password",
            "Reset your password",
            [
                "We received a request to reset the password for your myHealthLog account.",
                "The link below works once and expires in a few days. If you didn't ask for "
                "this, you can ignore this email — your password will not change.",
            ],
            ("Choose a new password", reset_url),
        )

        logger.info("Password reset email queued for user %s", user.id)
        return Response({"detail": detail}, status=status.HTTP_200_OK)


class PasswordResetConfirmView(APIView):
    """
    Confirm and complete a password reset using the token from the email.

    POST /api/v1/auth/password/reset/confirm/
    Body: { "token": str, "new_password": str, "confirm_password": str }
    Response 200: { "detail": "Password changed successfully." }
    """

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        logger.info("Password reset completed via API")
        return Response({"detail": "Password changed successfully."}, status=status.HTTP_200_OK)
