"""
Clinical HTML summary builder for myHealthLog.

Produces a self-contained, print-friendly single-page HTML document
that a clinician can read in 60 seconds: who this is, what can kill them,
what they take, and their latest numbers.

Design notes:
  - Self-contained: all styles are inline so it opens and prints anywhere.
  - No external resources: usable offline on a USB stick.
  - Print-friendly: uses @media print rules baked into the inline style.
"""

from datetime import date


def _age(dob) -> str:
    if dob is None:
        return "—"
    today = date.today()
    years = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
    return str(years)


def _escape(text: str) -> str:
    """Minimal HTML escaping — not used for user-controlled dangerous contexts."""
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


_CSS = """
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, sans-serif; font-size: 14px; color: #111; background: #fff; padding: 24px; }
h1 { font-size: 22px; margin-bottom: 4px; }
.subtitle { color: #555; margin-bottom: 20px; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
.card { border: 1px solid #ddd; border-radius: 6px; padding: 14px; }
.card h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; color: #555; margin-bottom: 8px; border-bottom: 1px solid #eee; padding-bottom: 6px; }
.critical { border-left: 4px solid #dc2626; }
.warning { border-left: 4px solid #f59e0b; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #f0f0f0; }
th { background: #f8f8f8; font-weight: 600; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 700; }
.badge-red { background: #fee2e2; color: #b91c1c; }
.badge-yellow { background: #fef3c7; color: #92400e; }
.badge-green { background: #d1fae5; color: #065f46; }
.footer { margin-top: 24px; font-size: 11px; color: #aaa; border-top: 1px solid #eee; padding-top: 10px; }
@media print { body { padding: 8px; } .card { break-inside: avoid; } }
"""


def build_html_summary(user) -> str:
    """Produce a self-contained clinical summary HTML string."""
    try:
        profile = user.health_profile
    except Exception:
        profile = None

    name = _escape(profile.full_name if profile else user.name or user.email)
    dob = profile.date_of_birth if profile else None
    age = _age(dob)
    sex = _escape(profile.sex or "—") if profile else "—"
    blood_type = _escape(profile.blood_type or "—") if profile else "—"
    genotype = _escape(profile.genotype or "—") if profile else "—"

    # Critical allergies
    list(
        user.allergies.filter(severity__in=["SEVERE", "ANAPHYLAXIS"])
    )
    all_allergies = list(user.allergies.all())

    # Active medications
    active_meds = list(user.medications.filter(active=True))

    # Active conditions
    active_conditions = list(user.conditions.filter(status="ACTIVE"))

    # Latest vitals (one per type)

    vitals_qs = user.vital_readings.order_by("vital_type", "-measured_at")
    seen_types: set = set()
    latest_vitals = []
    for v in vitals_qs:
        key = (v.vital_type, v.label)
        if key not in seen_types:
            seen_types.add(key)
            latest_vitals.append(v)

    # Emergency contacts
    contacts = []
    if profile:
        contacts = list(profile.emergency_contacts.order_by("priority")[:3])

    # Build HTML sections
    allergy_rows = ""
    for a in all_allergies:
        badge_class = "badge-red" if a.is_critical else "badge-yellow"
        reactions = ", ".join(a.reactions or []) or "—"
        allergy_rows += (
            f"<tr><td>{_escape(a.substance)}</td>"
            f"<td><span class='badge {badge_class}'>{_escape(a.severity)}</span></td>"
            f"<td>{_escape(reactions)}</td></tr>"
        )
    if not allergy_rows:
        allergy_rows = "<tr><td colspan='3'>No allergies recorded</td></tr>"

    med_rows = ""
    for m in active_meds:
        med_rows += (
            f"<tr><td>{_escape(m.name)}</td>"
            f"<td>{_escape(m.dosage)}</td>"
            f"<td>{_escape(m.frequency)}</td>"
            f"<td>{_escape(m.prescriber or '—')}</td></tr>"
        )
    if not med_rows:
        med_rows = "<tr><td colspan='4'>No active medications</td></tr>"

    cond_rows = ""
    for c in active_conditions:
        sev = _escape(c.severity or "—")
        cond_rows += (
            f"<tr><td>{_escape(c.name)}</td>"
            f"<td>{sev}</td>"
            f"<td>{_escape(c.onset_date.isoformat() if c.onset_date else '—')}</td></tr>"
        )
    if not cond_rows:
        cond_rows = "<tr><td colspan='3'>No active conditions</td></tr>"

    vital_rows = ""
    for v in latest_vitals:
        val = f"{v.value}/{v.value2}" if v.value2 else str(v.value)
        recorded = v.measured_at.date().isoformat() if v.measured_at else "—"
        vital_rows += (
            f"<tr><td>{_escape(v.label or v.vital_type)}</td>"
            f"<td>{_escape(val)} {_escape(v.unit)}</td>"
            f"<td>{_escape(recorded)}</td></tr>"
        )
    if not vital_rows:
        vital_rows = "<tr><td colspan='3'>No measurements recorded</td></tr>"

    contact_rows = ""
    for ec in contacts:
        contact_rows += (
            f"<tr><td>{_escape(ec.name)}</td>"
            f"<td>{_escape(ec.relationship or '—')}</td>"
            f"<td>{_escape(ec.phone)}</td></tr>"
        )
    if not contact_rows:
        contact_rows = "<tr><td colspan='3'>No emergency contacts recorded</td></tr>"

    generated_at = date.today().isoformat()

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Clinical Summary — {name}</title>
<style>{_CSS}</style>
</head>
<body>
<h1>{name}</h1>
<div class="subtitle">
  Age: {age} &nbsp;|&nbsp; Sex: {sex} &nbsp;|&nbsp;
  Blood Type: {blood_type} &nbsp;|&nbsp; Genotype: {genotype}
</div>

<div class="grid">
  <div class="card critical">
    <h2>Critical Allergies</h2>
    <table>
      <thead><tr><th>Substance</th><th>Severity</th><th>Reactions</th></tr></thead>
      <tbody>{allergy_rows}</tbody>
    </table>
  </div>

  <div class="card">
    <h2>Emergency Contacts</h2>
    <table>
      <thead><tr><th>Name</th><th>Relation</th><th>Phone</th></tr></thead>
      <tbody>{contact_rows}</tbody>
    </table>
  </div>
</div>

<div class="grid">
  <div class="card">
    <h2>Active Medications</h2>
    <table>
      <thead><tr><th>Name</th><th>Dose</th><th>Frequency</th><th>Prescriber</th></tr></thead>
      <tbody>{med_rows}</tbody>
    </table>
  </div>

  <div class="card">
    <h2>Active Conditions</h2>
    <table>
      <thead><tr><th>Condition</th><th>Severity</th><th>Since</th></tr></thead>
      <tbody>{cond_rows}</tbody>
    </table>
  </div>
</div>

<div class="card" style="margin-bottom:16px">
  <h2>Latest Measurements</h2>
  <table>
    <thead><tr><th>Vital</th><th>Value</th><th>Recorded</th></tr></thead>
    <tbody>{vital_rows}</tbody>
  </table>
</div>

<div class="footer">
  Generated by myHealthLog on {generated_at}. This document is for informational
  purposes only and does not constitute medical advice. Always verify with the
  patient or their clinician before making treatment decisions.
</div>
</body>
</html>"""
    return html
