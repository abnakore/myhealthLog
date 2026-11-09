"""
Care-proxy acting context.

A care proxy does not have a separate set of records. When they step into the
owner's record the frontend sends the owner's user id in the `X-Act-As-User`
header; every record endpoint resolves that header here, checks the live grant,
and then reads/writes the owner's data instead of the actor's.

Rules enforced in this one place:
  - No header (or the actor's own id) => the actor's own record.
  - ACTIVE grant addressed to this account => the owner's record.
  - VIEW grants may read only; FULL grants may also write.
  - Any other target is refused, so a header can never widen access.
"""

from django.core.exceptions import ValidationError
from rest_framework.exceptions import PermissionDenied

ACT_AS_HEADER = "X-Act-As-User"


def resolve_active_owner(request, *, require_write: bool = False):
    """
    Return the user whose record this request is about.

    Raises PermissionDenied when the header names a record the actor has no
    live grant for, or when a write is attempted with view-only access.
    """
    actor = request.user
    target = (request.META.get("HTTP_X_ACT_AS_USER") or "").strip()

    if not target or target == str(actor.id):
        request.proxy_grant = None
        request.active_owner = actor
        return actor

    from .models import CareProxyGrant

    try:
        grant = (
            CareProxyGrant.objects.filter(
                owner_id=target,
                status=CareProxyGrant.Status.ACTIVE,
            )
            .filter(proxy_user=actor)
            .select_related("owner")
            .first()
        )
        if grant is None:
            # Grants created before the invitee had an account are linked by
            # the email the invitation went to.
            grant = (
                CareProxyGrant.objects.filter(
                    owner_id=target,
                    status=CareProxyGrant.Status.ACTIVE,
                    proxy_email__iexact=actor.email,
                )
                .select_related("owner")
                .first()
            )
    except (ValidationError, ValueError):
        raise PermissionDenied("That record could not be found.") from None

    if grant is None:
        raise PermissionDenied("You do not have access to that record.")

    if require_write and grant.permission != CareProxyGrant.Permission.FULL:
        raise PermissionDenied(
            "Your access to that record is view only, so it cannot be changed."
        )

    request.proxy_grant = grant
    request.active_owner = grant.owner
    return grant.owner


def acting_for_another(request, owner) -> bool:
    """True when the request is writing to someone else's record."""
    return owner is not None and getattr(owner, "id", None) != getattr(request.user, "id", None)
