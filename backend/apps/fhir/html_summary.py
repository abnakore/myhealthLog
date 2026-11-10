"""
Clinical HTML summary builder for myHealthLog.

One self-contained page a clinician can read in a minute: who this is, what
could harm them, what they take, what they live with, and their latest
numbers. It is also the copy a patient hands over, so it has to read well for
them too.

Design notes:
  - Self-contained: every style is inline, no fonts, scripts or images are
    fetched, so it opens offline, from a USB stick or an email attachment.
  - Plain words: coded values (SEVERE, BLOOD_PRESSURE, ISO dates) are shown
    the way a person says them.
  - Safety first: life-threatening allergies and an ongoing pregnancy sit in
    a warning band above everything else.
  - Prints on A4 with sensible margins; sections never split across pages.
"""

from __future__ import annotations

import datetime
from decimal import Decimal
from html import escape
from typing import Any, Iterable

from django.utils import timezone

CRITICAL_SEVERITIES = {"SEVERE", "ANAPHYLAXIS"}


# ---------------------------------------------------------------------------
# Formatting helpers
# ---------------------------------------------------------------------------


def _e(value: Any) -> str:
    return escape(str(value), quote=True)


def _date(d: datetime.date | datetime.datetime | None) -> str:
    """3 Apr 1992."""
    if d is None:
        return ""
    if isinstance(d, datetime.datetime):
        d = timezone.localtime(d) if timezone.is_aware(d) else d
    return f"{d.day} {d.strftime('%b %Y')}"


def _time(d: datetime.datetime) -> str:
    """9:30 AM."""
    local = timezone.localtime(d) if timezone.is_aware(d) else d
    return local.strftime("%I:%M %p").lstrip("0")


def _num(d: Decimal | None) -> str:
    """182.000 -> 182, 36.60 -> 36.6."""
    if d is None:
        return ""
    return format(d.normalize(), "f")


def _age(dob: datetime.date | None) -> str:
    if dob is None:
        return ""
    today = datetime.date.today()
    years = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
    return f"{years} years"


def _display(obj: Any, field: str) -> str:
    """The choice label (Severe, Blood pressure) rather than the stored code."""
    getter = getattr(obj, f"get_{field}_display", None)
    value = getter() if callable(getter) else getattr(obj, field, "")
    return str(value or "")


def _join(parts: Iterable[str], sep: str = " · ") -> str:
    return sep.join(p for p in parts if p)


# ---------------------------------------------------------------------------
# Building blocks
# ---------------------------------------------------------------------------


def _pill(text: str, tone: str = "neutral") -> str:
    return f'<span class="pill pill-{tone}">{_e(text)}</span>'


def _row(title: str, meta: str = "", side: str = "", note: str = "") -> str:
    """One item: the name in bold, its details underneath, a tag on the right."""
    meta_html = f'<p class="meta">{_e(meta)}</p>' if meta else ""
    note_html = f'<p class="note">{_e(note)}</p>' if note else ""
    side_html = f'<div class="side">{side}</div>' if side else ""
    return (
        '<li class="row">'
        f'<div class="main"><p class="title">{_e(title)}</p>{meta_html}{note_html}</div>'
        f"{side_html}</li>"
    )


def _section(title: str, rows: list[str], empty: str, count: int | None = None, tone: str = "") -> str:
    count_html = f'<span class="count">{count}</span>' if count else ""
    body = f'<ul class="rows">{"".join(rows)}</ul>' if rows else f'<p class="empty">{_e(empty)}</p>'
    return (
        f'<section class="card {tone}">'
        f'<h2><span>{_e(title)}</span>{count_html}</h2>{body}</section>'
    )


def _severity_tone(code: str) -> str:
    if code in CRITICAL_SEVERITIES:
        return "danger"
    if code == "MODERATE":
        return "warn"
    return "neutral"


# ---------------------------------------------------------------------------
# Styles
# ---------------------------------------------------------------------------

_CSS = """
:root {
  --ink: #2a211c; --muted: #6d625b; --faint: #9a8f87;
  --paper: #faf6f2; --surface: #ffffff; --rule: #ebe2da; --sunk: #f4ede7;
  --accent: #b5462c; --accent-lo: #fbe9e3;
  --danger: #b42318; --danger-lo: #fdecea; --danger-rule: #f3c3bd;
  --warn: #8a5a00; --warn-lo: #fdf3dc;
  --good: #1f6b4a; --good-lo: #e3f3ea;
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0; background: var(--paper); color: var(--ink);
  font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}
.page { max-width: 980px; margin: 0 auto; padding: 28px 20px 40px; }
p { margin: 0; }

.top { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
.brand { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 17px; letter-spacing: -0.01em; }
.mark {
  display: inline-grid; place-items: center; width: 30px; height: 30px; border-radius: 8px;
  background: var(--accent); color: #fff; font-size: 20px; font-weight: 700; line-height: 1;
}
.doc { color: var(--muted); font-size: 13px; }

.patient {
  margin-top: 18px; background: var(--surface); border: 1px solid var(--rule); border-radius: 16px;
  padding: 22px 24px;
}
.eyebrow { font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent); }
h1 { margin: 4px 0 0; font-size: 30px; line-height: 1.15; letter-spacing: -0.02em; }
.facts { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 18px 0 0; }
.fact { background: var(--sunk); border-radius: 12px; padding: 10px 14px; }
.fact dt { font-size: 12px; color: var(--muted); }
.fact dd { margin: 2px 0 0; font-size: 17px; font-weight: 700; }
.fact .sub { font-size: 12px; font-weight: 400; color: var(--muted); }

.alerts {
  margin-top: 14px; border: 1px solid var(--danger-rule); background: var(--danger-lo);
  border-radius: 16px; padding: 16px 20px;
}
.alerts h2 { margin: 0 0 8px; font-size: 13px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--danger); }
.alerts ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; }
.alerts li { font-size: 16px; }
.alerts b { color: var(--danger); }

.focus { margin-top: 14px; background: var(--surface); border: 1px solid var(--rule); border-radius: 16px; padding: 16px 20px; }
.focus h2 { margin: 0 0 10px; font-size: 13px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); }
.focus ol { margin: 0; padding: 0; list-style: none; display: grid; gap: 8px; }
.focus li { display: flex; gap: 10px; align-items: baseline; }
.rank {
  flex: none; display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 50%;
  background: var(--accent-lo); color: var(--accent); font-size: 12px; font-weight: 700;
}
.focus li:first-child .rank { background: var(--accent); color: #fff; }
.focus .why { color: var(--muted); }

.grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin-top: 14px; align-items: start; }
.card { background: var(--surface); border: 1px solid var(--rule); border-radius: 16px; padding: 18px 20px 8px; break-inside: avoid; }
.card.wide { grid-column: 1 / -1; }
.card.danger { border-color: var(--danger-rule); }
.card h2 {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  margin: 0 0 4px; font-size: 18px; letter-spacing: -0.01em;
}
.count {
  font-size: 12px; font-weight: 700; color: var(--muted); background: var(--sunk);
  border-radius: 999px; padding: 2px 9px;
}
.rows { margin: 0; padding: 0; list-style: none; }
.row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 12px 0; border-top: 1px solid var(--rule); }
.row:first-child { border-top: 0; }
.main { min-width: 0; }
.title { font-weight: 700; font-size: 16px; }
.meta { color: var(--muted); font-size: 14px; margin-top: 1px; }
.note { color: var(--ink); font-size: 14px; margin-top: 4px; }
.side { flex: none; text-align: right; }
.value { font-size: 18px; font-weight: 700; white-space: nowrap; font-variant-numeric: tabular-nums; }
.value small { font-size: 13px; font-weight: 600; color: var(--muted); }
.empty { color: var(--muted); padding: 10px 0 14px; }

.pill { display: inline-block; border-radius: 999px; padding: 3px 10px; font-size: 12px; font-weight: 700; white-space: nowrap; }
.pill-neutral { background: var(--sunk); color: var(--muted); }
.pill-danger { background: var(--danger-lo); color: var(--danger); }
.pill-warn { background: var(--warn-lo); color: var(--warn); }
.pill-good { background: var(--good-lo); color: var(--good); }
.pill-accent { background: var(--accent-lo); color: var(--accent); }

.footer { margin-top: 22px; color: var(--faint); font-size: 12px; line-height: 1.6; border-top: 1px solid var(--rule); padding-top: 12px; }

@media screen and (max-width: 760px) {
  .page { padding: 18px 14px 32px; }
  h1 { font-size: 26px; }
  .facts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .grid { grid-template-columns: 1fr; }
}

@page { size: A4; margin: 14mm 12mm; }
@media print {
  body { background: #fff; font-size: 12.5px; }
  .page { max-width: none; padding: 0; }
  .patient, .card, .focus { border-color: #ddd; }
  .grid { gap: 10px; }
  .patient { padding: 14px 16px; margin-top: 10px; }
  .facts { margin-top: 10px; gap: 8px; }
  .fact { padding: 6px 10px; }
  .fact dd { font-size: 14px; }
  .alerts, .focus { padding: 10px 14px; margin-top: 10px; }
  .alerts li { font-size: 13.5px; }
  .card { padding: 10px 14px 2px; border-radius: 12px; }
  .card h2 { font-size: 15px; }
  .row { padding: 6px 0; }
  .title { font-size: 13.5px; }
  .meta, .note { font-size: 12px; }
  .value { font-size: 14px; }
  .value small { font-size: 11px; }
  .footer { margin-top: 12px; font-size: 10.5px; }
  h1 { font-size: 22px; }
  .alerts, .pill, .rank, .mark, .fact { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
"""


# ---------------------------------------------------------------------------
# The page
# ---------------------------------------------------------------------------


def build_html_summary(user) -> str:
    """Produce a self-contained clinical summary HTML string."""
    try:
        profile = user.health_profile
    except Exception:
        profile = None

    name = (profile.full_name if profile and profile.full_name else None) or user.name or user.email
    dob = profile.date_of_birth if profile else None
    sex = _display(profile, "sex") if profile else ""
    blood_type = (profile.blood_type if profile else "") or ""
    genotype = (profile.genotype if profile else "") or ""

    # ---- records ----
    allergies = sorted(
        user.allergies.all(),
        key=lambda a: (0 if a.severity in CRITICAL_SEVERITIES else 1, a.substance.lower()),
    )
    critical = [a for a in allergies if a.severity in CRITICAL_SEVERITIES]
    meds = list(user.medications.filter(active=True).order_by("name"))
    conditions = list(user.conditions.exclude(status="RESOLVED").order_by("status", "-onset_date"))
    past_conditions = list(user.conditions.filter(status="RESOLVED").order_by("-resolved_date"))

    latest: dict[tuple[str, str], Any] = {}
    for v in user.vital_readings.order_by("-measured_at")[:500]:
        key = (v.vital_type, (v.label or "").strip().lower())
        latest.setdefault(key, v)
    vitals = sorted(latest.values(), key=lambda v: v.measured_at, reverse=True)

    upcoming = list(
        user.appointments.filter(status="SCHEDULED", scheduled_for__gte=timezone.now()).order_by("scheduled_for")[:4]
    )
    immunizations = list(user.immunizations.order_by("-administered_on")[:6])
    contacts = list(profile.emergency_contacts.order_by("priority")[:3]) if profile else []

    # ---- pregnancy and care focus (never allowed to break the export) ----
    pregnancy_line = ""
    focus: list[dict[str, Any]] = []
    try:
        from apps.contexts.focus import current_pregnancy, pregnancy_weeks, ranked_focus

        preg = current_pregnancy(user)
        if preg is not None:
            data = preg.pregnancy_data or {}
            weeks = pregnancy_weeks(data)
            due = data.get("estimatedDueDate") or data.get("estimated_due_date")
            if not due and (data.get("lastMenstrualPeriod") or data.get("last_menstrual_period")):
                lmp = datetime.date.fromisoformat(
                    str(data.get("lastMenstrualPeriod") or data.get("last_menstrual_period"))[:10]
                )
                due = (lmp + datetime.timedelta(days=280)).isoformat()
            due_label = _date(datetime.date.fromisoformat(str(due)[:10])) if due else ""
            pregnancy_line = _join(
                [f"{weeks} weeks" if weeks is not None else "", f"due {due_label}" if due_label else ""], ", "
            )
            pregnancy_line = pregnancy_line or "Ongoing"
        focus = [f for f in ranked_focus(user) if f.get("kind") != "elderly"]
    except Exception:  # noqa: BLE001 - the summary must always export
        focus = focus or []

    # ---- sections ----
    allergy_rows = [
        _row(
            a.substance,
            _join([_display(a, "allergy_type"), ", ".join(a.reactions or [])]),
            _pill(_display(a, "severity"), _severity_tone(a.severity)),
            a.notes,
        )
        for a in allergies
    ]
    med_rows = [
        _row(
            _join([m.name, m.dosage], " "),
            _join(
                [
                    m.frequency,
                    m.form,
                    m.route,
                    f"since {_date(m.start_date)}" if m.start_date else "",
                ]
            ),
            "",
            _join([f"For {m.reason}" if m.reason else "", f"Prescribed by {m.prescriber}" if m.prescriber else ""], ". "),
        )
        for m in meds
    ]
    condition_rows = [
        _row(
            c.name,
            _join(
                [
                    _display(c, "severity"),
                    f"since {_date(c.onset_date)}" if c.onset_date else "",
                    f"ICD-10 {c.icd10_code}" if c.icd10_code else "",
                ]
            ),
            _pill(_display(c, "status"), "accent" if c.status == "ACTIVE" else "neutral"),
            f"Diagnosed by {c.diagnosed_by}" if c.diagnosed_by else "",
        )
        for c in conditions
    ]
    if past_conditions:
        condition_rows.append(
            _row(
                "Past conditions",
                ", ".join(
                    f"{c.name} (resolved {_date(c.resolved_date)})" if c.resolved_date else c.name
                    for c in past_conditions[:6]
                ),
            )
        )

    vital_rows = []
    for v in vitals:
        value = _num(v.value) + (f"/{_num(v.value2)}" if v.value2 is not None else "")
        label = v.label if v.vital_type == "CUSTOM" and v.label else _display(v, "vital_type")
        vital_rows.append(
            _row(
                label,
                _join([_date(v.measured_at), v.context]),
                f'<span class="value">{_e(value)} <small>{_e(v.unit)}</small></span>',
            )
        )

    appointment_rows = [
        _row(
            a.title,
            _join([_date(a.scheduled_for), _time(a.scheduled_for), a.facility, a.clinician]),
        )
        for a in upcoming
    ]
    immunization_rows = [
        _row(
            i.vaccine,
            _join(
                [
                    f"dose {i.dose_number}" if i.dose_number else "",
                    f"given {_date(i.administered_on)}",
                    f"next due {_date(i.next_due)}" if i.next_due else "",
                ]
            ),
        )
        for i in immunizations
    ]
    contact_rows = [
        _row(ec.name, ec.relationship or "", f'<span class="value">{_e(ec.phone)}</span>')
        for ec in contacts
    ]

    # ---- warning band ----
    warnings = []
    for a in critical:
        reactions = ", ".join(a.reactions or [])
        warnings.append(
            f"<li><b>{_e(a.substance)}</b>: {_e(_display(a, 'severity').lower())} allergy"
            + (f" ({_e(reactions)})" if reactions else "")
            + "</li>"
        )
    if pregnancy_line:
        warnings.append(f"<li><b>Pregnant</b>: {_e(pregnancy_line)}. Check medicines and doses for pregnancy.</li>")
    alerts_html = (
        f'<section class="alerts"><h2>Check before treating</h2><ul>{"".join(warnings)}</ul></section>'
        if warnings
        else ""
    )

    focus_html = ""
    if focus:
        items = "".join(
            f'<li><span class="rank">{f["rank"]}</span><span><b>{_e(f["label"])}</b> '
            f'<span class="why">{_e(f.get("reason", ""))}</span></span></li>'
            for f in focus
        )
        focus_html = f'<section class="focus"><h2>Care focus, in order of priority</h2><ol>{items}</ol></section>'

    def fact(label: str, value: str, sub: str = "") -> str:
        sub_html = f'<span class="sub">{_e(sub)}</span>' if sub else ""
        return (
            f'<div class="fact"><dt>{_e(label)}</dt>'
            f'<dd>{_e(value or "Not recorded")} {sub_html}</dd></div>'
        )

    facts_html = "".join(
        [
            fact("Age", _age(dob), f"born {_date(dob)}" if dob else ""),
            fact("Sex", sex),
            fact("Blood type", blood_type),
            fact("Genotype", genotype),
        ]
    )

    sections = [
        _section(
            "Allergies",
            allergy_rows,
            "No allergies recorded",
            len(allergies),
            "danger" if critical else "",
        ),
        _section("Current medications", med_rows, "No active medications", len(meds)),
        _section("Conditions", condition_rows, "No active conditions", len(conditions)),
        _section("Latest measurements", vital_rows, "No measurements recorded", len(vitals)),
        _section("Upcoming appointments", appointment_rows, "No upcoming appointments", len(upcoming)),
        _section("Emergency contacts", contact_rows, "No emergency contacts recorded", len(contacts)),
    ]
    if immunization_rows:
        sections.insert(5, _section("Immunisations", immunization_rows, "", len(immunizations)))

    generated = timezone.localtime(timezone.now())
    generated_label = f"{_date(generated)}, {_time(generated)}"

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Clinical summary: {_e(name)}</title>
<style>{_CSS}</style>
</head>
<body>
<div class="page">
  <header class="top">
    <div class="brand"><span class="mark">+</span>myHealthLog</div>
    <p class="doc">Clinical summary · generated {_e(generated_label)}</p>
  </header>

  <section class="patient">
    <p class="eyebrow">Patient</p>
    <h1>{_e(name)}</h1>
    <dl class="facts">{facts_html}</dl>
  </section>

  {alerts_html}
  {focus_html}

  <main class="grid">
    {"".join(sections)}
  </main>

  <footer class="footer">
    Generated by myHealthLog on {_e(generated_label)} from the patient's own record.
    Some entries are self-reported. This summary is for information and does not replace
    clinical judgement: confirm with the patient or their clinician before treating.
  </footer>
</div>
</body>
</html>"""
