from django.urls import path

from .views import (
    AIDynamicSummaryInvalidateView,
    AIDynamicSummaryView,
    EmergencyCardView,
    EmergencyPinVerifyView,
)

urlpatterns = [
    # Public token resolution
    path("card/<str:token>/", EmergencyCardView.as_view(), name="emergency-card"),
    path(
        "card/<str:token>/verify-pin/",
        EmergencyPinVerifyView.as_view(),
        name="emergency-verify-pin",
    ),
    # Authenticated AI summary
    path(
        "dynamic-ai-summary/",
        AIDynamicSummaryView.as_view(),
        name="emergency-ai-summary",
    ),
    path(
        "dynamic-ai-summary/invalidate/",
        AIDynamicSummaryInvalidateView.as_view(),
        name="emergency-ai-summary-invalidate",
    ),
]
