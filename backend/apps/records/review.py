"""
Automatic record review.

Runs in the Celery worker after a record is saved, and again after the AI has
read an attached document. Three steps, in this order:

  1. Rule checks (apps.core.clinical_rules): allergy and medicine clashes,
     medicine cautions for the person's conditions and pregnancy, readings in a
     danger band (adjusted for pregnancy and diabetes) and readings that look
     like typing mistakes.
  2. Document comparison: when the AI has extracted facts from the attached
     file, compare them with what the person typed (for example 500 mg on the
     form against 600 mg on the prescription) and suggest the document value.
  3. AI insight: a short Gemini note that explains the record in the light of
     the person's ranked care focus. It may add observations but is told not to
     contradict the rule findings, diagnose or prescribe.

The rules decide what is flagged; the AI only explains. If the AI is off or
fails, the review still stores the rule findings and the comparison.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from django.apps import apps as django_apps
from django.conf import settings

from apps.core import clinical_rules as rules
from apps.core.clinical_rules import Finding

logger = logging.getLogger(__name__)

REVIEW_MODELS = {
    "medication": "records.Medication",
    "allergy": "records.Allergy",
    "condition": "records.Condition",
    "vital": "records.VitalReading",
    "document": "records.HealthDocument",
    "appointment": "records.Appointment",
}

# ---------------------------------------------------------------------------
# Context
# ---------------------------------------------------------------------------


def _context(user) -> dict[str, Any]:
    from apps.contexts.focus import current_pregnancy, pregnancy_weeks, ranked_focus

    conditions = [c for c in user.conditions.all() if c.status != "RESOLVED"]
    preg = current_pregnancy(user)
    return {
        "allergies": list(user.allergies.all()),
        "conditions": conditions,
        "active_meds": list(user.medications.filter(active=True)),
        "pregnant": preg is not None,
        "pregnancy_weeks": pregnancy_weeks(preg.pregnancy_data if preg else None),
        "diabetic": any(re.search(r"diabet", (c.name or "").lower()) for c in conditions),
        "focus": ranked_focus(user),
    }


class _NamedMedicine:
    """A medicine mentioned in a document, shaped like a Medication for the rules."""

    def __init__(self, name: str):
        self.name = name


# ---------------------------------------------------------------------------
# Step 1: rules
# ---------------------------------------------------------------------------


def _rule_findings(record_type: str, record, ctx: dict[str, Any]) -> list[Finding]:
    out: list[Finding] = []
    if record_type == "medication":
        if record.active:
            out += rules.medication_findings(record, allergies=ctx["allergies"], conditions=ctx["conditions"],
                                             pregnant=ctx["pregnant"], pregnancy_weeks=ctx["pregnancy_weeks"])
    elif record_type == "allergy":
        for med in ctx["active_meds"]:
            for f in rules.medication_findings(med, allergies=[record], conditions=[]):
                if f.rule.startswith("allergy."):
                    f.title = f"You are taking {med.name}, which may clash with this allergy"
                    out.append(f)
    elif record_type == "condition":
        if record.status != "RESOLVED":
            for med in ctx["active_meds"]:
                out += [f for f in rules.medication_findings(med, allergies=[], conditions=[record])
                        if f.rule.startswith("condition.")]
    elif record_type == "vital":
        value = float(record.value)
        value2 = float(record.value2) if record.value2 is not None else None
        odd = rules.plausibility(record.vital_type, value, value2, record.unit)
        if odd:
            out.append(odd)
        else:
            band = rules.reading_band(record.vital_type, value, value2, record.unit,
                                      pregnant=ctx["pregnant"], diabetic=ctx["diabetic"])
            if band:
                out.append(band)
    elif record_type == "document":
        extraction = record.ai_extraction or {}
        for m in extraction.get("medications_mentioned") or []:
            name = str((m or {}).get("name") or "").strip()
            if name:
                out += [f for f in rules.medication_findings(
                    _NamedMedicine(name), allergies=ctx["allergies"], conditions=ctx["conditions"],
                    pregnant=ctx["pregnant"], pregnancy_weeks=ctx["pregnancy_weeks"])
                    if f.level != "info"]
        abnormal = [k for k in extraction.get("key_findings") or []
                    if (k or {}).get("status") in ("critical", "high", "low")]
        critical = [k for k in abnormal if k.get("status") == "critical"]
        if critical:
            names = ", ".join(str(k.get("metric")) for k in critical[:4])
            out.append(Finding("critical", "document.critical", "Critical result in this document",
                               f"The document marks these results as critical: {names}. Contact your doctor promptly."))
        elif abnormal:
            names = ", ".join(str(k.get("metric")) for k in abnormal[:4])
            out.append(Finding("warning", "document.abnormal", "Results outside the reference range",
                               f"These results are outside the range printed on the document: {names}."))
    return rules.sort_findings(out)


# ---------------------------------------------------------------------------
# Step 2: document comparison
# ---------------------------------------------------------------------------

_DOSE = re.compile(r"(\d+(?:\.\d+)?)\s*(mcg|µg|ug|mg|g|ml|iu|units?)\b", re.I)
_TO_MG = {"mcg": 0.001, "µg": 0.001, "ug": 0.001, "mg": 1.0, "g": 1000.0}


def parse_dose(text: str) -> tuple[float, str] | None:
    """'500mg' -> (500.0, 'mg'); '0.5 g' -> (500.0, 'mg'). Volume and unit doses keep their unit."""
    m = _DOSE.search(text or "")
    if not m:
        return None
    value, unit = float(m.group(1)), m.group(2).lower()
    if unit in _TO_MG:
        return value * _TO_MG[unit], "mg"
    return value, "unit" if unit.startswith("unit") else unit


def _tokens(name: str) -> set[str]:
    return {t for t in re.split(r"[^a-z0-9]+", (name or "").lower()) if len(t) > 2}


def _same_medicine(a: str, b: str) -> bool:
    ta, tb = _tokens(a), _tokens(b)
    return bool(ta and tb and (ta & tb))


def _fmt_dose(v: tuple[float, str]) -> str:
    return f"{v[0]:g} {v[1]}"


_VITAL_WORDS = {
    "BLOOD_PRESSURE": ("blood pressure", "bp"),
    "BLOOD_GLUCOSE": ("glucose", "sugar", "fbs", "rbs"),
    "PULSE": ("pulse", "heart rate"),
    "TEMPERATURE": ("temperature", "temp"),
    "SPO2": ("spo2", "oxygen", "saturation"),
    "WEIGHT": ("weight",),
    "RESPIRATORY_RATE": ("respiratory", "breathing"),
}


def _mismatches(record_type: str, record) -> list[dict[str, Any]]:
    extraction = getattr(record, "ai_extraction", None) or {}
    if getattr(record, "ai_extraction_status", "") != "DONE" or not extraction:
        return []
    out: list[dict[str, Any]] = []
    if record_type == "medication":
        mentioned = [m for m in extraction.get("medications_mentioned") or [] if (m or {}).get("name")]
        match = next((m for m in mentioned if _same_medicine(record.name, m["name"])), None)
        if mentioned and match is None:
            names = ", ".join(m["name"] for m in mentioned[:4])
            out.append({"field": "name", "form": record.name, "document": names, "suggestion": None,
                        "detail": f"The attached document lists {names}, but not {record.name}. "
                                  f"Check that the right file is attached."})
        if match:
            form_dose = parse_dose(record.dosage)
            doc_dose = parse_dose(str(match.get("dosage") or ""))
            if form_dose and doc_dose and form_dose[1] == doc_dose[1] and abs(form_dose[0] - doc_dose[0]) > 1e-6:
                out.append({"field": "dosage", "form": record.dosage, "document": str(match.get("dosage")),
                            "suggestion": str(match.get("dosage")).strip(),
                            "detail": f"You entered {_fmt_dose(form_dose)} but the document says "
                                      f"{_fmt_dose(doc_dose)}. If the document is right, update the dosage."})
            doc_freq = str(match.get("frequency") or "").strip()
            if doc_freq and record.frequency and not (_tokens(doc_freq) & _tokens(record.frequency)) \
                    and doc_freq.lower() != record.frequency.lower():
                out.append({"field": "frequency", "form": record.frequency, "document": doc_freq,
                            "suggestion": doc_freq,
                            "detail": f"You entered \"{record.frequency}\" but the document says \"{doc_freq}\"."})
    elif record_type == "vital":
        words = _VITAL_WORDS.get(record.vital_type, ())
        for k in extraction.get("key_findings") or []:
            metric = str((k or {}).get("metric") or "").lower()
            if not words or not any(w in metric for w in words):
                continue
            nums = re.findall(r"\d+(?:\.\d+)?", str(k.get("value") or ""))
            if not nums:
                continue
            doc_v = float(nums[0])
            doc_v2 = float(nums[1]) if len(nums) > 1 and record.vital_type == "BLOOD_PRESSURE" else None
            form_v = float(record.value)
            form_v2 = float(record.value2) if record.value2 is not None else None
            differs = abs(doc_v - form_v) > max(0.01 * abs(doc_v), 0.05) or (
                doc_v2 is not None and form_v2 is not None and abs(doc_v2 - form_v2) > 0.5)
            if differs:
                doc_text = f"{doc_v:g}/{doc_v2:g}" if doc_v2 is not None else f"{doc_v:g}"
                form_text = f"{form_v:g}/{form_v2:g}" if form_v2 is not None else f"{form_v:g}"
                out.append({"field": "value", "form": form_text, "document": f"{doc_text} {k.get('unit') or ''}".strip(),
                            "suggestion": doc_text,
                            "detail": f"You entered {form_text} but the document shows {doc_text} for "
                                      f"{k.get('metric')}. If the document is right, update the reading."})
            break
    elif record_type == "condition":
        mentioned = [str(c) for c in extraction.get("conditions_mentioned") or [] if c]
        if mentioned and not any(_same_medicine(record.name, c) for c in mentioned):
            names = ", ".join(mentioned[:4])
            out.append({"field": "name", "form": record.name, "document": names, "suggestion": None,
                        "detail": f"The attached document mentions {names}, but not {record.name}."})
    return out


# ---------------------------------------------------------------------------
# Step 3: AI insight
# ---------------------------------------------------------------------------

INSIGHT_PROMPT = """
You review one entry that a patient just saved in their personal health record.
Write a short, plain-language note for the patient.

THE ENTRY ({record_type}):
{record}

THE PATIENT'S RECORD:
{patient}

THE PATIENT'S CARE FOCUS, highest priority first:
{focus}

FINDINGS FROM FIXED SAFETY RULES (already shown to the patient; never contradict or soften them):
{findings}

DIFFERENCES BETWEEN THE FORM AND THE ATTACHED DOCUMENT:
{mismatches}

Rules:
- Explain what this entry means for this patient, giving most weight to the first items in the care focus.
- You may point out one or two further things worth asking a doctor or pharmacist about, using the record above.
- Do not diagnose, do not prescribe, and never tell the patient to stop or change a prescribed medicine.
- If nothing needs attention, say so briefly.
- Use simple words. Do not use the em dash character.
Return ONE JSON object only:
{{"summary": "one or two sentences", "points": ["at most three short points"], "urgency": "none | routine | soon | urgent"}}
"""


def _record_dict(record_type: str, record) -> dict[str, Any]:
    fields = {
        "medication": ("name", "dosage", "form", "route", "frequency", "start_date", "end_date", "active", "reason"),
        "allergy": ("substance", "allergy_type", "severity", "reactions"),
        "condition": ("name", "status", "severity", "onset_date"),
        "vital": ("vital_type", "value", "value2", "unit", "measured_at", "context"),
        "document": ("title", "doc_type", "document_date"),
        "appointment": ("title", "facility", "scheduled_for", "status", "reason"),
    }.get(record_type, ())
    out = {f: getattr(record, f, None) for f in fields}
    extraction = getattr(record, "ai_extraction", None)
    if extraction:
        out["document_summary"] = extraction.get("summary")
    return out


def _patient_text(ctx: dict[str, Any]) -> str:
    lines = []
    if ctx["allergies"]:
        lines.append("Allergies: " + ", ".join(f"{a.substance} ({a.severity})" for a in ctx["allergies"]))
    if ctx["active_meds"]:
        lines.append("Current medicines: " + ", ".join(f"{m.name} {m.dosage}".strip() for m in ctx["active_meds"]))
    if ctx["conditions"]:
        lines.append("Conditions: " + ", ".join(f"{c.name} ({c.status.lower()})" for c in ctx["conditions"]))
    if ctx["pregnant"]:
        weeks = ctx["pregnancy_weeks"]
        lines.append("Pregnant" + (f", about {weeks} weeks" if weeks is not None else ""))
    return "\n".join(lines) or "No other records yet."


def _ai_insight(record_type: str, record, ctx, findings: list[Finding], mismatches) -> tuple[dict | None, str]:
    from apps.contexts.focus import focus_summary_lines
    from apps.core import ai

    if not getattr(settings, "RECORD_REVIEW_AI_ENABLED", True) or not ai.is_configured():
        return None, "SKIPPED"
    prompt = INSIGHT_PROMPT.format(
        record_type=record_type,
        record=json.dumps(_record_dict(record_type, record), default=str, indent=1),
        patient=_patient_text(ctx),
        focus="\n".join(focus_summary_lines(ctx["focus"])) or "None chosen.",
        findings="\n".join(f"- [{f.level}] {f.title}: {f.detail}" for f in findings) or "None.",
        mismatches="\n".join(f"- {m['detail']}" for m in mismatches) or "None.",
    )
    try:
        raw = ai.generate_json([{"role": "user", "parts": [{"text": prompt}]}])
    except Exception as exc:
        logger.warning("Record review AI insight failed for %s %s: %s", record_type, record.pk, exc)
        return None, "FAILED"
    if not isinstance(raw, dict) or not isinstance(raw.get("summary"), str):
        return None, "FAILED"
    points = [str(p).replace("—", ",")[:300] for p in (raw.get("points") or []) if p][:3]
    urgency = raw.get("urgency") if raw.get("urgency") in ("none", "routine", "soon", "urgent") else "routine"
    return {"summary": raw["summary"].replace("—", ",")[:600], "points": points, "urgency": urgency}, "DONE"


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def review_record(record_type: str, record_id: str):
    """Review one record and store the result. Returns the RecordReview or None."""
    from apps.records.models import RecordReview

    label = REVIEW_MODELS.get(record_type)
    if label is None:
        return None
    record = django_apps.get_model(label).objects.filter(pk=record_id).first()
    if record is None:
        RecordReview.objects.filter(record_type=record_type, record_id=record_id).delete()
        return None

    ctx = _context(record.user)
    findings = _rule_findings(record_type, record, ctx)
    mismatches = _mismatches(record_type, record)
    insight, ai_status = _ai_insight(record_type, record, ctx, findings, mismatches)

    previous = RecordReview.objects.filter(record_type=record_type, record_id=record.pk).first()
    before = {(f["rule"], f["title"]) for f in (previous.findings if previous else [])}
    before_mm = {(m["field"], m["document"]) for m in (previous.mismatches if previous else [])}

    review, _ = RecordReview.objects.update_or_create(
        record_type=record_type,
        record_id=record.pk,
        defaults={
            "user": record.user,
            "status": RecordReview.Status.DONE,
            "findings": [f.as_dict() for f in findings],
            "mismatches": mismatches,
            "ai_insight": insight,
            "ai_status": ai_status,
        },
    )

    # Notify only about something new that needs attention, so re-saving the
    # same record does not repeat the alert.
    serious = [f for f in findings if f.level in ("critical", "warning") and (f.rule, f.title) not in before]
    new_mm = [m for m in mismatches if (m["field"], m["document"]) not in before_mm]
    if serious or new_mm:
        _notify(record, record_type, serious, new_mm)
    return review


# The frontend record page route for each record type (frontend registry listPath).
_PAGE_ROUTE = {"medication": "medications", "allergy": "allergies", "condition": "conditions",
               "vital": "measurements", "document": "documents", "appointment": "appointments"}


def _notify(record, record_type: str, serious: list[Finding], mismatches) -> None:
    try:
        from apps.notifications.models import Notification
        from apps.notifications.utils import notify
        from apps.records.views import _record_name

        name = _record_name(record)
        if serious:
            top = serious[0]
            title = f"{'Urgent: ' if top.level == 'critical' else ''}{top.title}"
            body = top.detail
        else:
            title = f"Check {name} against its document"
            body = mismatches[0]["detail"]
        notify(
            user=record.user,
            kind=Notification.Kind.RECORD_REVIEW,
            title=title[:200],
            body=body,
            data={"record_type": record_type, "record_id": str(record.pk), "record_name": name,
                  "level": serious[0].level if serious else "warning",
                  "link": f"/app/records/{_PAGE_ROUTE.get(record_type, record_type + 's')}/{record.pk}"},
        )
    except Exception:
        logger.exception("Failed to notify about review of %s %s", record_type, record.pk)
