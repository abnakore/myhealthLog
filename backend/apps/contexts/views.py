from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from apps.core.pagination import StandardResultsSetPagination
from apps.sharing.proxy import resolve_active_owner

from .models import HealthContext
from .serializers import HealthContextSerializer


class HealthContextViewSet(viewsets.ModelViewSet):
    """
    CRUD for health contexts (condition-aware profile lenses).

    list:     GET  /api/v1/contexts/
    create:   POST /api/v1/contexts/
    retrieve: GET  /api/v1/contexts/<id>/
    update:   PUT  /api/v1/contexts/<id>/
    partial_update: PATCH /api/v1/contexts/<id>/
    destroy:  DELETE /api/v1/contexts/<id>/
    """

    permission_classes = [IsAuthenticated]
    serializer_class = HealthContextSerializer
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        return HealthContext.objects.filter(
            user=resolve_active_owner(self.request)
        )

    def create(self, request, *args, **kwargs):
        resolve_active_owner(request, require_write=True)
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        resolve_active_owner(request, require_write=True)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        resolve_active_owner(request, require_write=True)
        return super().destroy(request, *args, **kwargs)

    def perform_create(self, serializer):
        owner = resolve_active_owner(self.request, require_write=True)
        serializer.save(user=owner)
        self._notify(owner, "added a condition profile")

    def perform_update(self, serializer):
        owner = resolve_active_owner(self.request, require_write=True)
        serializer.save()
        self._notify(owner, "changed a condition profile")

    def perform_destroy(self, instance):
        owner = resolve_active_owner(self.request, require_write=True)
        instance.delete()
        self._notify(owner, "removed a condition profile")

    def _notify(self, owner, what: str) -> None:
        """Tell the owner when their care proxy changed a profile."""
        actor = self.request.user
        if owner.id == actor.id:
            return
        try:
            from apps.notifications.models import Notification
            from apps.notifications.utils import notify

            actor_name = actor.name or actor.email
            notify(
                user=owner,
                kind=Notification.Kind.RECORD_UPDATED,
                title=f"{actor_name} {what}",
                body=f"{actor_name} (your care proxy) {what} in your record.",
                data={"link": "/app/contexts", "changed_by": actor_name, "by_proxy": True},
            )
        except Exception:
            pass
