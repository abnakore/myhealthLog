"""
Emergency services for myHealthLog.

Two independent services:

1. StaticEmergencyService
   Compile the classic "first 60 seconds" card from a user's record.
   This is what the public token endpoint returns — filtered by the user's
   EmergencySettings toggles.  No AI involved.

2. AIDynamicSummaryService
   Ask Gemini to analyse the full record and produce a clinically-prioritised
   JSON summary for first responders.  The result is cached in Redis so the
   AI is not called on every page load.  The cache is invalidated when the
   user's record changes (see records signals in a later phase).
"""

import json
import logging
from datetime import date
from typing import Any

from django.conf import settings
from django.core.cache import cache

from apps.core.exceptions import AIProcessingError, ServiceUnavailableError

logger = logging.getLogger(__name__)

# Cache key prefix — scoped per user so we never leak one user's summary to another.
_CACHE_PREFIX = "emergency_ai_summary_v1:"


def _cache_key(user_id: str) -> str:
    return f"{_CACHE_PREFIX}{user_id}"


def _age_from_dob(dob: date | None) -> int | None:
    if dob is None:
        return None
    today = date.today()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


# ---------------------------------------------------------------------------
# Static card compilation (no AI)
# ---------------------------------------------------------------------------


class StaticEmergencyService:
    """
    Compile the emergency card directly from the database — no AI, no cache.
    This is the public-token endpoint's source of truth.
    """

    @staticmethod
    def compile(user, settings_obj) -> dict[str, Any]:
        """
        Build the card dict for one user using their EmergencySettings toggles.
        """
        try:
            profile = user.health_profile
        except Exception:
            profile = None

        result: dict[str, Any] = {
            "ownerUserId": str(user.id),
            "name": profile.full_name if profile else user.name or user.email,
            "dateOfBirth": profile.date_of_birth.isoformat() if profile and profile.date_of_birth else None,
            "age": _age_from_dob(profile.date_of_birth if profile else None),
            "sex": profile.sex if profile else None,
            "bloodType": None,
            "genotype": None,
            "criticalAllergies": [],
            "medications": [],
            "conditions": [],
            "contacts": [],
            "note": None,
            "shows": {
                "bloodType": settings_obj.show_blood_type,
                "allergies": settings_obj.show_allergies,
                "medications": settings_obj.show_medications,
                "conditions": settings_obj.show_conditions,
                "contacts": settings_obj.show_contacts,
                "note": settings_obj.show_note,
            },
        }

        # The link on the card opens the person's health summary, not a larger
        # copy of the card. The summary respects the same section toggles: what
        # the owner hid from a responder stays hidden here too.
        result["summary"] = StaticEmergencyService.compile_summary(user, settings_obj)

        if profile and settings_obj.show_blood_type:
            result["bloodType"] = profile.blood_type or None
            result["genotype"] = profile.genotype or None

        if settings_obj.show_allergies:
            result["criticalAllergies"] = [
                {
                    "substance": a.substance,
                    "severity": a.severity,
                    "reactions": a.reactions or [],
                }
                for a in user.allergies.filter(
                    severity__in=["SEVERE", "ANAPHYLAXIS"]
                ).order_by("-severity")
            ]

        if settings_obj.show_medications:
            result["medications"] = [
                {
                    "name": m.name,
                    "dosage": m.dosage,
                    "frequency": m.frequency,
                }
                for m in user.medications.filter(active=True)
            ]

        if settings_obj.show_conditions:
            result["conditions"] = [
                {"name": c.name, "since": c.onset_date.isoformat() if c.onset_date else None}
                for c in user.conditions.filter(status="ACTIVE")
            ]

        if profile and settings_obj.show_contacts:
            result["contacts"] = [
                {
                    "name": ec.name,
                    "relationship": ec.relationship,
                    "phone": ec.phone,
                }
                for ec in profile.emergency_contacts.order_by("priority")
                if ec.phone.strip()
            ]

        if settings_obj.show_note and settings_obj.note.strip():
            result["note"] = settings_obj.note.strip()

        return result

    @staticmethod
    def compile_summary(user, settings_obj) -> dict[str, Any]:
        """
        The one-page health summary for the person behind the card.

        Same shape as the signed-in Medical summary page: allergies, active
        conditions, current medicines, latest readings and upcoming visits,
        plus the emergency contacts. Sections the owner switched off on the
        card are left out entirely, so the link can never reveal more than the
        card was allowed to.
        """
        from django.utils import timezone

        allergies = []
        if settings_obj.show_allergies:
            allergies = [
                {
                    "substance": a.substance,
                    "severity": a.severity,
                    "reactions": a.reactions or [],
                    "type": a.allergy_type,
                }
                for a in user.allergies.all()
            ]

        conditions = []
        if settings_obj.show_conditions:
            conditions = [
                {
                    "name": c.name,
                    "status": c.status,
                    "severity": c.severity or None,
                    "since": c.onset_date.isoformat() if c.onset_date else None,
                }
                for c in user.conditions.all().order_by("status", "-onset_date")
            ]

        medications = []
        if settings_obj.show_medications:
            medications = [
                {
                    "name": m.name,
                    "dosage": m.dosage,
                    "frequency": m.frequency,
                    "form": m.form or None,
                }
                for m in user.medications.filter(active=True)
            ]

        # Latest reading per measure — the same rule the Medical summary uses —
        # with the recent values behind it so the page can judge the trend.
        groups: dict[tuple[str, str], list] = {}
        for reading in user.vital_readings.order_by("-measured_at")[:500]:
            key = (reading.vital_type, (reading.label or "").strip().lower())
            groups.setdefault(key, []).append(reading)
        vitals = []
        for readings in groups.values():
            latest = readings[0]

            def _num(d):
                # 182.000 → "182", 36.60 → "36.6"
                return format(d.normalize(), "f") if d is not None else None

            vitals.append(
                {
                    "vitalType": latest.vital_type,
                    # Only a custom measure has its own name; the page names the rest.
                    "label": latest.label or "",
                    "value": _num(latest.value),
                    "value2": _num(latest.value2),
                    "unit": latest.unit or "",
                    "measuredAt": latest.measured_at.isoformat()
                    if latest.measured_at
                    else None,
                    "values": [float(r.value) for r in reversed(readings[:16])],
                }
            )
        vitals.sort(key=lambda v: v["measuredAt"] or "", reverse=True)

        # Abnormal results the AI read from files on the record, last 12 months.
        # Clinical findings travel with the conditions switch.
        lab_findings = []
        if settings_obj.show_conditions:
            lab_findings = StaticEmergencyService._abnormal_findings(user)

        pregnant = False
        if settings_obj.show_conditions:
            pregnant = any(
                (ctx.pregnancy_data or {}).get("status", "ONGOING") == "ONGOING"
                for ctx in user.health_contexts.filter(kind="LIFE_STAGE", key="pregnancy")
            )

        appointments = [
            {
                "title": a.title,
                "scheduledFor": a.scheduled_for.isoformat(),
                "facility": a.facility or None,
                "status": a.status,
            }
            for a in user.appointments.filter(
                status="SCHEDULED", scheduled_for__gte=timezone.now()
            ).order_by("scheduled_for")[:3]
        ]

        return {
            "allergies": allergies,
            "conditions": conditions,
            "medications": medications,
            "vitals": vitals,
            "appointments": appointments,
            "labFindings": lab_findings,
            "pregnant": pregnant,
        }

    @staticmethod
    def _abnormal_findings(user, limit: int = 8) -> list[dict[str, Any]]:
        """Out-of-range results from AI-read files on any record, newest first."""
        from datetime import timedelta

        from django.utils import timezone

        cutoff = timezone.now() - timedelta(days=365)
        sources = []
        for doc in user.health_documents.filter(ai_extraction_status="DONE", created_at__gte=cutoff):
            sources.append((doc.ai_extraction, doc.title, doc.document_date or doc.uploaded_at))
        for related in ("medications", "conditions", "allergies", "vital_readings", "appointments"):
            for rec in getattr(user, related).filter(ai_extraction_status="DONE", created_at__gte=cutoff):
                name = getattr(rec, "name", None) or getattr(rec, "substance", None) or getattr(rec, "title", None) or "record"
                sources.append((rec.ai_extraction, name, rec.created_at))

        findings = []
        for extraction, title, when in sources:
            extraction = extraction or {}
            date = extraction.get("date") or (when.isoformat()[:10] if when else None)
            for f in extraction.get("key_findings") or []:
                status = (f.get("status") or "").lower()
                if status not in ("low", "high", "critical"):
                    continue
                findings.append(
                    {
                        "metric": f.get("metric", ""),
                        "value": str(f.get("value", "")),
                        "unit": f.get("unit") or "",
                        "status": status,
                        "referenceRange": f.get("reference_range") or "",
                        "source": extraction.get("title") or title,
                        "date": date,
                    }
                )
        # critical first, then newest first within each group
        critical = sorted([f for f in findings if f["status"] == "critical"], key=lambda f: f["date"] or "", reverse=True)
        other = sorted([f for f in findings if f["status"] != "critical"], key=lambda f: f["date"] or "", reverse=True)
        # The same report attached in two places is one result, not two.
        seen, unique = set(), []
        for f in critical + other:
            key = (f["metric"].lower(), f["value"], str(f["date"] or "")[:10])
            if key not in seen:
                seen.add(key)
                unique.append(f)
        return unique[:limit]


# ---------------------------------------------------------------------------
# AI dynamic summary (Gemini + Redis cache)
# ---------------------------------------------------------------------------

AI_SUMMARY_PROMPT = """
You are a clinical AI assistant for a personal health record system.
Your task is to analyse a patient's health data and produce a structured JSON
summary optimised for emergency first responders.

PATIENT DATA (JSON):
{patient_data}

INSTRUCTIONS:
1. Analyse every section of the patient data thoroughly.
2. Identify the most life-threatening or clinically urgent items first.
3. Produce a JSON response that EXACTLY matches the following schema.
   Return ONLY the JSON — no markdown, no explanation, no fences.

REQUIRED JSON SCHEMA:
{{
  "emergency_overview": {{
    "patient_name": "string",
    "age": <integer or null>,
    "gender": "string or null",
    "blood_type": "string or null",
    "genotype": "string or null",
    "overall_triage_status": "stable" | "warning" | "critical",
    "ai_paramedic_note": "A concise 1-2 sentence emergency directive for first responders."
  }},
  "core_essentials": {{
    "emergency_contacts": [
      {{ "name": "string", "relation": "string", "phone": "string" }}
    ]
  }},
  "ai_prioritized_sections": [
    {{
      "priority_rank": <integer, 1 = highest urgency>,
      "module_type": "critical_allergies" | "active_conditions" | "critical_medications" | "vital_signs" | "critical_documents",
      "title": "string",
      "urgency_level": "critical" | "warning" | "info",
      "items": [
        {{
          // For critical_allergies: {{ "name": str, "severity": str, "reaction": str }}
          // For active_conditions:  {{ "name": str, "since": str, "severity": str }}
          // For critical_medications: {{ "name": str, "dose": str, "frequency": str }}
          // For vital_signs:        {{ "metric": str, "value": str, "recorded": str, "notes": str }}
          // For critical_documents: {{ "title": str, "type": str, "date": str }}
        }}
      ]
    }}
  ]
}}

RULES:
- Rank sections by clinical urgency (anaphylactic allergies = highest, stable vitals = lowest).
- Omit any module_type that has no relevant data.
- overall_triage_status: "critical" if any SEVERE/ANAPHYLAXIS allergy or unstable vital;
  "warning" if active serious conditions or abnormal vitals; "stable" otherwise.
- ai_paramedic_note: Address first responders directly. Be concise and specific.
- priority_rank starts at 1.
"""


class AIDynamicSummaryService:
    """
    Produce an AI-prioritised emergency summary for a given user.

    The result is cached in Redis for EMERGENCY_AI_SUMMARY_CACHE_TTL seconds
    (default 1 hour).  Call invalidate() whenever the user's record changes to
    force a fresh AI analysis on the next request.
    """

    @staticmethod
    def _build_patient_data(user) -> dict[str, Any]:
        """Compile a safe, structured snapshot of the user's record."""
        from apps.profiles.serializers import HealthProfileReadSerializer
        from apps.records.serializers import (
            AllergyReadSerializer,
            ConditionReadSerializer,
            MedicationReadSerializer,
            VitalReadingReadSerializer,
        )

        try:
            profile_data = HealthProfileReadSerializer(user.health_profile).data
        except Exception:
            profile_data = {"full_name": user.name or user.email}

        return {
            "profile": profile_data,
            "allergies": AllergyReadSerializer(user.allergies.all(), many=True).data,
            "conditions": ConditionReadSerializer(user.conditions.all(), many=True).data,
            "medications": MedicationReadSerializer(
                user.medications.filter(active=True), many=True
            ).data,
            "vitals": VitalReadingReadSerializer(
                user.vital_readings.order_by("-measured_at")[:50], many=True
            ).data,
        }

    @classmethod
    def get_or_generate(cls, user) -> dict[str, Any]:
        """
        Return a cached AI summary or generate a fresh one.

        Cache hit  → return immediately (no Gemini call).
        Cache miss → call Gemini, parse response, cache result, return.
        """
        cache_key = _cache_key(str(user.id))
        cached = cache.get(cache_key)
        if cached is not None:
            logger.debug("AI emergency summary cache hit for user %s", user.id)
            return cached

        logger.info("AI emergency summary cache miss for user %s — calling Gemini", user.id)
        summary = cls._generate(user)
        ttl = getattr(settings, "EMERGENCY_AI_SUMMARY_CACHE_TTL", 3600)
        cache.set(cache_key, summary, ttl)
        return summary

    @classmethod
    def _generate(cls, user) -> dict[str, Any]:
        """Call Gemini and parse the structured JSON response."""
        if not settings.GEMINI_API_KEY:
            raise ServiceUnavailableError(
                "AI summarisation is not configured on this server."
            )

        from apps.core import ai

        patient_data = cls._build_patient_data(user)
        prompt = AI_SUMMARY_PROMPT.format(
            patient_data=json.dumps(patient_data, default=str, indent=2)
        )
        try:
            summary = ai.generate_json([{"role": "user", "parts": [{"text": prompt}]}])
        except AIProcessingError:
            raise
        except ServiceUnavailableError as exc:
            logger.warning("AI emergency summary failed for user %s: %s", user.id, exc)
            raise ServiceUnavailableError("AI service returned an error. Please try again.") from exc

        if not isinstance(summary, dict):
            raise AIProcessingError("The AI summary is not in the expected format.")

        # Validate top-level keys.
        required_keys = {"emergency_overview", "core_essentials", "ai_prioritized_sections"}
        if not required_keys.issubset(summary.keys()):
            raise AIProcessingError(
                "The AI summary is missing required sections. Please try again."
            )

        return summary

    @staticmethod
    def invalidate(user_id: str) -> None:
        """Invalidate the cached AI summary for a user."""
        cache.delete(_cache_key(user_id))
        logger.debug("AI emergency summary cache invalidated for user %s", user_id)
