"""
Drug facts from official public sources, instead of hand-written medicine lists.

Sources (all free, no API key):

  RxNorm / RxNav (US National Library of Medicine)
      Turns what the person typed ("Amoxicillin 500mg caps", "Coartem") into
      standard ingredient names and RxNorm ids.
      https://lhncbc.nlm.nih.gov/RxNav/APIs/RxNormAPIs.html

  RxClass (US National Library of Medicine), two classifications:
      MED-RT (US Department of Veterans Affairs):
        ci_with       diseases and physiological states the drug is contraindicated with
                      (for example ibuprofen -> Asthma, Pregnancy Trimester, Third)
        ci_chemclass  chemical classes the drug is contraindicated with: an allergy to
                      that class (amoxicillin -> Penicillins) or taking a drug of that
                      class at the same time (artemether -> Rifampin, Carbamazepine)
      FDA Structured Product Labeling:
        has_chemical_structure  (amoxicillin -> Penicillins)
        has_epc                 established pharmacologic class (ibuprofen -> Nonsteroidal
                                Anti-inflammatory Drug)
      https://lhncbc.nlm.nih.gov/RxNav/APIs/RxClassAPIs.html

  openFDA drug labels (US Food and Drug Administration)
      The official label text: boxed warning, contraindications, warnings, drug
      interactions, pregnancy and adverse reactions. The AI reads this text against the
      person's record (apps.records.review), and every point it makes must quote it.
      https://open.fda.gov/apis/drug/label/

When a name is not in RxNorm (many Nigerian brand names, for example Ampiclox or
Septrin), the AI is asked only to translate it into generic ingredient names, which
are then looked up in RxNorm like any other name. The AI never supplies the drug
facts themselves.

Results are cached for 30 days, so a medicine is looked up once, not on every save.
Network failures are not cached and simply mean "no official facts this time".
"""

from __future__ import annotations

import logging
import re
from dataclasses import asdict, dataclass, field
from typing import Any

import requests
from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

RXNAV = "https://rxnav.nlm.nih.gov/REST"
OPENFDA_LABEL = "https://api.fda.gov/drug/label.json"
_TIMEOUT = 12
_CACHE_SECONDS = 60 * 60 * 24 * 30
_MISS_SECONDS = 60 * 60 * 24  # a name we could not find is retried after a day

# Label sections the AI may read, in the order they are given to it.
LABEL_SECTIONS = (
    "boxed_warning",
    "contraindications",
    "warnings_and_cautions",
    "warnings",
    "drug_interactions",
    "pregnancy",
    "do_not_use",
    "ask_doctor",
    "ask_doctor_or_pharmacist",
    "stop_use",
    "adverse_reactions",
)
_SECTION_CHARS = 3000

_FORM_WORDS = re.compile(
    r"\b(tablets?|tabs?|capsules?|caps?|syrup|suspension|injection|inj|cream|ointment|drops?|"
    r"inhaler|solution|suppository|sachet|oral|film[- ]coated|extended[- ]release|er|sr|xr|mr)\b",
    re.I,
)


class _Unavailable(Exception):
    """The public service did not answer; do not cache this as a miss."""


@dataclass
class DrugFacts:
    query: str
    found: bool = False
    ingredients: list[str] = field(default_factory=list)
    rxcuis: list[str] = field(default_factory=list)
    mapped_by_ai: bool = False
    chemical_classes: list[str] = field(default_factory=list)       # FDA SPL has_chemical_structure
    pharmacologic_classes: list[str] = field(default_factory=list)  # FDA SPL has_epc
    contraindicated_classes: list[str] = field(default_factory=list)  # MED-RT ci_chemclass
    contraindicated_with: list[str] = field(default_factory=list)   # MED-RT ci_with
    unavailable: bool = False  # the lookup could not run (offline or switched off)

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "DrugFacts":
        return cls(**{k: d[k] for k in cls.__dataclass_fields__ if k in d})

    @property
    def all_classes(self) -> list[str]:
        seen: list[str] = []
        for c in [*self.contraindicated_classes, *self.chemical_classes, *self.pharmacologic_classes]:
            if c not in seen:
                seen.append(c)
        return seen


def enabled() -> bool:
    return bool(getattr(settings, "DRUG_LOOKUP_ENABLED", True))


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------


def _get(url: str, params: dict[str, Any] | None = None) -> Any:
    try:
        r = requests.get(url, params=params, timeout=_TIMEOUT, headers={"User-Agent": "myHealthLog/1.0"})
    except requests.RequestException as exc:
        raise _Unavailable(str(exc)) from exc
    if r.status_code == 404:
        return None
    if r.status_code >= 500 or r.status_code == 429:
        raise _Unavailable(f"HTTP {r.status_code}")
    if r.status_code != 200:
        return None
    try:
        return r.json()
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# Name -> RxNorm ingredients
# ---------------------------------------------------------------------------


def clean_name(name: str) -> str:
    """'Amoxicillin 500mg capsules' -> 'amoxicillin'. Keeps multi-word names ('folic acid')."""
    n = (name or "").lower()
    n = re.split(r"\d", n, maxsplit=1)[0]          # drop the strength and everything after it
    n = re.sub(r"\(.*?\)", " ", n)
    n = _FORM_WORDS.sub(" ", n)
    n = re.sub(r"[^a-z\- /+]", " ", n)
    return re.sub(r"\s+", " ", n).strip(" -/+")


def _words(text: str) -> set[str]:
    return {w for w in re.split(r"[^a-z]+", (text or "").lower()) if len(w) >= 4}


def _exact_rxcui(name: str) -> str | None:
    data = _get(f"{RXNAV}/rxcui.json", {"name": name, "search": 2})
    ids = ((data or {}).get("idGroup") or {}).get("rxnormId") or []
    return ids[0] if ids else None


def _approximate_rxcui(name: str) -> str | None:
    """Fuzzy match, accepted only when the matched concept shares a word with the query.

    RxNav's approximate search always returns something; for 'co-trimoxazole' it
    returns ubidecarenone, which is wrong. Requiring a shared word stops that.
    """
    data = _get(f"{RXNAV}/approximateTerm.json", {"term": name, "maxEntries": 3, "option": 1})
    for cand in ((data or {}).get("approximateGroup") or {}).get("candidate") or []:
        props = _get(f"{RXNAV}/rxcui/{cand['rxcui']}/properties.json")
        cname = (((props or {}).get("properties") or {}).get("name")) or ""
        if _words(cname) & _words(name):
            return cand["rxcui"]
    return None


def _ingredients(rxcui: str) -> list[tuple[str, str]]:
    """[(ingredient rxcui, ingredient name)] for any RxNorm concept."""
    props = _get(f"{RXNAV}/rxcui/{rxcui}/properties.json")
    p = (props or {}).get("properties") or {}
    if p.get("tty") == "IN":
        return [(rxcui, p.get("name", ""))]
    data = _get(f"{RXNAV}/rxcui/{rxcui}/related.json", {"tty": "IN"})
    out = []
    for group in ((data or {}).get("relatedGroup") or {}).get("conceptGroup") or []:
        for c in group.get("conceptProperties") or []:
            out.append((c["rxcui"], c["name"]))
    return out


def _resolve(name: str) -> list[tuple[str, str]]:
    rxcui = _exact_rxcui(name) or _approximate_rxcui(name)
    return _ingredients(rxcui) if rxcui else []


_GENERIC_PROMPT = """
A patient in Nigeria wrote this medicine name in their health record: "{name}"
Give its active ingredients as generic names in the form used by the US RxNorm
database (for example paracetamol is "acetaminophen", co-trimoxazole is
"sulfamethoxazole" and "trimethoprim", Ampiclox is "ampicillin" and "cloxacillin").
If you do not recognise the name as a medicine, return an empty list.
Return ONE JSON object only: {{"ingredients": ["generic name", ...]}}
"""


def _ai_generic_names(name: str) -> list[str]:
    from apps.core import ai

    if not ai.is_configured():
        return []
    try:
        raw = ai.generate_json([{"role": "user", "parts": [{"text": _GENERIC_PROMPT.format(name=name)}]}])
    except Exception as exc:
        logger.info("AI generic-name mapping failed for %r: %s", name, exc)
        return []
    items = raw.get("ingredients") if isinstance(raw, dict) else None
    return [str(i).strip().lower() for i in (items or []) if str(i).strip()][:5]


def _classes(ingredient_rxcui: str, facts: DrugFacts) -> None:
    for source in ("MEDRT", "FDASPL"):
        data = _get(f"{RXNAV}/rxclass/class/byRxcui.json", {"rxcui": ingredient_rxcui, "relaSource": source})
        for info in ((data or {}).get("rxclassDrugInfoList") or {}).get("rxclassDrugInfo") or []:
            rela = info.get("rela")
            cname = (info.get("rxclassMinConceptItem") or {}).get("className") or ""
            target = {
                "ci_with": facts.contraindicated_with,
                "ci_chemclass": facts.contraindicated_classes,
                "has_chemical_structure": facts.chemical_classes,
                "has_epc": facts.pharmacologic_classes,
            }.get(rela)
            if target is not None and cname and cname not in target:
                target.append(cname)


def lookup(name: str) -> DrugFacts:
    """Official facts for one medicine name. Never raises."""
    query = clean_name(name)
    facts = DrugFacts(query=query or (name or "").strip().lower())
    if not query:
        return facts
    if not enabled():
        facts.unavailable = True
        return facts

    key = "drugfacts:v1:" + re.sub(r"[^a-z0-9]+", "_", query)
    hit = cache.get(key)
    if hit is not None:
        return DrugFacts.from_dict(hit)

    try:
        found = _resolve(query)
        if not found:
            generics = _ai_generic_names(name)
            for g in generics:
                found += _resolve(g)
            facts.mapped_by_ai = bool(found)
        seen = set()
        for rx, ing in found:
            if rx in seen:
                continue
            seen.add(rx)
            facts.rxcuis.append(rx)
            facts.ingredients.append(ing.lower())
            _classes(rx, facts)
        facts.found = bool(facts.rxcuis)
    except _Unavailable as exc:
        logger.warning("Drug lookup unavailable for %r: %s", query, exc)
        return DrugFacts(query=query, unavailable=True)

    cache.set(key, facts.as_dict(), _CACHE_SECONDS if facts.found else _MISS_SECONDS)
    return facts


# ---------------------------------------------------------------------------
# FDA label
# ---------------------------------------------------------------------------


def label(facts: DrugFacts) -> dict[str, str] | None:
    """The official FDA label sections for the drug's ingredients, or None."""
    if not facts.found or not enabled():
        return None
    key = "fdalabel:v1:" + re.sub(r"[^a-z0-9+]+", "_", "+".join(sorted(facts.ingredients)))
    hit = cache.get(key)
    if hit is not None:
        return hit or None

    search = " AND ".join(f'openfda.substance_name:"{i}"' for i in facts.ingredients)
    try:
        data = _get(OPENFDA_LABEL, {"search": search, "limit": 10})
    except _Unavailable as exc:
        logger.warning("openFDA label unavailable for %s: %s", facts.ingredients, exc)
        return None
    results = (data or {}).get("results") or []
    # Prefer a label for exactly these ingredients, then the one with the most sections.
    def score(r: dict) -> tuple[int, int]:
        subs = {s.lower() for s in (r.get("openfda") or {}).get("substance_name") or []}
        exact = int(subs == set(facts.ingredients) or not subs)
        return exact, sum(1 for s in LABEL_SECTIONS if r.get(s))

    best = max(results, key=score) if results else None
    sections: dict[str, str] = {}
    if best:
        for s in LABEL_SECTIONS:
            text = " ".join(best.get(s) or []).strip()
            if text:
                sections[s] = re.sub(r"\s+", " ", text)[:_SECTION_CHARS]
        set_id = best.get("set_id")
        if set_id:
            sections["_set_id"] = set_id
    cache.set(key, sections, _CACHE_SECONDS if sections else _MISS_SECONDS)
    return sections or None
