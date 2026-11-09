"""
URL patterns for the sharing app.
All paths prefixed by /api/v1/sharing/ in config/urls.py.
"""

from django.urls import path

from .views import (
    CareProviderDetailView,
    CareProviderListView,
    CareProxyGrantDetailView,
    CareProxyGrantListView,
    EmergencySettingsView,
    EmergencyTokenRegenerateView,
    ProviderAccessView,
    ProviderNoteView,
    ProviderRecordSaveView,
)

# ---------------------------------------------------------------------------
# Proxy grant action view — thin wrapper that dispatches POST to the right method
# ---------------------------------------------------------------------------

class _ProxyActionView(CareProxyGrantDetailView):
    """Routes POST /<pk>/revoke|accept|decline/ to the matching method."""

    def post(self, request, pk, action=None):
        dispatch = {
            "revoke": self.revoke,
            "accept": self.accept,
            "decline": self.decline,
            "resend": self.resend,
        }
        handler = dispatch.get(action)
        if handler is None:
            from rest_framework import status as drf_status
            from rest_framework.response import Response
            return Response(status=drf_status.HTTP_404_NOT_FOUND)
        return handler(request, pk)


urlpatterns = [
    # -----------------------------------------------------------------------
    # Care providers (share links)
    # -----------------------------------------------------------------------
    path("providers/", CareProviderListView.as_view(), name="sharing-providers"),
    path(
        "providers/<uuid:pk>/",
        CareProviderDetailView.as_view(),
        name="sharing-provider-detail",
    ),
    path(
        "providers/<uuid:pk>/revoke/",
        # Reuse DetailView.post which is the revoke action
        CareProviderDetailView.as_view(),
        name="sharing-provider-revoke",
    ),

    # -----------------------------------------------------------------------
    # Emergency card settings
    # -----------------------------------------------------------------------
    path("emergency/", EmergencySettingsView.as_view(), name="sharing-emergency"),
    path(
        "emergency/regenerate/",
        EmergencyTokenRegenerateView.as_view(),
        name="sharing-emergency-regenerate",
    ),

    # -----------------------------------------------------------------------
    # Care proxy grants
    # -----------------------------------------------------------------------
    path("proxies/", CareProxyGrantListView.as_view(), name="sharing-proxies"),
    path(
        "proxies/<uuid:pk>/",
        _ProxyActionView.as_view(),
        name="sharing-proxy-detail",
    ),
    path(
        "proxies/<uuid:pk>/revoke/",
        _ProxyActionView.as_view(),
        {"action": "revoke"},
        name="sharing-proxy-revoke",
    ),
    path(
        "proxies/<uuid:pk>/accept/",
        _ProxyActionView.as_view(),
        {"action": "accept"},
        name="sharing-proxy-accept",
    ),
    path(
        "proxies/<uuid:pk>/decline/",
        _ProxyActionView.as_view(),
        {"action": "decline"},
        name="sharing-proxy-decline",
    ),
    path(
        "proxies/<uuid:pk>/resend/",
        _ProxyActionView.as_view(),
        {"action": "resend"},
        name="sharing-proxy-resend",
    ),

    # -----------------------------------------------------------------------
    # Unauthenticated: provider opens a share link
    # -----------------------------------------------------------------------
    path("provider-access/", ProviderAccessView.as_view(), name="sharing-provider-access"),
    path("provider-access/note/", ProviderNoteView.as_view(), name="sharing-provider-note"),
    path(
        "provider-access/records/",
        ProviderRecordSaveView.as_view(),
        name="sharing-provider-record-save",
    ),
]
