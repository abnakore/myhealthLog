from django.urls import path

from .views import (
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
]
