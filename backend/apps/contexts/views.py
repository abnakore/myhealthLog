from rest_framework import serializers, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

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


class CareFocusView(APIView):
    """
    The person's care focus: several conditions and life stages at once, ranked.

    GET /api/v1/contexts/focus/  -> {"focus": [refs], "ranked": [ranked items]}
    PUT /api/v1/contexts/focus/  body {"focus": [{"kind": "pregnancy"}, {"kind": "condition", "id": "..."}]}
    """

    permission_classes = [IsAuthenticated]

    @staticmethod
    def _profile(owner):
        from apps.profiles.models import HealthProfile

        profile, _ = HealthProfile.objects.get_or_create(user=owner, defaults={"full_name": owner.name or ""})
        return profile

    def _payload(self, owner, profile):
        from .focus import ranked_focus

        return {"focus": profile.care_focus or [], "ranked": ranked_focus(owner, profile.care_focus or [])}

    def get(self, request):
        owner = resolve_active_owner(request)
        return Response(self._payload(owner, self._profile(owner)))

    def put(self, request):
        from .focus import clean_focus

        owner = resolve_active_owner(request, require_write=True)
        try:
            focus = clean_focus(request.data.get("focus"))
        except ValueError as exc:
            raise serializers.ValidationError({"focus": str(exc)}) from exc
        own_ids = {str(i) for i in owner.conditions.values_list("id", flat=True)}
        if any(f["kind"] == "condition" and f["id"] not in own_ids for f in focus):
            raise serializers.ValidationError({"focus": "That condition is not in this record."})
        profile = self._profile(owner)
        profile.care_focus = focus
        profile.save(update_fields=["care_focus", "updated_at"])
        return Response(self._payload(owner, profile))
