"""
HL7 FHIR R4 export for myHealthLog.

What this produces
  A FHIR "transaction" Bundle: every record as a standard FHIR resource, each
  with a request to create it. Any FHIR R4 server (for example HAPI FHIR, Azure
  Health Data Services, Google Cloud Healthcare API) can import the whole file
  with one POST to its base URL, and links between resources (every record
  points at the Patient) are kept because they use urn:uuid references.

How it is built
  The resource shapes are plain dictionaries, and the finished Bundle is checked
  with the open-source `fhir.resources` library (FHIR R4B models, which share
  the R4 resource definitions used here). The library rejects unknown fields,
  wrong data types and missing required elements, so a structurally invalid
  export fails loudly here instead of at the receiving system. What it does not
  check is terminology (whether a code exists in LOINC or ICD-10); the codes
  below are the standard ones published by HL7, LOINC and UCUM.

Mapping
  Profile              -> Patient (+ Observations for blood group and genotype)
  Allergy              -> AllergyIntolerance
  Medication           -> MedicationStatement
  Condition            -> Condition (ICD-10 coding when one is recorded)
  Appointment          -> Appointment
  Immunization         -> Immunization
  Procedure            -> Procedure
  Measurement          -> Observation (LOINC code, UCUM unit, vital-signs category)
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from fhir.resources.R4B.bundle import Bundle

FHIR_VERSION = "4.0.1"

# Code systems (canonical URLs from the FHIR specification).
LOINC = "http://loinc.org"
ICD10 = "http://hl7.org/fhir/sid/icd-10"
UCUM = "http://unitsofmeasure.org"
CONDITION_CLINICAL = "http://terminology.hl7.org/CodeSystem/condition-clinical"
ALLERGY_CLINICAL = "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical"
OBS_CATEGORY = "http://terminology.hl7.org/CodeSystem/observation-category"

GENDER = {"MALE": "male", "FEMALE": "female", "OTHER": "other"}
CONDITION_STATUS = {"ACTIVE": "active", "RESOLVED": "resolved", "IN_REMISSION": "remission"}
APPOINTMENT_STATUS = {"SCHEDULED": "booked", "ATTENDED": "fulfilled", "MISSED": "noshow", "CANCELLED": "cancelled"}
ALLERGY_CATEGORY = {"DRUG": "medication", "FOOD": "food", "ENVIRONMENTAL": "environment"}
ALLERGY_SEVERITY = {"MILD": "mild", "MODERATE": "moderate", "SEVERE": "severe", "ANAPHYLAXIS": "severe"}

# LOINC codes for measurements; True marks the ones in the FHIR vital-signs category.
LOINC_VITALS: dict[str, tuple[str, str, bool]] = {
    "BLOOD_PRESSURE": ("85354-9", "Blood pressure panel with all children optional", True),
    "PULSE": ("8867-4", "Heart rate", True),
    "RESPIRATORY_RATE": ("9279-1", "Respiratory rate", True),
    "TEMPERATURE": ("8310-5", "Body temperature", True),
    "SPO2": ("59408-5", "Oxygen saturation in Arterial blood by Pulse oximetry", True),
    "WEIGHT": ("29463-7", "Body weight", True),
    "HEIGHT": ("8302-2", "Body height", True),
    "BMI": ("39156-5", "Body mass index (BMI) [Ratio]", True),
    "BLOOD_GLUCOSE": ("2339-0", "Glucose [Mass/volume] in Blood", False),
    "PEAK_FLOW": ("19935-6", "Maximum expiratory gas flow Respiratory system airway by Peak flow meter", False),
    "PAIN": ("72514-3", "Pain severity - 0-10 verbal numeric rating [Score] - Reported", False),
}
# Units as typed -> UCUM codes.
UCUM_UNITS = {
    "mmhg": "mm[Hg]", "bpm": "/min", "beats/min": "/min", "/min": "/min", "breaths/min": "/min",
    "%": "%", "kg": "kg", "g": "g", "lb": "[lb_av]", "lbs": "[lb_av]", "cm": "cm", "m": "m", "in": "[in_i]",
    "°c": "Cel", "c": "Cel", "°f": "[degF]", "f": "[degF]", "mmol/l": "mmol/L", "mg/dl": "mg/dL",
    "kg/m2": "kg/m2", "kg/m²": "kg/m2", "l/min": "L/min",
}


def _iso(value) -> str | None:
    if value is None or value == "":
        return None
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return str(value)


def _ref(patient_id: str) -> dict[str, str]:
    return {"reference": f"urn:uuid:{patient_id}"}


def _quantity(value, unit: str) -> dict[str, Any]:
    q: dict[str, Any] = {"value": float(value), "unit": unit or ""}
    code = UCUM_UNITS.get((unit or "").strip().lower())
    if code:
        q.update(system=UCUM, code=code)
    return q


def _clean(obj):
    """Drop None, empty strings, lists and dicts: FHIR does not allow empty elements."""
    if isinstance(obj, dict):
        out = {k: _clean(v) for k, v in obj.items()}
        return {k: v for k, v in out.items() if v not in (None, "", [], {})}
    if isinstance(obj, list):
        return [x for x in (_clean(v) for v in obj) if x not in (None, "", [], {})]
    return obj


# ---------------------------------------------------------------------------
# Resources
# ---------------------------------------------------------------------------


def _patient(user, profile, patient_id: str) -> dict:
    r: dict[str, Any] = {"resourceType": "Patient", "id": patient_id}
    name = (getattr(profile, "full_name", "") or user.name or "").strip()
    if name:
        r["name"] = [{"text": name}]
    if profile is None:
        return r
    if profile.sex:
        r["gender"] = GENDER.get(profile.sex, "unknown")
    r["birthDate"] = _iso(profile.date_of_birth)
    if profile.phone:
        r["telecom"] = [{"system": "phone", "value": profile.phone, "use": "mobile"}]
    parts = [profile.address, profile.city, profile.state, profile.country]
    if any(parts):
        r["address"] = [{"text": ", ".join(p for p in parts if p), "city": profile.city,
                         "state": profile.state, "country": profile.country}]
    r["contact"] = [
        {"name": {"text": ec.name}, "relationship": [{"text": ec.relationship}] if ec.relationship else [],
         "telecom": [{"system": "phone", "value": ec.phone}]}
        for ec in profile.emergency_contacts.order_by("priority")
    ]
    return r


def _profile_observation(patient_id: str, kind: str, value: str) -> dict:
    code = ({"coding": [{"system": LOINC, "code": "882-1", "display": "ABO and Rh group [Type] in Blood"}],
             "text": "Blood group"} if kind == "bloodgroup" else {"text": "Haemoglobin genotype"})
    return {"resourceType": "Observation", "id": str(uuid.uuid5(uuid.UUID(patient_id), kind)),
            "status": "final", "code": code, "subject": _ref(patient_id), "valueString": value}


def _allergy(a, patient_id: str) -> dict:
    r: dict[str, Any] = {
        "resourceType": "AllergyIntolerance",
        "id": str(a.id),
        "patient": _ref(patient_id),
        "code": {"text": a.substance},
        "clinicalStatus": {"coding": [{"system": ALLERGY_CLINICAL, "code": "active"}]},
        "criticality": "high" if a.severity in ("SEVERE", "ANAPHYLAXIS") else "low",
        "onsetDateTime": _iso(a.first_reaction_date),
        "note": [{"text": a.notes}] if a.notes else [],
    }
    if a.allergy_type in ALLERGY_CATEGORY:
        r["category"] = [ALLERGY_CATEGORY[a.allergy_type]]
    if a.severity:
        r["reaction"] = [{
            "severity": ALLERGY_SEVERITY.get(a.severity, "moderate"),
            "manifestation": [{"text": x} for x in (a.reactions or [])] or [{"text": "Not recorded"}],
        }]
    return r


def _medication(m, patient_id: str) -> dict:
    return {
        "resourceType": "MedicationStatement",
        "id": str(m.id),
        "status": "active" if m.active else "stopped",
        "medicationCodeableConcept": {"text": m.name},
        "subject": _ref(patient_id),
        "effectivePeriod": {"start": _iso(m.start_date), "end": _iso(m.end_date)},
        "dosage": [{"text": f"{m.dosage} {m.frequency}".strip()}] if (m.dosage or m.frequency) else [],
        "reasonCode": [{"text": m.reason}] if m.reason else [],
        "note": [{"text": m.notes}] if m.notes else [],
    }


def _condition(c, patient_id: str) -> dict:
    code: dict[str, Any] = {"text": c.name}
    if c.icd10_code:
        code["coding"] = [{"system": ICD10, "code": c.icd10_code, "display": c.name}]
    return {
        "resourceType": "Condition",
        "id": str(c.id),
        "clinicalStatus": {"coding": [{"system": CONDITION_CLINICAL,
                                       "code": CONDITION_STATUS.get(c.status, "active")}]},
        "code": code,
        "subject": _ref(patient_id),
        "onsetDateTime": _iso(c.onset_date),
        "abatementDateTime": _iso(c.resolved_date),
        "note": [{"text": c.notes}] if c.notes else [],
    }


def _appointment(a, patient_id: str) -> dict:
    # FHIR requires both start and end on a booked appointment (invariant app-3).
    # myHealthLog does not record how long a visit lasts, so end is set to start.
    start = a.scheduled_for
    return {
        "resourceType": "Appointment",
        "id": str(a.id),
        "status": APPOINTMENT_STATUS.get(a.status, "booked"),
        "description": a.title,
        "start": _iso(start),
        "end": _iso(start),
        "reasonCode": [{"text": a.reason}] if a.reason else [],
        "comment": f"Facility: {a.facility}" if a.facility else None,
        "participant": [{"actor": _ref(patient_id), "status": "accepted"}],
    }


def _immunization(i, patient_id: str) -> dict:
    return {
        "resourceType": "Immunization",
        "id": str(i.id),
        "status": "completed",
        "vaccineCode": {"text": i.vaccine},
        "patient": _ref(patient_id),
        "occurrenceDateTime": _iso(i.administered_on),
        "protocolApplied": [{"doseNumberPositiveInt": i.dose_number}] if i.dose_number else [],
        "note": [{"text": i.notes}] if i.notes else [],
    }


def _procedure(p, patient_id: str) -> dict:
    return {
        "resourceType": "Procedure",
        "id": str(p.id),
        "status": "completed",
        "code": {"text": p.name},
        "subject": _ref(patient_id),
        "performedDateTime": _iso(p.performed_on),
        "outcome": {"text": p.outcome} if p.outcome else None,
        "note": [{"text": p.notes}] if p.notes else [],
    }


def _vital(v, patient_id: str) -> dict:
    loinc = LOINC_VITALS.get(v.vital_type)
    if v.vital_type == "BLOOD_GLUCOSE" and "mmol" in (v.unit or "").lower():
        loinc = ("15074-8", "Glucose [Moles/volume] in Blood", False)
    if loinc:
        code = {"coding": [{"system": LOINC, "code": loinc[0], "display": loinc[1]}], "text": v.label or loinc[1]}
    else:
        code = {"text": v.label or v.vital_type.replace("_", " ").title()}
    r: dict[str, Any] = {
        "resourceType": "Observation",
        "id": str(v.id),
        "status": "final",
        "code": code,
        "subject": _ref(patient_id),
        "effectiveDateTime": _iso(v.measured_at),
        "note": [{"text": v.notes}] if v.notes else [],
    }
    if loinc and loinc[2]:
        r["category"] = [{"coding": [{"system": OBS_CATEGORY, "code": "vital-signs", "display": "Vital Signs"}]}]
    if v.vital_type == "BLOOD_PRESSURE" and v.value2 is not None:
        r["component"] = [
            {"code": {"coding": [{"system": LOINC, "code": "8480-6", "display": "Systolic blood pressure"}]},
             "valueQuantity": _quantity(v.value, v.unit)},
            {"code": {"coding": [{"system": LOINC, "code": "8462-4", "display": "Diastolic blood pressure"}]},
             "valueQuantity": _quantity(v.value2, v.unit)},
        ]
    else:
        r["valueQuantity"] = _quantity(v.value, v.unit)
    return r


# ---------------------------------------------------------------------------
# Bundle
# ---------------------------------------------------------------------------


def _entry(resource: dict) -> dict:
    return {
        "fullUrl": f"urn:uuid:{resource['id']}",
        "resource": resource,
        "request": {"method": "POST", "url": resource["resourceType"]},
    }


def build_fhir_bundle(user) -> dict[str, Any]:
    """The user's whole record as a validated FHIR transaction Bundle (a dict ready for JSON)."""
    from apps.profiles.models import HealthProfile

    # Read the profile fresh: `user.health_profile` can be a stale cached copy.
    profile = HealthProfile.objects.filter(user=user).first()
    patient_id = str(user.id)

    resources = [_patient(user, profile, patient_id)]
    if profile is not None and profile.blood_type:
        resources.append(_profile_observation(patient_id, "bloodgroup", profile.blood_type))
    if profile is not None and profile.genotype:
        resources.append(_profile_observation(patient_id, "genotype", profile.genotype))
    resources += [_allergy(a, patient_id) for a in user.allergies.all()]
    resources += [_medication(m, patient_id) for m in user.medications.all()]
    resources += [_condition(c, patient_id) for c in user.conditions.all()]
    resources += [_appointment(a, patient_id) for a in user.appointments.all()]
    resources += [_immunization(i, patient_id) for i in user.immunizations.all()]
    resources += [_procedure(p, patient_id) for p in user.procedures.all()]
    resources += [_vital(v, patient_id) for v in user.vital_readings.all()]

    bundle = _clean({
        "resourceType": "Bundle",
        "id": str(uuid.uuid5(uuid.UUID(patient_id), "export")),
        "type": "transaction",
        "entry": [_entry(r) for r in resources],
    })
    # Raises pydantic.ValidationError if anything is not valid FHIR structure.
    Bundle.model_validate(bundle)
    return bundle
