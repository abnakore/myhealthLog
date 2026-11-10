"""
Celery tasks for health records.

extract_document_with_ai — Triggered after a HealthDocument is uploaded.
extract_attachment_with_ai — Triggered after any other record (medication,
  condition, allergy, appointment, reading) gets a supporting file.

Both read the file, send it to Gemini with a prompt that asks for one strict
JSON shape, validate that shape, and store it on the record. Both are
idempotent: re-running replaces the previous extraction.

The Gemini call has a hard timeout (see apps.core.ai), so a slow model can no
longer leave a record stuck in PROCESSING and a worker process blocked.
"""

import contextlib
import datetime
import logging
from typing import Any

from celery import shared_task
from django.apps import apps as django_apps
from django.conf import settings

logger = logging.getLogger(__name__)


EXTRACTION_PROMPT = """
You are a medical document analyser for a personal health record system.
The patient uploaded the attached file{context}.

Read the whole file carefully and extract every clinically relevant fact.
Return ONE JSON object with exactly these keys:

{{
  "document_type": "lab_result | prescription | scan | discharge_summary | other",
  "title": "short human-readable title, e.g. 'Full blood count — Lagos Lab'",
  "date": "YYYY-MM-DD of the test/visit, or null",
  "summary": "2-3 plain-English sentences: what this document is and what it shows. Mention anything abnormal first.",
  "key_findings": [
    {{"metric": "test or observation", "value": "value as written", "unit": "unit or empty string",
      "reference_range": "range as written or empty string", "status": "normal | low | high | critical | null"}}
  ],
  "medications_mentioned": [{{"name": "string", "dosage": "string", "frequency": "string"}}],
  "conditions_mentioned": ["condition name"],
  "follow_up": ["any instruction, referral or next step written on the document"],
  "provider": "clinic / lab / hospital name or null",
  "ordering_clinician": "name or null"
}}

Rules:
- Only report what is in the file. Never guess values. Use [] or null when absent.
- Judge "status" against the reference range printed on the document when one is given.
- List abnormal findings before normal ones.
- If the file is not a medical document or is unreadable, set document_type to "other",
  explain in "summary", and leave the lists empty.
Respond with the JSON object only.
"""

_LIST_KEYS = ("key_findings", "medications_mentioned", "conditions_mentioned", "follow_up")
_STATUS_ORDER = {"critical": 0, "high": 1, "low": 2, "normal": 4}


def normalise_extraction(raw: Any) -> dict[str, Any]:
    """
    Coerce the model's answer into the exact shape the frontend renders.

    Models occasionally wrap the object in a list, drop keys, or return a
    string where a list belongs; none of that may reach the UI.
    """
    if isinstance(raw, list) and raw and isinstance(raw[0], dict):
        raw = raw[0]
    if not isinstance(raw, dict):
        raise ValueError("Extraction is not a JSON object.")

    out: dict[str, Any] = {
        "document_type": str(raw.get("document_type") or "other"),
        "title": str(raw.get("title") or "").strip() or None,
        "date": raw.get("date") or None,
        "summary": str(raw.get("summary") or "").strip(),
        "provider": raw.get("provider") or None,
        "ordering_clinician": raw.get("ordering_clinician") or None,
    }
    for key in _LIST_KEYS:
        value = raw.get(key) or []
        if isinstance(value, (str, dict)):
            value = [value]
        out[key] = [v for v in value if v not in (None, "", {})]

    findings = []
    for f in out["key_findings"]:
        if isinstance(f, str):
            f = {"metric": f, "value": ""}
        if not isinstance(f, dict):
            continue
        status = (str(f.get("status") or "").lower() or None)
        if status not in _STATUS_ORDER:
            status = None
        findings.append(
            {
                "metric": str(f.get("metric") or "").strip(),
                "value": str(f.get("value") if f.get("value") is not None else "").strip(),
                "unit": str(f.get("unit") or "").strip(),
                "reference_range": str(f.get("reference_range") or "").strip(),
                "status": status,
            }
        )
    # Abnormal results first — the reader should never have to hunt for them.
    findings.sort(key=lambda f: _STATUS_ORDER.get(f["status"] or "", 3))
    out["key_findings"] = [f for f in findings if f["metric"]]

    meds = []
    for m in out["medications_mentioned"]:
        if isinstance(m, str):
            m = {"name": m}
        if isinstance(m, dict) and m.get("name"):
            meds.append(
                {
                    "name": str(m["name"]).strip(),
                    "dosage": str(m.get("dosage") or "").strip(),
                    "frequency": str(m.get("frequency") or "").strip(),
                }
            )
    out["medications_mentioned"] = meds
    out["conditions_mentioned"] = [str(c).strip() for c in out["conditions_mentioned"] if str(c).strip()]
    out["follow_up"] = [str(c).strip() for c in out["follow_up"] if str(c).strip()]

    if out["date"]:
        try:
            datetime.date.fromisoformat(str(out["date"])[:10])
            out["date"] = str(out["date"])[:10]
        except ValueError:
            out["date"] = None
    return out


def _run_extraction(file_field, mime_type: str, context: str = "") -> dict[str, Any]:
    from apps.core import ai

    file_field.open("rb")
    try:
        file_bytes = file_field.read()
    finally:
        file_field.close()

    prompt = EXTRACTION_PROMPT.format(context=context)
    raw = ai.generate_json(
        [{"role": "user", "parts": [{"text": prompt}, ai.file_part(file_bytes, mime_type)]}],
        timeout=getattr(settings, "GEMINI_TIMEOUT_SECONDS", 40) + 20,
    )
    return normalise_extraction(raw)


def _notify(user, ok: bool, record_type: str, record_id: str, name: str) -> None:
    try:
        from apps.notifications.models import Notification
        from apps.notifications.utils import notify

        notify(
            user=user,
            kind=Notification.Kind.DOCUMENT_EXTRACTED if ok else Notification.Kind.DOCUMENT_EXTRACT_FAILED,
            title=(f"Document processed: {name}" if ok else f"Document processing failed: {name}"),
            body=(
                "AI has read the attached file and pulled out the key information."
                if ok
                else "We could not read this file automatically. You can still open it and retry."
            ),
            data={"record_type": record_type, "record_id": record_id, "record_name": name},
        )
    except Exception:
        logger.exception("Failed to notify user about extraction of %s %s", record_type, record_id)


@shared_task(
    bind=True,
    acks_late=True,
    max_retries=2,
    soft_time_limit=240,
    time_limit=300,
    name="records.extract_document_with_ai",
)
def extract_document_with_ai(self, document_id: str) -> None:
    """Extract structured data from an uploaded HealthDocument."""
    from apps.core import ai
    from apps.records.models import HealthDocument

    doc = HealthDocument.objects.filter(pk=document_id).first()
    if doc is None:
        logger.warning("Document %s not found — skipping AI extraction.", document_id)
        return
    if not doc.document_file:
        doc.ai_extraction_status = "SKIPPED"
        doc.save(update_fields=["ai_extraction_status"])
        return
    if not ai.is_configured():
        doc.ai_extraction_status = "SKIPPED"
        doc.save(update_fields=["ai_extraction_status"])
        return

    doc.ai_extraction_status = "PROCESSING"
    doc.save(update_fields=["ai_extraction_status"])
    file_read = doc.document_file.name

    try:
        extracted = _run_extraction(doc.document_file, doc.mime_type, f" titled '{doc.title}'")
    except Exception as exc:
        if self.request.retries < self.max_retries:
            logger.warning("AI extraction for document %s failed, retrying: %s", document_id, exc)
            doc.ai_extraction_status = "PENDING"
            doc.save(update_fields=["ai_extraction_status"])
            raise self.retry(exc=exc, countdown=15 * (self.request.retries + 1)) from exc
        logger.exception("AI extraction failed for document %s", document_id)
        doc.ai_extraction_status = "FAILED"
        doc.save(update_fields=["ai_extraction_status"])
        _notify(doc.user, False, "document", str(doc.id), doc.title or "Document")
        return

    # The file may have been replaced or the record deleted while we read it.
    doc = HealthDocument.objects.filter(pk=document_id).first()
    if doc is None or doc.document_file.name != file_read:
        logger.info("Document %s changed during extraction — discarding result.", document_id)
        return
    doc.ai_extraction = extracted
    doc.ai_extraction_status = "DONE"
    if not doc.title and extracted.get("title"):
        doc.title = str(extracted["title"])[:255]
    if not doc.document_date and extracted.get("date"):
        with contextlib.suppress(ValueError, TypeError):
            doc.document_date = datetime.date.fromisoformat(extracted["date"])
    doc.save(update_fields=["ai_extraction", "ai_extraction_status", "title", "document_date"])
    logger.info("AI extraction complete for document %s", document_id)
    _notify(doc.user, True, "document", str(doc.id), doc.title or "Document")
    _review_after_extraction("document", str(doc.id))


# Record kinds that can carry an attachment, keyed by the frontend's record_type.
ATTACHMENT_MODELS = {
    "medication": "records.Medication",
    "condition": "records.Condition",
    "allergy": "records.Allergy",
    "appointment": "records.Appointment",
    "vital": "records.VitalReading",
}


@shared_task(
    bind=True,
    acks_late=True,
    max_retries=2,
    soft_time_limit=240,
    time_limit=300,
    name="records.extract_attachment_with_ai",
)
def extract_attachment_with_ai(self, record_type: str, record_id: str) -> None:
    """Extract structured data from the file attached to a non-document record."""
    from apps.core import ai
    from apps.records.views import _record_name

    label = ATTACHMENT_MODELS.get(record_type)
    if label is None:
        logger.warning("Unknown record type %s for attachment extraction.", record_type)
        return
    model = django_apps.get_model(label)
    record = model.objects.filter(pk=record_id).first()
    if record is None or not record.document_file:
        return
    if not ai.is_configured():
        record.ai_extraction_status = "SKIPPED"
        record.save(update_fields=["ai_extraction_status"])
        return

    record.ai_extraction_status = "PROCESSING"
    record.save(update_fields=["ai_extraction_status"])
    name = _record_name(record)
    file_read = record.document_file.name

    try:
        extracted = _run_extraction(
            record.document_file,
            record.document_mime_type,
            f" as supporting evidence for their {record_type} record '{name}'",
        )
    except Exception as exc:
        if self.request.retries < self.max_retries:
            record.ai_extraction_status = "PENDING"
            record.save(update_fields=["ai_extraction_status"])
            raise self.retry(exc=exc, countdown=15 * (self.request.retries + 1)) from exc
        logger.exception("AI extraction failed for %s %s", record_type, record_id)
        record.ai_extraction_status = "FAILED"
        record.save(update_fields=["ai_extraction_status"])
        _notify(record.user, False, record_type, str(record.id), name)
        return

    # The file may have been replaced/removed or the record deleted meanwhile.
    record = model.objects.filter(pk=record_id).first()
    if record is None or not record.document_file or record.document_file.name != file_read:
        logger.info("%s %s changed during extraction — discarding result.", record_type, record_id)
        return
    record.ai_extraction = extracted
    record.ai_extraction_status = "DONE"
    record.save(update_fields=["ai_extraction", "ai_extraction_status"])
    logger.info("AI extraction complete for %s %s", record_type, record_id)
    _notify(record.user, True, record_type, str(record.id), name)
    _review_after_extraction(record_type, str(record.id))


@shared_task(acks_late=True, soft_time_limit=120, time_limit=150, name="records.review_record")
def review_record_task(record_type: str, record_id: str) -> None:
    """Run the automatic review of one record (rules, document comparison, AI insight)."""
    from apps.records.review import review_record

    try:
        review_record(record_type, record_id)
    except Exception:
        logger.exception("Record review failed for %s %s", record_type, record_id)
        from apps.records.models import RecordReview

        RecordReview.objects.filter(record_type=record_type, record_id=record_id).update(status="FAILED")


def _review_after_extraction(record_type: str, record_id: str) -> None:
    """The document has just been read, so compare it with the form."""
    try:
        from apps.records.review import review_record

        review_record(record_type, record_id)
    except Exception:
        logger.exception("Review after extraction failed for %s %s", record_type, record_id)
