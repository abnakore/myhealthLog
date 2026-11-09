"""
FHIR export and clinical summary views.

GET /api/v1/export/fhir/    — download full record as FHIR R4 JSON Bundle
GET /api/v1/export/summary/ — download print-ready clinical HTML summary
"""

import json
import logging
from datetime import date

from django.http import HttpResponse
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from .builders import build_fhir_bundle
from .html_summary import build_html_summary

logger = logging.getLogger(__name__)


class FHIRBundleExportView(APIView):
    """
    GET /api/v1/export/fhir/

    Download the authenticated user's complete health record as an HL7 FHIR
    R4 Collection Bundle (.json).

    The file is streamed as an attachment so the browser opens a Save dialog.
    No data is stored; the bundle is compiled on the fly from the live database.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        bundle = build_fhir_bundle(request.user)
        json_bytes = json.dumps(bundle, default=str, indent=2).encode("utf-8")
        filename = f"myhealthlog-fhir-{date.today().isoformat()}.json"
        logger.info("FHIR bundle exported for user %s", request.user.id)
        response = HttpResponse(json_bytes, content_type="application/fhir+json")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        response["Content-Length"] = len(json_bytes)
        return response


class ClinicalSummaryExportView(APIView):
    """
    GET /api/v1/export/summary/

    Download a self-contained, print-ready clinical HTML summary.
    Designed to be printed and handed to a clinician in 60 seconds.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        html = build_html_summary(request.user)
        html_bytes = html.encode("utf-8")
        filename = f"myhealthlog-summary-{date.today().isoformat()}.html"
        logger.info("Clinical summary exported for user %s", request.user.id)
        response = HttpResponse(html_bytes, content_type="text/html; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        response["Content-Length"] = len(html_bytes)
        return response
