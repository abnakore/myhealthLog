"""
URL patterns for all health record types.
All paths are prefixed by /api/v1/records/ in config/urls.py.
"""

from django.urls import include, path

from .files import serve_signed_file
from rest_framework.routers import DefaultRouter

from .views import (
    AllergyViewSet,
    AppointmentViewSet,
    ConditionViewSet,
    HealthDocumentViewSet,
    ImmunizationViewSet,
    MedicationViewSet,
    ProcedureViewSet,
    VitalReadingViewSet,
)

router = DefaultRouter()
router.register(r"allergies", AllergyViewSet, basename="allergies")
router.register(r"medications", MedicationViewSet, basename="medications")
router.register(r"conditions", ConditionViewSet, basename="conditions")
router.register(r"appointments", AppointmentViewSet, basename="appointments")
router.register(r"documents", HealthDocumentViewSet, basename="documents")
router.register(r"procedures", ProcedureViewSet, basename="procedures")
router.register(r"immunizations", ImmunizationViewSet, basename="immunizations")
router.register(r"vitals", VitalReadingViewSet, basename="vitals")

urlpatterns = [
    # Signed, expiring file links — see apps/records/files.py.
    path("files/<str:token>/", serve_signed_file, name="record-file"),
    path("", include(router.urls)),
]
