"""
FHIR R4 Bundle builder for myHealthLog.

Produces an HL7 FHIR R4 Collection Bundle from a user's complete health record.

Design notes:
  - Faithfully maps each myHealthLog record type to its canonical FHIR resource.
  - Uses LOINC codes for vital signs and ICD-10 for conditions where available.
  - Falls back to `text` codings when a formal code is absent — the bundle
    remains valid; it just won't be auto-matched by terminology servers.
  - Does NOT claim clinical FHIR conformance; this is a patient-facing export.
"""

from datetime import date, datetime
from typing import Any

# ---------------------------------------------------------------------------
# FHIR constants
# ---------------------------------------------------------------------------

FHIR_VERSION = "4.0.1"
BUNDLE_PROFILE = "http://hl7.org/fhir/StructureDefinition/Bundle"

FHIR_GENDER_MAP = {
    "MALE": "male",
    "FEMALE": "female",
    "OTHER": "other",
}

LOINC_VITALS: dict[str, dict[str, str]] = {
    "BLOOD_PRESSURE": {"code": "85354-9", "display": "Blood pressure panel"},
    "PULSE": {"code": "8867-4", "display": "Heart rate"},
    "RESPIRATORY_RATE": {"code": "9279-1", "display": "Respiratory rate"},
    "TEMPERATURE": {"code": "8310-5", "display": "Body temperature"},
    "SPO2": {"code": "59408-5", "display": "Oxygen saturation"},
    "BLOOD_GLUCOSE": {"code": "15074-8", "display": "Glucose in Blood"},
    "WEIGHT": {"code": "29463-7", "display": "Body weight"},
    "HEIGHT": {"code": "8302-2", "display": "Body height"},
    "BMI": {"code": "39156-5", "display": "Body mass index"},
    "PEAK_FLOW": {"code": "19935-6", "display": "Peak expiratory flow"},
}

CONDITION_STATUS_MAP = {
    "ACTIVE": "active",
    "RESOLVED": "resolved",
    "IN_REMISSION": "remission",
}

APPOINTMENT_STATUS_MAP = {
    "SCHEDULED": "booked",
    "ATTENDED": "fulfilled",
    "MISSED": "noshow",
    "CANCELLED": "cancelled",
}

ALLERGY_CATEGORY_MAP = {
    "DRUG": ["medication"],
    "FOOD": ["food"],
    "ENVIRONMENTAL": ["environment"],
    "OTHER": ["biologic"],
}

ALLERGY_SEVERITY_MAP = {
    "MILD": "mild",
    "MODERATE": "moderate",
    "SEVERE": "severe",
    "ANAPHYLAXIS": "severe",
}

FHIR_SYSTEM = "http://hl7.org/fhir"
LOINC_SYSTEM = "http://loinc.org"
ICD10_SYSTEM = "http://hl7.org/fhir/sid/icd-10"
SNOMED_SYSTEM = "http://snomed.info/sct"


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _iso(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, date | datetime):
        return value.isoformat()
    return str(value)


def _entry(resource: dict) -> dict:
    return {
        "fullUrl": f"urn:uuid:{resource['id']}",
        "resource": resource,
    }


# ---------------------------------------------------------------------------
# Resource builders
# ---------------------------------------------------------------------------

def _patient(profile, patient_id: str) -> dict:
    resource: dict[str, Any] = {
        "resourceType": "Patient",
        "id": patient_id,
    }
    if profile.full_name:
        resource["name"] = [{"text": profile.full_name}]
    if profile.sex:
        resource["gender"] = FHIR_GENDER_MAP.get(profile.sex, "unknown")
    if profile.date_of_birth:
        resource["birthDate"] = _iso(profile.date_of_birth)
    if profile.phone:
        resource["telecom"] = [{"system": "phone", "value": profile.phone, "use": "mobile"}]

    address_parts = [profile.address, profile.city, profile.state, profile.country]
    if any(address_parts):
        resource["address"] = [
            {
                "text": ", ".join(p for p in address_parts if p),
                "city": profile.city or None,
                "state": profile.state or None,
                "country": profile.country or None,
            }
        ]

    contacts = []
    for ec in profile.emergency_contacts.order_by("priority"):
        contacts.append({
            "name": {"text": ec.name},
            "relationship": [{"text": ec.relationship}] if ec.relationship else [],
            "telecom": [{"system": "phone", "value": ec.phone}],
        })
    if contacts:
        resource["contact"] = contacts

    return resource


def _blood_type_obs(profile, patient_id: str, obs_id: str) -> dict | None:
    if not profile.blood_type:
        return None
    return {
        "resourceType": "Observation",
        "id": obs_id,
        "status": "final",
        "code": {
            "coding": [{"system": LOINC_SYSTEM, "code": "883-9", "display": "ABO and Rh group"}],
            "text": "Blood group",
        },
        "subject": {"reference": f"urn:uuid:{patient_id}"},
        "valueString": profile.blood_type,
    }


def _genotype_obs(profile, patient_id: str, obs_id: str) -> dict | None:
    if not profile.genotype:
        return None
    return {
        "resourceType": "Observation",
        "id": obs_id,
        "status": "final",
        "code": {"text": "Haemoglobin genotype"},
        "subject": {"reference": f"urn:uuid:{patient_id}"},
        "valueString": profile.genotype,
    }


def _allergy(a, patient_id: str) -> dict:
    resource: dict[str, Any] = {
        "resourceType": "AllergyIntolerance",
        "id": str(a.id),
        "patient": {"reference": f"urn:uuid:{patient_id}"},
        "code": {"text": a.substance},
        "category": ALLERGY_CATEGORY_MAP.get(a.allergy_type, ["biologic"]),
        "criticality": "high" if a.severity in ("SEVERE", "ANAPHYLAXIS") else "low",
        "clinicalStatus": {
            "coding": [{
                "system": f"{FHIR_SYSTEM}/ValueSet/allergyintolerance-clinical",
                "code": "active",
            }]
        },
    }
    if a.severity:
        resource["reaction"] = [{
            "severity": ALLERGY_SEVERITY_MAP.get(a.severity, "moderate"),
            "manifestation": [
                {"text": r} for r in (a.reactions or [])
            ] or [{"text": "unknown"}],
        }]
    if a.first_reaction_date:
        resource["onsetDateTime"] = _iso(a.first_reaction_date)
    if a.notes:
        resource["note"] = [{"text": a.notes}]
    return resource


def _medication(m, patient_id: str) -> dict:
    resource: dict[str, Any] = {
        "resourceType": "MedicationStatement",
        "id": str(m.id),
        "subject": {"reference": f"urn:uuid:{patient_id}"},
        "status": "active" if m.active else "stopped",
        "medicationCodeableConcept": {"text": m.name},
        "effectivePeriod": {
            "start": _iso(m.start_date),
        },
    }
    if m.end_date:
        resource["effectivePeriod"]["end"] = _iso(m.end_date)
    if m.dosage or m.frequency:
        resource["dosage"] = [{
            "text": f"{m.dosage} {m.frequency}".strip(),
        }]
    if m.reason:
        resource["reasonCode"] = [{"text": m.reason}]
    if m.notes:
        resource["note"] = [{"text": m.notes}]
    return resource


def _condition(c, patient_id: str) -> dict:
    resource: dict[str, Any] = {
        "resourceType": "Condition",
        "id": str(c.id),
        "subject": {"reference": f"urn:uuid:{patient_id}"},
        "code": {"text": c.name},
        "clinicalStatus": {
            "coding": [{
                "system": f"{FHIR_SYSTEM}/ValueSet/condition-clinical",
                "code": CONDITION_STATUS_MAP.get(c.status, "active"),
            }]
        },
    }
    if c.icd10_code:
        resource["code"]["coding"] = [{
            "system": ICD10_SYSTEM,
            "code": c.icd10_code,
            "display": c.name,
        }]
    if c.onset_date:
        resource["onsetDateTime"] = _iso(c.onset_date)
    if c.resolved_date:
        resource["abatementDateTime"] = _iso(c.resolved_date)
    if c.notes:
        resource["note"] = [{"text": c.notes}]
    return resource


def _appointment(a, patient_id: str) -> dict:
    resource: dict[str, Any] = {
        "resourceType": "Appointment",
        "id": str(a.id),
        "status": APPOINTMENT_STATUS_MAP.get(a.status, "booked"),
        "description": a.title,
        "participant": [{"actor": {"reference": f"urn:uuid:{patient_id}"}, "status": "accepted"}],
    }
    if a.scheduled_for:
        resource["start"] = _iso(a.scheduled_for)
    if a.reason:
        resource["reasonCode"] = [{"text": a.reason}]
    if a.facility:
        resource["comment"] = f"Facility: {a.facility}"
    return resource


def _immunization(i, patient_id: str) -> dict:
    return {
        "resourceType": "Immunization",
        "id": str(i.id),
        "status": "completed",
        "patient": {"reference": f"urn:uuid:{patient_id}"},
        "vaccineCode": {"text": i.vaccine},
        "occurrenceDateTime": _iso(i.administered_on),
        "doseQuantity": {"value": i.dose_number} if i.dose_number else None,
    }


def _procedure(p, patient_id: str) -> dict:
    return {
        "resourceType": "Procedure",
        "id": str(p.id),
        "subject": {"reference": f"urn:uuid:{patient_id}"},
        "status": "completed",
        "code": {"text": p.name},
        "performedDateTime": _iso(p.performed_on),
        "note": [{"text": p.outcome}] if p.outcome else None,
    }


def _vital(v, patient_id: str) -> dict:
    loinc = LOINC_VITALS.get(v.vital_type)
    code_block: dict[str, Any] = {}
    if loinc:
        code_block = {
            "coding": [{"system": LOINC_SYSTEM, "code": loinc["code"], "display": loinc["display"]}],
            "text": v.label or loinc["display"],
        }
    else:
        code_block = {"text": v.label or v.vital_type}

    resource: dict[str, Any] = {
        "resourceType": "Observation",
        "id": str(v.id),
        "status": "final",
        "code": code_block,
        "subject": {"reference": f"urn:uuid:{patient_id}"},
        "effectiveDateTime": _iso(v.measured_at),
    }

    if v.vital_type == "BLOOD_PRESSURE" and v.value2:
        resource["component"] = [
            {
                "code": {"coding": [{"system": LOINC_SYSTEM, "code": "8480-6", "display": "Systolic"}]},
                "valueQuantity": {"value": float(v.value), "unit": v.unit},
            },
            {
                "code": {"coding": [{"system": LOINC_SYSTEM, "code": "8462-4", "display": "Diastolic"}]},
                "valueQuantity": {"value": float(v.value2), "unit": v.unit},
            },
        ]
    else:
        resource["valueQuantity"] = {
            "value": float(v.value),
            "unit": v.unit,
        }

    if v.notes:
        resource["note"] = [{"text": v.notes}]
    return resource


# ---------------------------------------------------------------------------
# Main builder
# ---------------------------------------------------------------------------

def build_fhir_bundle(user) -> dict[str, Any]:
    """
    Produce an HL7 FHIR R4 Collection Bundle for the given user.

    Includes: Patient, blood-type Observation, genotype Observation, all
    AllergyIntolerance, MedicationStatement, Condition, Appointment,
    Immunization, Procedure, and Observation (vitals) resources.
    """
    try:
        profile = user.health_profile
    except Exception:
        profile = None

    patient_id = str(user.id)
    entries = []

    # Patient
    if profile:
        entries.append(_entry(_patient(profile, patient_id)))
        bt = _blood_type_obs(profile, patient_id, f"{patient_id}-bloodgroup")
        if bt:
            entries.append(_entry(bt))
        gt = _genotype_obs(profile, patient_id, f"{patient_id}-genotype")
        if gt:
            entries.append(_entry(gt))

    for a in user.allergies.all():
        entries.append(_entry(_allergy(a, patient_id)))

    for m in user.medications.all():
        entries.append(_entry(_medication(m, patient_id)))

    for c in user.conditions.all():
        entries.append(_entry(_condition(c, patient_id)))

    for a in user.appointments.all():
        entries.append(_entry(_appointment(a, patient_id)))

    for i in user.immunizations.all():
        entries.append(_entry(_immunization(i, patient_id)))

    for p in user.procedures.all():
        entries.append(_entry(_procedure(p, patient_id)))

    for v in user.vital_readings.all():
        entries.append(_entry(_vital(v, patient_id)))

    return {
        "resourceType": "Bundle",
        "type": "collection",
        "id": f"mhl-export-{patient_id}",
        "meta": {"profile": [BUNDLE_PROFILE]},
        "entry": entries,
    }
