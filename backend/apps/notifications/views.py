"""
Notification endpoints.

GET    /api/v1/notifications/            — list the user's notifications (newest first)
POST   /api/v1/notifications/read-all/   — mark every notification as read
PATCH  /api/v1/notifications/<id>/       — mark one as read
DELETE /api/v1/notifications/<id>/       — dismiss (hard-delete) one
DELETE /api/v1/notifications/            — dismiss ALL (clear all)
GET    /api/v1/notifications/unread-count/ — fast unread badge count
"""

import logging

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.pagination import StandardResultsSetPagination

from .models import Notification
from .serializers import NotificationSerializer

logger = logging.getLogger(__name__)


class NotificationListView(APIView):
    """
    GET  — return the authenticated user's notifications, newest first.
    DELETE — clear (hard-delete) ALL notifications at once.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = (
            Notification.objects.filter(user=request.user)
            .order_by("-created_at")
        )
        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response(
            NotificationSerializer(page, many=True).data
        )

    def delete(self, request):
        deleted, _ = Notification.objects.filter(user=request.user).delete()
        logger.info("Cleared %d notifications for user %s", deleted, request.user.id)
        return Response(status=status.HTTP_204_NO_CONTENT)


class NotificationDetailView(APIView):
    """
    PATCH  — mark one notification as read.
    DELETE — dismiss (hard-delete) one notification.
    """

    permission_classes = [IsAuthenticated]

    def _get(self, user, pk):
        try:
            return Notification.objects.get(pk=pk, user=user)
        except Notification.DoesNotExist:
            from rest_framework.exceptions import NotFound
            raise NotFound() from None

    def patch(self, request, pk):
        notif = self._get(request.user, pk)
        notif.is_read = True
        notif.save(update_fields=["is_read"])
        return Response(NotificationSerializer(notif).data)

    def delete(self, request, pk):
        notif = self._get(request.user, pk)
        notif.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MarkAllReadView(APIView):
    """
    POST /api/v1/notifications/read-all/
    Mark every unread notification as read.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        updated = Notification.objects.filter(
            user=request.user, is_read=False
        ).update(is_read=True)
        logger.info(
            "Marked %d notifications as read for user %s", updated, request.user.id
        )
        return Response({"marked_read": updated})


class UnreadCountView(APIView):
    """
    GET /api/v1/notifications/unread-count/
    Returns just { "count": <int> } — used for the bell badge.
    Lightweight: no pagination, no serializer overhead.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        count = Notification.objects.filter(
            user=request.user, is_read=False
        ).count()
        return Response({"count": count})
