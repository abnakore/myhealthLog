from django.urls import path

from .views import ClinicalSummaryExportView, FHIRBundleExportView

urlpatterns = [
    path("fhir/", FHIRBundleExportView.as_view(), name="export-fhir"),
    path("summary/", ClinicalSummaryExportView.as_view(), name="export-summary"),
]
