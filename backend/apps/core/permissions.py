"""
Custom permission classes for myHealthLog.

IsOwner and IsOwnerOrReadOnly check that the request user owns the object.
They look for a `user` or `owner` FK on the object — the naming convention
used across all health record models.

The care-proxy layer is handled at the view level, not here: a proxy's writes
are stamped with their own identity, but they write to the owner's record,
which means the owner FK is checked against the *active owner* (not self).
"""

from rest_framework import permissions


class IsOwner(permissions.BasePermission):
    """
    Object-level: the user must be the owner of the record.

    Checks obj.user or obj.owner for the authenticated user.
    """

    def has_object_permission(self, request, view, obj) -> bool:
        owner = getattr(obj, "user", None) or getattr(obj, "owner", None)
        return owner == request.user


class IsOwnerOrReadOnly(permissions.BasePermission):
    """
    Object-level: read access for everyone authenticated; write only for owner.
    """

    def has_object_permission(self, request, view, obj) -> bool:
        if request.method in permissions.SAFE_METHODS:
            return True
        owner = getattr(obj, "user", None) or getattr(obj, "owner", None)
        return owner == request.user


class IsStaff(permissions.BasePermission):
    """View-level: user must be staff."""

    def has_permission(self, request, view) -> bool:
        return bool(request.user and request.user.is_authenticated and request.user.is_staff)


class ReadOnly(permissions.BasePermission):
    """View-level: only safe HTTP methods are allowed."""

    def has_permission(self, request, view) -> bool:
        return request.method in permissions.SAFE_METHODS


class AllowAny(permissions.AllowAny):
    """Re-export for convenience — identical to DRF's AllowAny."""
