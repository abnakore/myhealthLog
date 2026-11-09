"""
Custom exceptions and the global DRF exception handler for myHealthLog.

Every error response produced by this backend has exactly the same shape:

    {
        "error": {
            "code":       "<machine-readable string>",
            "message":    "<human-readable explanation>",
            "details":    { "<field>": ["<msg>"] } | null,
            "request_id": "<uuid>"
        }
    }

This contract is stable across all endpoints so the frontend never has to
special-case individual status codes — it reads error.code and error.details.
"""

import logging
import uuid

from django.core.exceptions import PermissionDenied
from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import Http404
from rest_framework import status
from rest_framework.exceptions import (
    APIException,
)
from rest_framework.exceptions import (
    PermissionDenied as DRFPermissionDenied,
)
from rest_framework.exceptions import (
    ValidationError as DRFValidationError,
)
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Domain-specific exception types
# ---------------------------------------------------------------------------


class BusinessRuleError(APIException):
    """
    Raised when a business rule is violated (e.g. revoking an already-revoked
    share, placing an empty order, creating a duplicate emergency token).

    Results in HTTP 400 with code "business_rule_error".
    """

    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = "A business rule was violated."
    default_code = "business_rule_error"


class NotFoundError(APIException):
    """Resource does not exist or the caller is not allowed to know it exists."""

    status_code = status.HTTP_404_NOT_FOUND
    default_detail = "Not found."
    default_code = "not_found"


class ConflictError(APIException):
    """Resource already exists in the requested state."""

    status_code = status.HTTP_409_CONFLICT
    default_detail = "Conflict."
    default_code = "conflict"


class ServiceUnavailableError(APIException):
    """An upstream service (Gemini, Redis) is temporarily unavailable."""

    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = "An upstream service is temporarily unavailable."
    default_code = "service_unavailable"


class AIProcessingError(APIException):
    """The AI service returned an unusable response."""

    status_code = status.HTTP_502_BAD_GATEWAY
    default_detail = "The AI service returned an unexpected response. Please try again."
    default_code = "ai_processing_error"


# ---------------------------------------------------------------------------
# Global exception handler
# ---------------------------------------------------------------------------


def custom_exception_handler(exc, context):
    """
    Wrap every error in the consistent envelope above.

    Algorithm:
      1. Convert Django-layer exceptions (Http404, PermissionDenied,
         DjangoValidationError) into their DRF equivalents so drf_exception_handler
         produces a Response.
      2. Call the default DRF handler — it handles all APIException subclasses.
      3. If the default handler returned None (unhandled exception), build a 500
         response and log the full stack trace.
      4. Reformat the data dict into our standard envelope.
    """
    request = context.get("request")
    request_id: str = getattr(request, "request_id", str(uuid.uuid4()))

    # --- Step 1: Normalise Django exceptions into DRF ones ------------------
    if isinstance(exc, DjangoValidationError):
        exc = DRFValidationError(
            detail=exc.message_dict if hasattr(exc, "message_dict") else exc.messages
        )
    elif isinstance(exc, Http404):
        exc = NotFoundError()
    elif isinstance(exc, PermissionDenied):
        exc = DRFPermissionDenied()

    # --- Step 2: Standard DRF handling --------------------------------------
    response = drf_exception_handler(exc, context)

    # --- Step 3: Unhandled exception ----------------------------------------
    if response is None:
        logger.exception(
            "Unhandled exception",
            extra={"request_id": request_id},
        )
        return Response(
            {
                "error": {
                    "code": "server_error",
                    "message": "An unexpected error occurred. Please try again later.",
                    "details": None,
                    "request_id": request_id,
                }
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    # --- Step 4: Reformat into standard envelope ----------------------------
    data = response.data
    code = getattr(exc, "default_code", "error")

    if isinstance(data, dict) and "detail" in data and len(data) == 1:
        # Simple message — e.g. "Authentication credentials were not provided."
        message = str(data["detail"])
        details = None
    elif isinstance(data, dict):
        # Field-level validation errors
        message = "One or more fields are invalid."
        details = data
        code = getattr(exc, "default_code", "validation_error")
    else:
        message = str(data)
        details = None

    response.data = {
        "error": {
            "code": code,
            "message": message,
            "details": details,
            "request_id": request_id,
        }
    }
    return response
