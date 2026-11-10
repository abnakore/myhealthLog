"""
Deterministic safety checks used by the record review and the Health Copilot.

Nothing here is invented medical knowledge. There are two kinds of check:

1. Medicine checks use facts from official public sources, fetched by
   apps.core.drug_knowledge:
     - allergy clashes: the medicine's ingredients and chemical classes (RxNorm,
       FDA pharmacologic classes) and MED-RT "contraindicated with chemical class";
     - medicine with medicine: MED-RT "contraindicated with chemical class", when
       the person already takes a drug of that class;
     - medicine with a condition or pregnancy: MED-RT "contraindicated with".
   The code only matches names. Which drug belongs to which class, and what it is
   contraindicated with, comes from the National Library of Medicine.

2. Reading checks use thresholds published in clinical guidelines, cited next to
   each band below:
     - Whelton et al. (2018). 2017 ACC/AHA guideline for high blood pressure in
       adults. Hypertension, 71(6). doi:10.1161/HYP.0000000000000065
     - ACOG Practice Bulletin No. 222 (2020). Gestational hypertension and
       preeclampsia. Obstetrics & Gynecology, 135(6), e237-e260.
       doi:10.1097/AOG.0000000000003891
     - American Diabetes Association (2025). 6. Glycemic goals and hypoglycemia:
       Standards of Care in Diabetes 2025. Diabetes Care, 48(Suppl 1), S128-S145.
       doi:10.2337/dc25-S006
     - Royal College of Physicians (2017). National Early Warning Score (NEWS) 2.
       London: RCP. (pulse, breathing rate, oxygen, temperature, low blood pressure)
     - World Health Organization (2006). Definition and diagnosis of diabetes
       mellitus and intermediate hyperglycaemia. Geneva: WHO. (random glucose)

The plausibility check is not clinical: it catches numbers that cannot be a real
measurement (a typing or unit mistake), so the person can correct them.

Every finding names the rule and the source behind it, so the result is the same
every time and can be traced.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Iterable

from apps.core import drug_knowledge as dk

# ---------------------------------------------------------------------------
# Findings
# ---------------------------------------------------------------------------

LEVEL_ORDER = {"critical": 0, "warning": 1, "info": 2}

SOURCE_MEDRT = "MED-RT via the US National Library of Medicine (RxClass)"
SOURCE_RXNORM = "RxNorm, US National Library of Medicine"
SOURCE_FDA_CLASS = "FDA pharmacologic class via RxClass"


@dataclass
class Finding:
    level: str          # critical | warning | info
    rule: str           # short id of the rule that raised it
    title: str
    detail: str
    data: dict[str, Any] = field(default_factory=dict)
    source: str = ""

    def as_dict(self) -> dict[str, Any]:
        return {"level": self.level, "rule": self.rule, "title": self.title, "detail": self.detail,
                "data": self.data, "source": self.source}


def sort_findings(findings: list[Finding]) -> list[Finding]:
    return sorted(findings, key=lambda f: LEVEL_ORDER.get(f.level, 9))


# ---------------------------------------------------------------------------
# Name matching (terminology only, no clinical judgement)
# ---------------------------------------------------------------------------

# Words that carry no meaning when comparing names.
_STOP = {
    "drug", "drugs", "allergy", "allergic", "to", "class", "antibiotic", "antibiotics", "and", "or", "the",
    "of", "in", "with", "disease", "diseases", "disorder", "disorders", "chronic", "acute", "syndrome",
    "type", "medicine", "medicines", "medication", "medications", "reaction", "family",
}
# Abbreviations and everyday words expanded to the terms the databases use.
_EXPAND = {
    "sulfa": "sulfonamide", "sulpha": "sulfonamide", "sulphonamide": "sulfonamide",
    "nsaid": "nonsteroidal anti inflammatory", "nsaids": "nonsteroidal anti inflammatory",
    "g6pd": "glucosephosphate dehydrogenase", "ckd": "kidney", "renal": "kidney",
    "hbp": "hypertension", "high blood pressure": "hypertension", "low blood pressure": "hypotension",
}


def terms(text: str) -> set[str]:
    """Significant, singular, lower-case words of a name."""
    t = (text or "").lower()
    for short, long in _EXPAND.items():
        t = re.sub(rf"\b{re.escape(short)}\b", long, t)
    out = set()
    for w in re.split(r"[^a-z0-9]+", t):
        if not w or w in _STOP:
            continue
        if len(w) > 4 and w.endswith("s") and not w.endswith("ss"):
            w = w[:-1]
        out.add(w)
    return out


def names_match(a: str, b: str) -> bool:
    """True when every significant word of one name appears in the other."""
    ta, tb = terms(a), terms(b)
    return bool(ta and tb and (ta <= tb or tb <= ta))


def _any_match(name: str, candidates: Iterable[str]) -> str | None:
    return next((c for c in candidates if names_match(name, c)), None)


# ---------------------------------------------------------------------------
# Medicine checks
# ---------------------------------------------------------------------------

_NOT_A_CONDITION = {"drug hypersensitivity"}
_TRIMESTER = {"first": (0, 13), "second": (14, 27), "third": (28, 45)}


def _pregnancy_terms(ci: list[str]) -> list[str]:
    """MED-RT pregnancy states: 'Pregnancy' and 'Pregnancy Trimester, X' (not ectopic etc.)."""
    return [c for c in ci if c.lower() == "pregnancy" or c.lower().startswith("pregnancy trimester")]


def medication_findings(med, *, allergies=(), conditions=(), other_meds=(), pregnant: bool = False,
                        pregnancy_weeks: int | None = None, facts: dk.DrugFacts | None = None,
                        lookup=None) -> list[Finding]:
    """Check one medicine against allergies, other medicines, conditions and pregnancy."""
    lookup = lookup or dk.lookup
    facts = facts or lookup(med.name)
    name = med.name or ""
    out: list[Finding] = []
    if facts.unavailable:
        return out
    if not facts.found:
        out.append(Finding(
            "info", "drug.not_found", f"{name} was not found in the official drug database",
            f"{name} could not be matched to a medicine in RxNorm, even after converting the name to a generic "
            f"one, so the official allergy and contraindication checks could not run. Check the spelling, or "
            f"use the generic name printed on the pack.", source=SOURCE_RXNORM))
        return out

    ingredients = facts.ingredients
    med_classes = facts.all_classes

    # Allergies
    for a in allergies:
        sub = (a.substance or "").strip()
        if not sub:
            continue
        hit = _any_match(sub, [name, *ingredients])
        a_facts = None
        if not hit and getattr(a, "allergy_type", "DRUG") in ("DRUG", "OTHER", ""):
            a_facts = lookup(sub)
            if a_facts.found:
                hit = next((i for i in ingredients if i in a_facts.ingredients), None)
        severity = a.get_severity_display().lower() if hasattr(a, "get_severity_display") else "recorded"
        if hit:
            out.append(Finding(
                "critical", "allergy.direct", f"{name} matches your {sub} allergy",
                f"{name} contains {', '.join(ingredients)}, and you have a {severity} allergy to {sub}. Do not take "
                f"it until a doctor or pharmacist has confirmed it is safe.",
                {"allergy": sub, "ingredients": ingredients}, SOURCE_RXNORM))
            continue
        cls = _any_match(sub, med_classes)
        if not cls and a_facts and a_facts.found:
            cls = next((c for c in facts.contraindicated_classes
                        if c in a_facts.chemical_classes or _any_match(c, a_facts.ingredients)), None)
            cls = cls or next((c for c in facts.chemical_classes if c in a_facts.chemical_classes), None)
        if cls:
            out.append(Finding(
                "critical", "allergy.class", f"{name} is in the same family as your {sub} allergy",
                f"{name} belongs to the class '{cls}', and you have a {severity} allergy to {sub}. People with "
                f"this allergy can react to other medicines in the same class. Contact your doctor or pharmacist "
                f"before taking it.", {"class": cls, "allergy": sub}, SOURCE_MEDRT))

    # Other medicines: MED-RT says this drug must not be combined with that class.
    for other in other_meds:
        if other is med or (getattr(other, "pk", None) and other.pk == getattr(med, "pk", None)):
            continue
        o_facts = lookup(other.name)
        if not o_facts.found:
            continue
        pairs = [(c, other.name) for c in facts.contraindicated_classes
                 if c not in facts.chemical_classes and not _any_match(c, ingredients)
                 and (_any_match(c, o_facts.ingredients) or c in o_facts.chemical_classes)]
        pairs += [(c, other.name) for c in o_facts.contraindicated_classes
                  if c not in o_facts.chemical_classes and not _any_match(c, o_facts.ingredients)
                  and (_any_match(c, ingredients) or c in facts.chemical_classes)]
        if pairs:
            cls, other_name = pairs[0]
            out.append(Finding(
                "warning", "interaction.medrt", f"{name} and {other_name} should not be taken together",
                f"The official drug terminology lists {name} and {other_name} as contraindicated together "
                f"(class '{cls}'). Ask the prescriber or a pharmacist before taking both.",
                {"other": other_name, "class": cls}, SOURCE_MEDRT))

    # Conditions
    for c in conditions:
        if getattr(c, "status", "ACTIVE") == "RESOLVED":
            continue
        for d in facts.contraindicated_with:
            if d.lower() in _NOT_A_CONDITION or d.lower().startswith("pregnan"):
                continue
            if names_match(c.name, d):
                # A medicine prescribed for this very condition (linked to it on the record) is not flagged as a
                # warning: MED-RT lists contraindications per ingredient, and some apply only to particular uses
                # (budesonide is listed against asthma because of acute attacks, yet it is an asthma controller).
                linked = str(getattr(c, "pk", "")) in {str(x) for x in (getattr(med, "condition_ids", None) or [])}
                if linked:
                    out.append(Finding(
                        "info", "condition.medrt", f"Note on {name} and your {c.name}",
                        f"{name} is recorded as treatment for your {c.name}. The official drug terminology lists "
                        f"{d} among its contraindications, which usually concerns particular uses. Ask the "
                        f"prescriber if you are unsure.", {"condition": c.name, "contraindication": d,
                                                          "linked": True}, SOURCE_MEDRT))
                else:
                    out.append(Finding(
                        "warning", "condition.medrt", f"Check {name} with your {c.name}",
                        f"{name} is listed as contraindicated with {d}. Talk to the person who prescribed it "
                        f"before you start or continue.", {"condition": c.name, "contraindication": d},
                        SOURCE_MEDRT))
                break

    # Pregnancy
    if pregnant:
        for p in _pregnancy_terms(facts.contraindicated_with):
            if p.lower() == "pregnancy":
                level, when = "critical", "in pregnancy"
            else:
                trimester = p.split(",")[-1].strip().lower()
                lo, hi = _TRIMESTER.get(trimester, (0, 45))
                now = pregnancy_weeks is None or lo <= pregnancy_weeks <= hi
                level, when = ("warning" if now else "info"), f"in the {trimester} trimester"
            out.append(Finding(
                level, "pregnancy.medrt", f"{name} during pregnancy",
                f"{name} is listed as contraindicated {when}. Contact your doctor or midwife before taking it.",
                {"contraindication": p, "weeks": pregnancy_weeks}, SOURCE_MEDRT))
            break
    return sort_findings(out)


# ---------------------------------------------------------------------------
# Reading checks
# ---------------------------------------------------------------------------

SRC_ACC_AHA = "2017 ACC/AHA high blood pressure guideline (Whelton et al., 2018)"
SRC_ACOG = "ACOG Practice Bulletin No. 222 (2020)"
SRC_ADA = "ADA Standards of Care in Diabetes 2025, section 6"
SRC_NEWS2 = "National Early Warning Score 2 (Royal College of Physicians, 2017)"
SRC_WHO = "WHO definition and diagnosis of diabetes (2006)"


def glucose_mmol(value: float, unit: str) -> float:
    return value / 18 if "mg" in (unit or "").lower() else value


def temperature_c(value: float, unit: str) -> float:
    return (value - 32) * 5 / 9 if "f" in (unit or "").lower() else value


def plausibility(vital_type: str, value: float, value2: float | None, unit: str) -> Finding | None:
    """Catch values that cannot be a real measurement (a typing or unit mistake)."""
    def odd(msg: str) -> Finding:
        return Finding("warning", "reading.unlikely", "This reading looks unlikely",
                       f"{msg} Please check that it was typed correctly and in the right unit.",
                       source="Data-entry check")

    if vital_type == "BLOOD_PRESSURE":
        if value > 300 or value < 50:
            return odd(f"A systolic pressure of {value:g} is outside what a blood pressure monitor can read.")
        if value2 is not None and (value2 > 200 or value2 < 20 or value2 >= value):
            return odd(f"{value:g}/{value2:g} does not look like a valid blood pressure; the second number is "
                       f"normally lower than the first.")
    elif vital_type == "PULSE" and (value > 250 or value < 20):
        return odd(f"A pulse of {value:g} beats per minute is outside the possible range.")
    elif vital_type == "SPO2" and (value > 100 or value < 50):
        return odd(f"Oxygen saturation is a percentage up to 100; {value:g} is unlikely.")
    elif vital_type == "TEMPERATURE":
        c = temperature_c(value, unit)
        if c > 45 or c < 25:
            return odd(f"{value:g} {unit or ''} is not a possible body temperature.".replace("  ", " "))
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
    """Readings outside guideline thresholds. Each band names its source."""
    def f(level, rule, title, detail, source):
        return Finding(level, rule, title, detail, source=source)

    if vital_type == "BLOOD_PRESSURE":
        sys_, dia = value, value2 or 0
        if pregnant:
            # ACOG: severe range 160 systolic or 110 diastolic; hypertension 140 or 90.
            if sys_ >= 160 or dia >= 110:
                return f("critical", "reading.bp.pregnancy", "Very high blood pressure in pregnancy",
                         f"{sys_:g}/{dia:g} is in the severe range for pregnancy (160/110 or more). Contact your "
                         f"doctor, midwife or the nearest hospital today.", SRC_ACOG)
            if sys_ >= 140 or dia >= 90:
                return f("warning", "reading.bp.pregnancy", "High blood pressure in pregnancy",
                         f"{sys_:g}/{dia:g} is 140/90 or more. In pregnancy this needs to be checked by your doctor "
                         f"or midwife soon.", SRC_ACOG)
        # ACC/AHA: severe hypertension above 180 and/or 120; stage 2 from 140 or 90.
        if sys_ > 180 or dia > 120:
            return f("critical", "reading.bp", "Very high blood pressure",
                     f"{sys_:g}/{dia:g} is above 180/120. Seek medical help urgently, especially with chest pain, "
                     f"headache, weakness or vision changes.", SRC_ACC_AHA)
        # NEWS2: systolic 90 or less scores 3, 91 to 100 scores 2.
        if sys_ <= 90:
            return f("critical", "reading.bp", "Very low blood pressure",
                     f"A systolic pressure of {sys_:g} is 90 or less.", SRC_NEWS2)
        if sys_ <= 100:
            return f("warning", "reading.bp", "Low blood pressure",
                     f"A systolic pressure of {sys_:g} is between 91 and 100.", SRC_NEWS2)
        if sys_ >= 140 or dia >= 90:
            return f("warning", "reading.bp", "High blood pressure",
                     f"{sys_:g}/{dia:g} is 140/90 or more (stage 2). Share this with your doctor.", SRC_ACC_AHA)
    elif vital_type == "SPO2":
        # NEWS2 scale 1: 91 or less scores 3, 92 to 93 scores 2.
        if value <= 91:
            return f("critical", "reading.spo2", "Dangerously low oxygen",
                     f"An oxygen saturation of {value:g}% is 91% or less. Seek medical help now.", SRC_NEWS2)
        if value <= 93:
            return f("warning", "reading.spo2", "Low oxygen", f"{value:g}% is 92 to 93%.", SRC_NEWS2)
    elif vital_type == "PULSE":
        # NEWS2: 40 or less, or 131 or more, scores 3; 111 to 130 scores 2.
        if value <= 40 or value >= 131:
            return f("critical", "reading.pulse", "Heart rate far outside the normal range",
                     f"A pulse of {value:g} is {'40 or less' if value <= 40 else '131 or more'}.", SRC_NEWS2)
        if value >= 111:
            return f("warning", "reading.pulse", "Fast heart rate", f"A pulse of {value:g} is 111 to 130.", SRC_NEWS2)
    elif vital_type == "RESPIRATORY_RATE":
        # NEWS2: 8 or less, or 25 or more, scores 3; 21 to 24 scores 2.
        if value <= 8 or value >= 25:
            return f("critical", "reading.resp", "Breathing rate far outside the normal range",
                     f"{value:g} breaths a minute is {'8 or less' if value <= 8 else '25 or more'}.", SRC_NEWS2)
        if value >= 21:
            return f("warning", "reading.resp", "Fast breathing", f"{value:g} breaths a minute is 21 to 24.",
                     SRC_NEWS2)
    elif vital_type == "TEMPERATURE":
        c = temperature_c(value, unit)
        # NEWS2: 35.0 or less scores 3; 39.1 or more scores 2; 38.1 to 39.0 scores 1.
        if c <= 35.0:
            return f("critical", "reading.temp", "Very low temperature",
                     f"{value:g} {unit or '°C'} is 35 °C or less.", SRC_NEWS2)
        if c >= 39.1:
            return f("warning", "reading.temp", "High fever", f"{value:g} {unit or '°C'} is 39.1 °C or more.",
                     SRC_NEWS2)
        if c >= 38.1:
            return f("info", "reading.temp", "Fever", f"{value:g} {unit or '°C'} is 38.1 to 39 °C.", SRC_NEWS2)
    elif vital_type == "BLOOD_GLUCOSE":
        g = glucose_mmol(value, unit)
        # ADA: level 2 hypoglycaemia under 3.0 mmol/L (54 mg/dL); level 1 under 3.9 (70 mg/dL).
        if g < 3.0:
            return f("critical", "reading.glucose", "Severe low blood sugar",
                     f"{g:.1f} mmol/L is under 3.0 (level 2 hypoglycaemia). Take fast-acting sugar now and get help.",
                     SRC_ADA)
        if g < 3.9:
            return f("warning", "reading.glucose", "Low blood sugar",
                     f"{g:.1f} mmol/L is under 3.9 (level 1 hypoglycaemia).", SRC_ADA)
        # WHO: a random plasma glucose of 11.1 mmol/L or more is in the diabetic range.
        if g >= 11.1:
            note = " Share it with the person who manages your diabetes." if diabetic else \
                " Share it with your doctor."
            return f("warning", "reading.glucose", "High blood sugar",
                     f"{g:.1f} mmol/L is 11.1 or more.{note}", SRC_WHO)
    return None
