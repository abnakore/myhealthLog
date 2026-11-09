"""
Sharing service layer — business logic for share code resolution and
provider access compilation.
"""

import logging
from typing import Any

from django.core.cache import cache
from django.utils import timezone

from apps.core.exceptions import BusinessRuleError, NotFoundError
from apps.core.utils import hash_token

from .models import CareProvider

logger = logging.getLogger(__name__)


# Wrong-PIN lockout: a 4-digit PIN has only 10,000 values, so guesses must be
# capped per share, not just per IP.
PIN_MAX_FAILURES = 5
PIN_LOCKOUT_SECONDS = 15 * 60


def _pin_fail_key(provider_id) -> str:
    return f"provider_pin_failures:{provider_id}"


class ProviderAccessService:
    """
    Resolve a share code, verify an optional PIN, and compile the scoped
    record view a care provider is entitled to see.
    """

    @staticmethod
    def normalise_code(share_code: str) -> str:
        """
        Canonical MHL-XXXX-XXXX form, so a provider who types the code in
        lower case, with spaces, or without dashes still gets in.
        """
        import re

        compact = re.sub(r"[^A-Za-z0-9]", "", share_code or "").upper()
        if compact.startswith("MHL"):
            compact = compact[3:]
        if len(compact) == 8:
            return f"MHL-{compact[:4]}-{compact[4:]}"
        return (share_code or "").strip().upper()

    @staticmethod
    def clear_pin_failures(provider: CareProvider) -> None:
        try:
            cache.delete(_pin_fail_key(provider.id))
        except Exception:
            logger.debug("Could not clear PIN failures for %s", provider.id)

    @staticmethod
    def resolve(share_code: str, pin: str = "") -> CareProvider:
        """
        Find the live CareProvider that matches the given share code.

        Raises NotFoundError for any code that does not match an active share
        (including expired, revoked, or simply wrong) so the caller cannot
        distinguish wrong code from wrong PIN from revoked share.  This
        prevents enumeration.
        """
        code_hash = hash_token(ProviderAccessService.normalise_code(share_code))

        try:
            provider = CareProvider.objects.select_related("owner").get(
                share_code_hash=code_hash,
            )
        except CareProvider.DoesNotExist:
            raise NotFoundError("This share code is not valid.") from None

        # Check expiry.
        if provider.expires_at and provider.expires_at < timezone.now():
            provider.status = CareProvider.Status.EXPIRED
            provider.save(update_fields=["status"])
            raise NotFoundError("This share link has expired.")

        if provider.status in (CareProvider.Status.REVOKED, CareProvider.Status.EXPIRED):
            raise NotFoundError("This share link is no longer active.")

        # Verify PIN if required, with a per-share lockout after repeated misses.
        if provider.pin_enabled:
            key = _pin_fail_key(provider.id)
            failures = cache.get(key, 0)
            if failures >= PIN_MAX_FAILURES:
                raise BusinessRuleError(
                    "Too many wrong PINs for this code. Try again in 15 minutes, "
                    "or ask the record owner to reset the PIN."
                )
            if not provider.verify_pin(pin or ""):
                cache.set(key, failures + 1, PIN_LOCKOUT_SECONDS)
                left = PIN_MAX_FAILURES - failures - 1
                raise BusinessRuleError(
                    "Incorrect PIN." if left > 0 else
                    "Incorrect PIN. This code is now locked for 15 minutes."
                )
            cache.delete(key)

        # Mark as active and record access time on first open.
        provider._first_open = provider.last_accessed_at is None
        if provider.status == CareProvider.Status.PENDING:
            provider.status = CareProvider.Status.ACTIVE
        provider.last_accessed_at = timezone.now()
        provider.save(update_fields=["status", "last_accessed_at"])
        logger.info(
            "Provider share accessed: provider=%s owner=%s",
            provider.id,
            provider.owner_id,
        )
        return provider

    @staticmethod
    def compile_scoped_record(provider: CareProvider) -> dict[str, Any]:
        """
        Build the scoped record view for the given provider.

        Only the scopes listed in provider.scopes are included in the response.
        This is the only place where the scope restriction is enforced.
        """
        from apps.profiles.serializers import HealthProfileReadSerializer
        from apps.records.serializers import (
            AllergyReadSerializer,
            AppointmentReadSerializer,
            ConditionReadSerializer,
            HealthDocumentReadSerializer,
            ImmunizationReadSerializer,
            MedicationReadSerializer,
            VitalReadingReadSerializer,
        )

        owner = provider.owner
        scopes = set(provider.scopes)
        result: dict[str, Any] = {}

        if "profile" in scopes:
            try:
                result["profile"] = HealthProfileReadSerializer(
                    owner.health_profile
                ).data
            except Exception:
                result["profile"] = None

        if "allergies" in scopes:
            result["allergies"] = AllergyReadSerializer(
                owner.allergies.all(), many=True
            ).data

        if "medications" in scopes:
            result["medications"] = MedicationReadSerializer(
                owner.medications.all(), many=True
            ).data

        if "conditions" in scopes:
            result["conditions"] = ConditionReadSerializer(
                owner.conditions.all(), many=True
            ).data

        if "measurements" in scopes:
            result["vitals"] = VitalReadingReadSerializer(
                owner.vital_readings.all(), many=True
            ).data

        if "appointments" in scopes:
            result["appointments"] = AppointmentReadSerializer(
                owner.appointments.all(), many=True
            ).data

        if "documents" in scopes:
            result["documents"] = HealthDocumentReadSerializer(
                owner.health_documents.all(), many=True
            ).data

        if "immunizations" in scopes:
            result["immunizations"] = ImmunizationReadSerializer(
                owner.immunizations.all(), many=True
            ).data

        return result
