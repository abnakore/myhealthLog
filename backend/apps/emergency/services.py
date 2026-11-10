"""
Emergency service for myHealthLog.

StaticEmergencyService compiles the "first 60 seconds" card from a user's
record. This is what the public token endpoint returns, filtered by the user's
EmergencySettings toggles. No AI decides anything here: what a responder sees
is the record itself, ordered by the person's care focus and fixed rules.
"""

import logging
from datetime import date
from typing import Any

logger = logging.getLogger(__name__)


def medicine_flags(user) -> list[dict[str, Any]]:
    """Serious findings of the stored review of each current medicine."""
    from apps.records.models import RecordReview

    meds = {m.pk: m.name for m in user.medications.filter(active=True)}
    out = []
    for review in RecordReview.objects.filter(user=user, record_type="medication", record_id__in=list(meds)):
        for f in review.findings or []:
            if f.get("level") in ("critical", "warning"):
                out.append({
                    "medication": meds.get(review.record_id, ""),
                    "level": f["level"],
                    "title": f.get("title", ""),
                    "detail": f.get("detail", ""),
                    "rule": f.get("rule", ""),
                    "source": f.get("source", ""),
                })
    out.sort(key=lambda f: 0 if f["level"] == "critical" else 1)
    return out


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

        # The person's ranked care focus decides which conditions a responder
        # reads first (pregnancy, then severe active conditions, and so on).
        care_focus = []
        if settings_obj.show_conditions:
            try:
                from apps.contexts.focus import ranked_focus

                care_focus = [
                    {"kind": f["kind"], "label": f["label"], "rank": f["rank"], "reason": f["reason"]}
                    for f in ranked_focus(user)
                    if f["kind"] != "elderly"
                ]
            except Exception:
                logger.exception("Could not rank care focus for the emergency summary of %s", user.id)
            order = {f["label"].lower(): f["rank"] for f in care_focus if f["kind"] == "condition"}
            conditions.sort(key=lambda c: order.get(c["name"].lower(), len(order) + 1))

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
            "careFocus": care_focus,
            # Medicine safety findings from the record review (official drug sources).
            "medicineFlags": medicine_flags(user) if settings_obj.show_medications else [],
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
