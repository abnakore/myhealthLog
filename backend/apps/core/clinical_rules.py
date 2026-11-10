"""
Fixed clinical rules shared by the record review, the Health Copilot and the
care-focus ranking.

Everything here is deterministic on purpose. The AI model explains and adds
observations, but whether a medicine clashes with an allergy, or a reading is
in a danger band, is decided by these rules so the result is the same every
time and every flag can name the rule that raised it. The thresholds are the
standard adult screening bands used by the frontend rule engine
(src/lib/summaryInsights.ts); they flag for review and never diagnose.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

# ---------------------------------------------------------------------------
# Medicine classes
# ---------------------------------------------------------------------------

# Medicine classes an allergy name can point at (kept in step with the
# frontend rule engine in src/lib/summaryInsights.ts).
DRUG_CLASSES: dict[str, list[str]] = {
    "penicillin": ["penicillin", "amoxicillin", "ampicillin", "augmentin", "co-amoxiclav", "flucloxacillin",
                   "cloxacillin", "ampiclox"],
    "sulfonamide": ["sulfamethoxazole", "co-trimoxazole", "septrin", "bactrim", "sulfasalazine", "fansidar"],
    "nsaid": ["ibuprofen", "diclofenac", "naproxen", "aspirin", "ketoprofen", "piroxicam", "meloxicam", "celecoxib",
              "indomethacin"],
    "opioid": ["codeine", "morphine", "tramadol", "pethidine", "oxycodone"],
    "cephalosporin": ["ceftriaxone", "cefuroxime", "cefalexin", "cephalexin", "cefixime"],
    "quinolone": ["ciprofloxacin", "levofloxacin", "ofloxacin"],
}

ALLERGY_ALIASES: dict[str, str] = {
    "penicillin": "penicillin", "penicillins": "penicillin", "sulfa": "sulfonamide", "sulpha": "sulfonamide",
    "sulfonamide": "sulfonamide", "nsaid": "nsaid", "nsaids": "nsaid", "aspirin": "nsaid", "ibuprofen": "nsaid",
    "codeine": "opioid", "opioid": "opioid", "morphine": "opioid", "cephalosporin": "cephalosporin",
    "quinolone": "quinolone", "ciprofloxacin": "quinolone",
}

# Groups used only by the condition and pregnancy cautions below.
_GROUPS: dict[str, list[str]] = {
    "nsaid": DRUG_CLASSES["nsaid"],
    "ace_inhibitor": ["lisinopril", "enalapril", "ramipril", "captopril", "perindopril"],
    "arb": ["losartan", "valsartan", "telmisartan", "irbesartan", "candesartan"],
    "statin": ["atorvastatin", "simvastatin", "rosuvastatin", "pravastatin", "lovastatin"],
    "warfarin": ["warfarin"],
    "retinoid": ["isotretinoin", "acitretin"],
    "methotrexate": ["methotrexate"],
    "tetracycline": ["doxycycline", "tetracycline", "minocycline"],
    "nonselective_beta_blocker": ["propranolol", "nadolol", "timolol", "sotalol"],
    "decongestant": ["pseudoephedrine", "phenylephrine"],
    "metformin": ["metformin"],
    "corticosteroid": ["prednisolone", "prednisone", "dexamethasone", "hydrocortisone", "methylprednisolone"],
    "g6pd_oxidant": ["primaquine", "dapsone", "nitrofurantoin", "rasburicase"] + DRUG_CLASSES["sulfonamide"],
}


def med_class(name: str) -> str | None:
    """The allergy-relevant class a medicine name belongs to, if any."""
    n = (name or "").lower()
    for cls, members in DRUG_CLASSES.items():
        if any(m in n for m in members):
            return cls
    return None


def in_group(name: str, group: str) -> bool:
    n = (name or "").lower()
    return any(m in n for m in _GROUPS.get(group, []))


def allergy_classes(allergies) -> dict[str, str]:
    """Map drug class -> allergy substance for every allergy that names a class."""
    out: dict[str, str] = {}
    for a in allergies:
        for word in re.split(r"[^a-z]+", (a.substance or "").lower()):
            if word in ALLERGY_ALIASES:
                out.setdefault(ALLERGY_ALIASES[word], a.substance)
    return out


# ---------------------------------------------------------------------------
# Findings
# ---------------------------------------------------------------------------

LEVEL_ORDER = {"critical": 0, "warning": 1, "info": 2}


@dataclass
class Finding:
    level: str          # critical | warning | info
    rule: str           # short id of the rule that raised it
    title: str
    detail: str
    data: dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {"level": self.level, "rule": self.rule, "title": self.title, "detail": self.detail,
                "data": self.data}


def sort_findings(findings: list[Finding]) -> list[Finding]:
    return sorted(findings, key=lambda f: LEVEL_ORDER.get(f.level, 9))


# ---------------------------------------------------------------------------
# Medicine checks
# ---------------------------------------------------------------------------

# (condition pattern, medicine group, level, message). Conservative, widely
# documented cautions only; each asks the patient to confirm with a clinician.
CONDITION_CAUTIONS: list[tuple[str, str, str, str]] = [
    (r"kidney|renal|ckd|nephr", "nsaid", "warning",
     "NSAIDs can make kidney function worse. Paracetamol is usually the safer painkiller."),
    (r"kidney|renal|ckd|nephr", "metformin", "info",
     "The dose of metformin depends on kidney function, so it needs regular review."),
    (r"ulcer|gastric bleed|gi bleed|gastrointestinal bleed", "nsaid", "warning",
     "NSAIDs can cause stomach bleeding and are usually avoided with a history of ulcers."),
    (r"heart failure|cardiac failure", "nsaid", "warning",
     "NSAIDs can cause fluid retention and worsen heart failure."),
    (r"asthma", "nonselective_beta_blocker", "warning",
     "Non-selective beta-blockers can trigger breathing problems in people with asthma."),
    (r"asthma", "nsaid", "info",
     "Some people with asthma react badly to aspirin and other NSAIDs."),
    (r"hypertension|high blood pressure", "decongestant", "warning",
     "Decongestants can raise blood pressure."),
    (r"hypertension|high blood pressure", "nsaid", "info",
     "NSAIDs can raise blood pressure and weaken some blood pressure medicines."),
    (r"diabet", "corticosteroid", "info",
     "Steroid medicines can raise blood sugar, so readings may need closer watching."),
    (r"g6pd", "g6pd_oxidant", "warning",
     "This medicine can cause red blood cells to break down in people with G6PD deficiency."),
]

PREGNANCY_CAUTIONS: list[tuple[str, str, str]] = [
    ("ace_inhibitor", "warning", "ACE inhibitors are generally avoided in pregnancy."),
    ("arb", "warning", "ARB blood pressure medicines are generally avoided in pregnancy."),
    ("statin", "warning", "Statins are generally stopped during pregnancy."),
    ("warfarin", "warning", "Warfarin is generally avoided in pregnancy."),
    ("retinoid", "critical", "Retinoid medicines such as isotretinoin can harm an unborn baby."),
    ("methotrexate", "critical", "Methotrexate can harm an unborn baby."),
    ("tetracycline", "warning", "Tetracycline antibiotics are generally avoided in pregnancy."),
]


def medication_findings(med, *, allergies, conditions, pregnant: bool = False,
                        pregnancy_weeks: int | None = None) -> list[Finding]:
    """Check one medication record against allergies, conditions and pregnancy."""
    out: list[Finding] = []
    name = med.name or ""
    lname = name.lower()
    classes = allergy_classes(allergies)
    cls = med_class(name)
    for a in allergies:
        sub = (a.substance or "").strip()
        if sub and sub.lower() in lname:
            out.append(Finding("critical", "allergy.direct", f"{name} matches your {sub} allergy",
                               f"You have a recorded {a.get_severity_display().lower()} allergy to {sub}. "
                               f"Do not take {name} until a doctor or pharmacist has confirmed it is safe.",
                               {"allergy": sub}))
    if cls and cls in classes and not any(f.rule == "allergy.direct" for f in out):
        out.append(Finding("critical", "allergy.class",
                           f"{name} is in the same family as your {classes[cls]} allergy",
                           f"{name} is a {cls} medicine and you are allergic to {classes[cls]}. People with this "
                           f"allergy can react to other medicines in the same family. Contact your doctor or "
                           f"pharmacist before taking it.", {"class": cls, "allergy": classes[cls]}))
    for c in conditions:
        if c.status == "RESOLVED":
            continue
        cname = (c.name or "").lower()
        for pattern, group, level, msg in CONDITION_CAUTIONS:
            if re.search(pattern, cname) and in_group(name, group):
                out.append(Finding(level, f"condition.{group}", f"Check {name} with your {c.name}",
                                   f"{msg} Talk to the person who prescribed it before you start or continue.",
                                   {"condition": c.name}))
    if pregnant:
        for group, level, msg in PREGNANCY_CAUTIONS:
            if in_group(name, group):
                out.append(Finding(level, f"pregnancy.{group}", f"{name} during pregnancy",
                                   f"{msg} Contact your doctor or midwife before taking {name}."))
        if in_group(name, "nsaid"):
            late = pregnancy_weeks is not None and pregnancy_weeks >= 20
            out.append(Finding("warning" if late else "info", "pregnancy.nsaid", f"{name} during pregnancy",
                               "NSAIDs such as ibuprofen are generally avoided from 20 weeks of pregnancy. "
                               "Ask your doctor or midwife before taking it."))
    return sort_findings(out)


# ---------------------------------------------------------------------------
# Reading checks
# ---------------------------------------------------------------------------

def glucose_mmol(value: float, unit: str) -> float:
    return value / 18 if "mg" in (unit or "").lower() else value


def temperature_c(value: float, unit: str) -> float:
    return (value - 32) * 5 / 9 if "f" in (unit or "").lower() else value


def plausibility(vital_type: str, value: float, value2: float | None, unit: str) -> Finding | None:
    """Catch values that are almost certainly a typing or unit mistake."""
    def odd(msg: str) -> Finding:
        return Finding("warning", "reading.unlikely", "This reading looks unlikely",
                       f"{msg} Please check that it was typed correctly and in the right unit.")

    if vital_type == "BLOOD_PRESSURE":
        if value > 300 or value < 50:
            return odd(f"A systolic pressure of {value:g} is outside what is physically possible.")
        if value2 is not None and (value2 > 200 or value2 < 20 or value2 >= value):
            return odd(f"{value:g}/{value2:g} does not look like a valid blood pressure; the second number is "
                       f"normally lower than the first.")
    elif vital_type == "PULSE" and (value > 250 or value < 20):
        return odd(f"A pulse of {value:g} beats per minute is outside the possible range.")
    elif vital_type == "SPO2" and (value > 100 or value < 50):
        return odd(f"Oxygen saturation is a percentage between 0 and 100; {value:g} is unlikely.")
    elif vital_type == "TEMPERATURE":
        c = temperature_c(value, unit)
        if c > 45 or c < 25:
            return odd(f"{value:g} {unit or ''} is not a survivable body temperature.".replace("  ", " "))
    elif vital_type == "BLOOD_GLUCOSE":
        g = glucose_mmol(value, unit)
        if "mg" not in (unit or "").lower() and value > 50:
            return odd(f"{value:g} mmol/L is far too high for blood glucose. Was it measured in mg/dL "
                       f"({value:g} mg/dL is about {value / 18:.1f} mmol/L)?")
        if g > 60 or g <= 0:
            return odd(f"A blood glucose of {value:g} {unit or ''} is outside the possible range.".replace("  ", " "))
    elif vital_type == "WEIGHT" and (value > 400 or value < 1):
        return odd(f"A weight of {value:g} {unit or 'kg'} is unlikely.")
    elif vital_type == "HEIGHT" and "cm" in (unit or "cm").lower() and (value > 260 or value < 30):
        return odd(f"A height of {value:g} cm is unlikely.")
    return None


def reading_band(vital_type: str, value: float, value2: float | None, unit: str, *,
                 pregnant: bool = False, diabetic: bool = False) -> Finding | None:
    """Danger bands for one reading, adjusted for pregnancy and diabetes."""
    if vital_type == "BLOOD_PRESSURE":
        sys_, dia = value, value2 or 0
        if pregnant:
            if sys_ >= 160 or dia >= 110:
                return Finding("critical", "reading.bp.pregnancy", "Very high blood pressure in pregnancy",
                               f"{sys_:g}/{dia:g} is in the severe range for pregnancy (160/110 or more). "
                               f"Contact your doctor, midwife or the nearest hospital today.")
            if sys_ >= 140 or dia >= 90:
                return Finding("warning", "reading.bp.pregnancy", "High blood pressure in pregnancy",
                               f"{sys_:g}/{dia:g} is 140/90 or more. In pregnancy this needs to be checked by "
                               f"your doctor or midwife soon, especially with headache, swelling or blurred vision.")
        if sys_ >= 180 or dia >= 120:
            return Finding("critical", "reading.bp", "Blood pressure in the crisis range",
                           f"{sys_:g}/{dia:g} is 180/120 or more. Seek medical help urgently, especially with "
                           f"chest pain, headache, weakness or vision changes.")
        if sys_ < 90:
            return Finding("warning", "reading.bp", "Low blood pressure",
                           f"A systolic pressure of {sys_:g} is under 90.")
        if sys_ >= 140 or dia >= 90:
            return Finding("warning", "reading.bp", "High blood pressure",
                           f"{sys_:g}/{dia:g} is 140/90 or more. Share this with your doctor.")
    elif vital_type == "SPO2":
        if value < 90:
            return Finding("critical", "reading.spo2", "Dangerously low oxygen",
                           f"An oxygen saturation of {value:g}% is under 90%. Seek medical help now.")
        if value < 94:
            return Finding("warning", "reading.spo2", "Low oxygen", f"{value:g}% is under the normal 94%.")
    elif vital_type == "PULSE":
        if value > 150 or value < 40:
            return Finding("critical", "reading.pulse", "Heart rate far outside the normal range",
                           f"A pulse of {value:g} is far outside the normal range.")
        if value > 110 or value < 50:
            return Finding("warning", "reading.pulse", "Heart rate outside the normal range",
                           f"A pulse of {value:g} is outside 50 to 110.")
    elif vital_type == "TEMPERATURE":
        c = temperature_c(value, unit)
        if c >= 40 or c < 35:
            return Finding("critical", "reading.temp", "Very high fever" if c >= 40 else "Very low temperature",
                           f"{value:g} {unit or '°C'} needs urgent medical attention.")
        if c >= 38:
            text = "a fever (38 °C or more)"
            if pregnant:
                text += "; in pregnancy a fever should be checked by your doctor or midwife"
            return Finding("warning", "reading.temp", "Fever", f"{value:g} {unit or '°C'} is {text}.")
    elif vital_type == "BLOOD_GLUCOSE":
        g = glucose_mmol(value, unit)
        if g < 3.0:
            return Finding("critical", "reading.glucose", "Severe low blood sugar",
                           f"{g:.1f} mmol/L is under 3.0. Take fast-acting sugar now and get help.")
        if g > 16.7:
            return Finding("critical", "reading.glucose", "Very high blood sugar",
                           f"{g:.1f} mmol/L is over 16.7. Contact your doctor today.")
        if g < 3.9:
            return Finding("warning", "reading.glucose", "Low blood sugar", f"{g:.1f} mmol/L is under 3.9.")
        high = 11.0
        if g > high:
            note = " This is above the usual target for people with diabetes." if diabetic else ""
            return Finding("warning", "reading.glucose", "High blood sugar",
                           f"{g:.1f} mmol/L is over {high:g}.{note}")
    elif vital_type == "PAIN" and value >= 7:
        return Finding("warning", "reading.pain", "Severe pain", f"A pain score of {value:g}/10 is severe.")
    return None
