"""
Private file delivery for health records.

Uploaded files are never reachable at a public /media/ path. Every file URL
the API hands out is

    /api/v1/records/files/<signed token>/

where the token is signed with SECRET_KEY, names one record and one file field,
and expires after FILE_URL_MAX_AGE seconds. The view re-loads the record (so a
deleted record's file stops being served at once) and then either streams the
file itself or, behind Nginx, hands the transfer to Nginx with X-Accel-Redirect
so large files never tie up a Django worker.

Signed URLs (rather than an Authorization header) are needed because the
browser loads previews through <img> and <iframe>, which cannot send headers.
"""

import mimetypes
import os
from urllib.parse import quote

from django.apps import apps as django_apps
from django.conf import settings
from django.core import signing
from django.http import FileResponse, Http404, HttpResponse
from django.urls import reverse

_SALT = "mhl.records.file"


def _max_age() -> int:
    return getattr(settings, "FILE_URL_MAX_AGE", 6 * 60 * 60)


def signed_file_url(obj, field_name: str = "document_file") -> str:
    token = signing.dumps(
        {"m": obj._meta.label, "id": str(obj.pk), "f": field_name},
        salt=_SALT,
        compress=True,
    )
    return reverse("record-file", kwargs={"token": token})


def _display_name(obj, file_field) -> str:
    for attr in ("file_name", "document_file_name"):
        value = getattr(obj, attr, "")
        if value:
            return value
    return os.path.basename(file_field.name)


def serve_signed_file(request, token: str):
    try:
        payload = signing.loads(token, salt=_SALT, max_age=_max_age())
        model = django_apps.get_model(payload["m"])
        field_name = payload["f"]
    except (signing.BadSignature, signing.SignatureExpired, KeyError, LookupError, ValueError):
        raise Http404("This file link is invalid or has expired.") from None

    # Default manager hides soft-deleted records: a removed record's file is gone.
    obj = model.objects.filter(pk=payload.get("id")).first()
    file_field = getattr(obj, field_name, None) if obj is not None else None
    if not file_field:
        raise Http404("File not found.")

    name = _display_name(obj, file_field)
    content_type = (
        getattr(obj, "mime_type", "")
        or getattr(obj, "document_mime_type", "")
        or mimetypes.guess_type(name)[0]
        or "application/octet-stream"
    )
    disposition = "attachment" if request.GET.get("download") else "inline"
    disposition_header = f"{disposition}; filename*=UTF-8''{quote(name)}"

    accel_prefix = getattr(settings, "FILE_X_ACCEL_PREFIX", "")
    if accel_prefix:
        response = HttpResponse(content_type=content_type)
        response["X-Accel-Redirect"] = f"{accel_prefix.rstrip('/')}/{file_field.name}"
    else:
        response = FileResponse(file_field.open("rb"), content_type=content_type)

    response["Content-Disposition"] = disposition_header
    response["Cache-Control"] = "private, no-store"
    response["X-Content-Type-Options"] = "nosniff"
    # A served file may be opened in a tab; never let it run script.
    response["Content-Security-Policy"] = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox"
    return response
