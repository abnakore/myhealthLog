"""
notify() — the one function that creates notifications.

Every part of the system (signals, views, tasks) calls this helper.
It never raises: a failure to create a notification must never break
the primary operation that triggered it.
"""

import logging
from typing import Any

logger = logging.getLogger(__name__)


def notify(
    user,
    kind: str,
    title: str,
    body: str = "",
    data: dict[str, Any] | None = None,
) -> None:
    """
    Create a notification for `user`.

    Args:
        user: A User instance or user id.
        kind: One of Notification.Kind values.
        title: Short headline shown in the bell panel.
        body: One-sentence detail (optional).
        data: Dict of extra context for the frontend (optional).

    This function is deliberately fire-and-forget — it logs but never
    raises, so a notification failure can never break the calling operation.
    """
    try:
        from .models import Notification

        Notification.objects.create(
            user=user,
            kind=kind,
            title=title,
            body=body,
            data=data or {},
        )
    except Exception:
        logger.exception(
            "Failed to create notification (kind=%s) for user %s",
            kind,
            getattr(user, "id", user),
        )
