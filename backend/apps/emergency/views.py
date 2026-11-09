"""
Emergency views.

Public (no auth required):
  GET  /api/v1/emergency/card/<token>/       — resolve an emergency token and return the card
  POST /api/v1/emergency/card/<token>/verify-pin/ — verify PIN before revealing card

Authenticated:
  GET  /api/v1/emergency/dynamic-ai-summary/ — AI-prioritised summary (cached in Redis)
  POST /api/v1/emergency/dynamic-ai-summary/invalidate/ — force cache invalidation
"""

import logging

from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from apps.core.exceptions import BusinessRuleError, NotFoundError
from apps.core.utils import hash_token
from apps.sharing.models import EmergencySettings

from .services import AIDynamicSummaryService, StaticEmergencyService

logger = logging.getLogger(__name__)


class EmergencyTokenThrottle(AnonRateThrottle):
    """Strict throttle for the public emergency card endpoint — 10 requests/minute."""
    scope = "emergency_token"


# ---------------------------------------------------------------------------
# Public: resolve token → card
# ---------------------------------------------------------------------------


class EmergencyCardView(APIView):
    """
    GET /api/v1/emergency/card/<token>/

    Resolve an emergency token and return the compiled static card.
    If a PIN is required, returns { "pin_required": true } with HTTP 403.

    This endpoint is intentionally opaque: every invalid code gets the same
    "not found" response — we do not distinguish "wrong code" from "revoked".
    """

    permission_classes = [AllowAny]
    throttle_classes = [EmergencyTokenThrottle]

    def get(self, request, token: str):
        settings_obj, user = self._resolve_token(token)
        if settings_obj.pin_enabled and settings_obj.pin_hash:
            return Response(
                {"pin_required": True},
                status=status.HTTP_403_FORBIDDEN,
            )
        card = StaticEmergencyService.compile(user, settings_obj)
        return Response(card)

    @staticmethod
    def _resolve_token(token: str):
        """Find the EmergencySettings whose token_hash matches the given raw token."""
        token_hash = hash_token(token.strip())
        try:
            settings_obj = EmergencySettings.objects.select_related("owner").get(
                token_hash=token_hash
            )
        except EmergencySettings.DoesNotExist:
            raise NotFoundError("This emergency code is not valid.") from None
        return settings_obj, settings_obj.owner


class EmergencyPinVerifyView(APIView):
    """
    POST /api/v1/emergency/card/<token>/verify-pin/
    Body: { "pin": "1234" }

    Verify the PIN for a PIN-protected emergency card.
    Returns the full card on success or HTTP 403 on failure.

    Rate-limited to 10 attempts/minute to prevent brute-force.
    """

    permission_classes = [AllowAny]
    throttle_classes = [EmergencyTokenThrottle]

    def post(self, request, token: str):
        settings_obj, user = EmergencyCardView._resolve_token(token)

        if not settings_obj.pin_enabled:
            # Card doesn't have a PIN — just return the card.
            return Response(StaticEmergencyService.compile(user, settings_obj))

        pin = str(request.data.get("pin", "")).strip()
        if not settings_obj.verify_pin(pin):
            logger.warning(
                "Failed PIN attempt for emergency token %s from %s",
                token[-4:],
                request.META.get("REMOTE_ADDR", ""),
            )
            raise BusinessRuleError("Incorrect PIN.")

        return Response(StaticEmergencyService.compile(user, settings_obj))


# ---------------------------------------------------------------------------
# Authenticated: AI dynamic summary
# ---------------------------------------------------------------------------


class AIDynamicSummaryView(APIView):
    """
    GET /api/v1/emergency/dynamic-ai-summary/

    Return the AI-prioritised emergency summary for the authenticated user.

    The summary is cached in Redis for EMERGENCY_AI_SUMMARY_CACHE_TTL seconds
    (default 1 hour).  The AI is not called on every request.

    Response schema:
    {
      "emergency_overview": { ... },
      "core_essentials": { "emergency_contacts": [...] },
      "ai_prioritized_sections": [ { "priority_rank": int, "module_type": str, ... } ]
    }
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        summary = AIDynamicSummaryService.get_or_generate(request.user)
        return Response(summary)


class AIDynamicSummaryInvalidateView(APIView):
    """
    POST /api/v1/emergency/dynamic-ai-summary/invalidate/

    Force the AI summary cache to be cleared for the authenticated user.
    The next GET will trigger a fresh AI analysis.

    Called automatically by record change signals in production.
    Exposed as an API endpoint so the frontend can trigger it manually
    (e.g. after the user saves significant changes to their record).
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        AIDynamicSummaryService.invalidate(str(request.user.id))
        return Response({"detail": "AI summary cache cleared. A fresh summary will be generated on the next request."})
