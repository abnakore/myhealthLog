"""
Reusable field-level validators for myHealthLog.

All validators follow Django's convention: raise ValidationError on failure,
return None on success.  They can be used on model fields and serializer fields
interchangeably.
"""

import logging
import os
from typing import Any

from django.conf import settings
from django.core.exceptions import ValidationError

logger = logging.getLogger(__name__)


def validate_file_size(file: Any) -> None:
    """
    Reject files larger than MAX_UPLOAD_SIZE_BYTES (default 15 MB).

    Used on every FileField / ImageField in the project to prevent
    denial-of-service through large upload payloads.
    """
    max_bytes: int = getattr(settings, "MAX_UPLOAD_SIZE_BYTES", 15 * 1024 * 1024)
    if hasattr(file, "size") and file.size > max_bytes:
        max_mb = max_bytes / (1024 * 1024)
        raise ValidationError(
            f"File size {file.size / (1024 * 1024):.1f} MB exceeds "
            f"the {max_mb:.0f} MB limit."
        )


def validate_document_extension(file: Any) -> None:
    """
    Restrict uploads to the allowlist in settings.ALLOWED_DOCUMENT_EXTENSIONS.

    Health records accept: pdf, jpg, jpeg, png, gif, webp, docx.
    Note: extension checks are a first-pass defence; MIME-type checks at the
    service layer provide the second (deeper) pass.
    """
    if not hasattr(file, "name"):
        return
    ext = os.path.splitext(file.name)[1].lower().lstrip(".")
    allowed: list[str] = getattr(
        settings, "ALLOWED_DOCUMENT_EXTENSIONS", ["pdf", "jpg", "jpeg", "png", "gif", "webp", "docx"]
    )
    if ext not in allowed:
        raise ValidationError(
            f"File type .{ext} is not accepted. "
            f"Allowed types: {', '.join(allowed)}."
        )


# What each allowed extension must really contain (checked from the bytes, not
# the name or the browser-supplied Content-Type, both of which a client controls).
_ALLOWED_CONTENT = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/zip",  # older libmagic reports .docx as a zip container
}


def sniff_mime(file: Any) -> str:
    """The file's real MIME type, read from its first bytes."""
    try:
        import magic
    except ImportError:  # pragma: no cover - libmagic is in the image
        return getattr(file, "content_type", "") or ""
    pos = file.tell() if hasattr(file, "tell") else 0
    head = file.read(4096)
    try:
        file.seek(pos)
    except Exception:
        pass
    return magic.from_buffer(head, mime=True) or ""


def validate_document_content(file: Any) -> None:
    """Reject a file whose bytes are not an allowed document type (e.g. a renamed .exe)."""
    if not hasattr(file, "read"):
        return
    mime = sniff_mime(file)
    if mime and mime not in _ALLOWED_CONTENT:
        raise ValidationError(
            "This file's contents aren't a PDF, image or Word document, so it can't be uploaded."
        )


def validate_image_extension(file: Any) -> None:
    """Restrict to image-only uploads (profile photos, etc.)."""
    if not hasattr(file, "name"):
        return
    ext = os.path.splitext(file.name)[1].lower().lstrip(".")
    allowed: list[str] = getattr(
        settings, "ALLOWED_IMAGE_EXTENSIONS", ["jpg", "jpeg", "png", "gif", "webp"]
    )
    if ext not in allowed:
        raise ValidationError(
            f"File type .{ext} is not accepted for images. "
            f"Allowed types: {', '.join(allowed)}."
        )


def validate_pin(value: str) -> None:
    """
    Emergency card and share code PINs must be 4-8 digits.

    A wider range (up to 8) is supported so users who prefer longer PINs
    are not penalised, while remaining short enough to remember.
    """
    if value and (not value.isdigit() or not (4 <= len(value) <= 8)):
        raise ValidationError("PIN must be 4 to 8 digits.")


def validate_icd10_code(value: str) -> None:
    """
    Loose ICD-10 format check: letter + 2 digits, optional dot and up to 4 more chars.
    Examples: E11, E11.9, J45.909, Z87.891
    Rejects obviously wrong values while accepting the full ICD-10-CM range.
    """
    import re

    if value and not re.match(r"^[A-Z][0-9]{2}(\.[A-Z0-9]{1,4})?$", value.upper()):
        raise ValidationError(
            "Enter a valid ICD-10 code (e.g. E11, E11.9, J45.909)."
        )


def validate_future_date(value) -> None:
    """Reject dates in the future — onset dates, birth dates, etc. must be past."""
    from django.utils import timezone

    if value and value > timezone.now().date():
        raise ValidationError("This date cannot be in the future.")
