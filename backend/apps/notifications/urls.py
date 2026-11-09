from django.urls import path

from .views import (
    MarkAllReadView,
    NotificationDetailView,
    NotificationListView,
    UnreadCountView,
)

urlpatterns = [
    path("", NotificationListView.as_view(), name="notification-list"),
    path("read-all/", MarkAllReadView.as_view(), name="notification-read-all"),
    path("unread-count/", UnreadCountView.as_view(), name="notification-unread-count"),
    path("<int:pk>/", NotificationDetailView.as_view(), name="notification-detail"),
]
