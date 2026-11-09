"""
Root URL configuration for myHealthLog.

All application endpoints live under /api/v1/.
Public emergency and provider access endpoints are unauthenticated.
"""

from apps.core.views import health_check
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)

urlpatterns = [
    path("admin/", admin.site.urls),

    # Health check — for load balancers and Docker healthchecks.
    path("api/health/", health_check, name="health-check"),

    # OpenAPI schema & interactive docs.
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path(
        "api/docs/",
        SpectacularSwaggerView.as_view(url_name="schema"),
        name="swagger-ui",
    ),
    path(
        "api/redoc/",
        SpectacularRedocView.as_view(url_name="schema"),
        name="redoc",
    ),

    # -----------------------------------------------------------------------
    # Authenticated API — all behind /api/v1/
    # -----------------------------------------------------------------------
    path(
        "api/v1/",
        include(
            [
                path("auth/", include("apps.accounts.urls")),
                path("profile/", include("apps.profiles.urls")),
                path("records/", include("apps.records.urls")),
                path("sharing/", include("apps.sharing.urls")),
                path("emergency/", include("apps.emergency.urls")),
                path("copilot/", include("apps.copilot.urls")),
                path("export/", include("apps.fhir.urls")),
                path("contexts/", include("apps.contexts.urls")),
                path("notifications/", include("apps.notifications.urls")),
            ]
        ),
    ),
]

# Serve profile photos in development through Django (Nginx handles it in
# production). Health documents are deliberately NOT served from /media/: they
# go through the signed /api/v1/records/files/<token>/ view only.
if settings.DEBUG:
    urlpatterns += static(
        f"{settings.MEDIA_URL}profile_photos/",
        document_root=settings.MEDIA_ROOT / "profile_photos",
    )
    import debug_toolbar

    urlpatterns += [path("__debug__/", include(debug_toolbar.urls))]
