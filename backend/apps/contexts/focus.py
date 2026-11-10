"""
Care focus: the conditions and life stages a person wants the app to focus on,
ranked by fixed rules.

A person can be pregnant, diabetic and caring for an elderly parent's routine
all at once, so the focus is a list, not a single mode. The list is stored on
the health profile as small references ({"kind": "pregnancy"} or
{"kind": "condition", "id": "<condition uuid>"} or {"kind": "elderly"}) and is
ranked on read so the order always reflects the current record:

  pregnancy                      100  changes which medicines and readings are safe
  active condition, severe        90
  active condition, moderate      75
  active condition, no severity   70
  active condition, mild          60
  condition in remission          40
  elderly care                    30  shapes the screens rather than the medicine
  resolved condition              20

Ties are broken by name so the order is stable. The same rules live in the
frontend (src/lib/careFocus.ts) so the dashboard reorders instantly.
"""

from __future__ import annotations

import datetime
from typing import Any

PREGNANCY_SCORE = 100
ELDERLY_SCORE = 30
_CONDITION_SCORES = {
    ("ACTIVE", "SEVERE"): 90,
    ("ACTIVE", "MODERATE"): 75,
    ("ACTIVE", ""): 70,
    ("ACTIVE", "MILD"): 60,
}
VALID_KINDS = ("pregnancy", "condition", "elderly")


def condition_score(status: str, severity: str) -> int:
    status = (status or "").upper()
    severity = (severity or "").upper()
    if status == "ACTIVE":
        return _CONDITION_SCORES.get((status, severity), 70)
    if status == "IN_REMISSION":
        return 40
    return 20


def pregnancy_weeks(pregnancy_data: dict[str, Any] | None, today: datetime.date | None = None) -> int | None:
    """Completed weeks of pregnancy from the LMP, or from the due date (LMP = EDD - 280 days)."""
    if not pregnancy_data:
        return None
    today = today or datetime.date.today()
    lmp = pregnancy_data.get("lastMenstrualPeriod") or pregnancy_data.get("last_menstrual_period")
    edd = pregnancy_data.get("estimatedDueDate") or pregnancy_data.get("estimated_due_date")
    start = None
    try:
        if lmp:
            start = datetime.date.fromisoformat(str(lmp)[:10])
        elif edd:
            start = datetime.date.fromisoformat(str(edd)[:10]) - datetime.timedelta(days=280)
    except ValueError:
        return None
    if start is None:
        return None
    weeks = (today - start).days // 7
    return weeks if 0 <= weeks <= 45 else None


def current_pregnancy(user):
    """The person's ongoing pregnancy context, if any."""
    for ctx in user.health_contexts.filter(kind="LIFE_STAGE", key="pregnancy").order_by("-created_at"):
        status = ((ctx.pregnancy_data or {}).get("status") or "ONGOING").upper()
        if status == "ONGOING":
            return ctx
    return None


def clean_focus(raw: Any) -> list[dict[str, str]]:
    """Validate and de-duplicate a focus list sent by the client."""
    if not isinstance(raw, list):
        raise ValueError("Focus must be a list.")
    out: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for item in raw:
        if not isinstance(item, dict) or item.get("kind") not in VALID_KINDS:
            raise ValueError("Each focus item needs a kind of pregnancy, condition or elderly.")
        kind = item["kind"]
        ident = str(item.get("id") or "") if kind == "condition" else ""
        if kind == "condition" and not ident:
            raise ValueError("A condition focus needs the condition id.")
        key = (kind, ident)
        if key in seen:
            continue
        seen.add(key)
        out.append({"kind": kind, "id": ident} if ident else {"kind": kind})
    if len(out) > 12:
        raise ValueError("Choose at most 12 focus items.")
    return out


def ranked_focus(user, focus: list[dict[str, str]] | None = None) -> list[dict[str, Any]]:
    """Resolve the stored focus references against the record and rank them."""
    if focus is None:
        profile = getattr(user, "health_profile", None)
        focus = list(getattr(profile, "care_focus", None) or [])
    conditions = {str(c.id): c for c in user.conditions.all()}
    items: list[dict[str, Any]] = []
    for ref in focus:
        kind = ref.get("kind")
        if kind == "pregnancy":
            preg = current_pregnancy(user)
            weeks = pregnancy_weeks(preg.pregnancy_data if preg else None)
            label = f"Pregnancy ({weeks} weeks)" if weeks is not None else "Pregnancy"
            items.append({"kind": "pregnancy", "id": str(preg.id) if preg else "", "label": label,
                          "score": PREGNANCY_SCORE, "weeks": weeks,
                          "reason": "Pregnancy changes which medicines and readings are safe, so it leads."})
        elif kind == "condition":
            c = conditions.get(str(ref.get("id")))
            if c is None:
                continue  # the condition was deleted; drop the dangling reference
            score = condition_score(c.status, c.severity)
            sev = (c.severity or "").lower()
            status = c.get_status_display().lower()
            reason = (f"{status.capitalize()} condition" + (f", {sev}" if sev else "") + ".")
            items.append({"kind": "condition", "id": str(c.id), "label": c.name, "score": score,
                          "status": c.status, "severity": c.severity, "reason": reason})
        elif kind == "elderly":
            items.append({"kind": "elderly", "id": "", "label": "Elderly care", "score": ELDERLY_SCORE,
                          "reason": "Shapes the screens: larger text, fewer choices, medication reminders."})
    items.sort(key=lambda i: (-i["score"], i["label"].lower()))
    for n, item in enumerate(items, start=1):
        item["rank"] = n
    return items


def focus_summary_lines(items: list[dict[str, Any]]) -> list[str]:
    """Plain lines for an AI prompt, highest priority first."""
    return [f"{i['rank']}. {i['label']}: {i['reason']}" for i in items]
