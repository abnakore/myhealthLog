"""
Shared utility functions for myHealthLog.
"""

import hashlib
import os
import uuid
from typing import Any


def get_client_ip(request) -> str:
    """
    Extract the real client IP from a Django request.

    Reads X-Forwarded-For first (set by Nginx / any proxy), falls back to
    REMOTE_ADDR.  Never trust the full XFF chain blindly — only the first
    address is used, which is the actual client when a single trusted proxy
    (our Nginx) is in front.
    """
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "")


def upload_to_health_documents(instance: Any, filename: str) -> str:
    """
    Build a safe, namespaced upload path for health documents.

    Pattern: health_documents/<user_id>/<uuid><ext>
    The original filename is never used — prevents path-traversal and
    collision; the uuid makes the path unguessable.
    """
    ext = os.path.splitext(filename)[1].lower()
    safe_name = f"{uuid.uuid4().hex}{ext}"
    user_id = getattr(instance, "user_id", "unknown")
    return f"health_documents/{user_id}/{safe_name}"


def upload_to_profile_photos(instance: Any, filename: str) -> str:
    """Upload path for profile photos."""
    ext = os.path.splitext(filename)[1].lower()
    safe_name = f"{uuid.uuid4().hex}{ext}"
    user_id = getattr(instance, "user_id", "unknown")
    return f"profile_photos/{user_id}/{safe_name}"


def hash_token(token: str) -> str:
    """
    One-way hash a share code or emergency token for safe storage.

    Share codes and emergency tokens are stored as SHA-256 hashes so a
    database breach does not expose live codes.  The raw code is given to
    the user once and never persisted.
    """
    return hashlib.sha256(token.encode()).hexdigest()


def generate_share_code() -> str:
    """
    Mint a share code in the format MHL-XXXX-XXXX.

    Uses a character set that avoids visually ambiguous characters (0/O, 1/I/L)
    to make the code easy to type from a printed card.
    """
    chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
    def block(n):
        return "".join(chars[int.from_bytes(os.urandom(1), "big") % len(chars)] for _ in range(n))
    return f"MHL-{block(4)}-{block(4)}"


def generate_emergency_token() -> str:
    """
    Mint an emergency token in the format eznk-xxxx-xxxx.

    Lowercase and opaque to match the frontend's style.
    """
    return f"eznk-{uuid.uuid4().hex[:4]}-{uuid.uuid4().hex[:4]}"
