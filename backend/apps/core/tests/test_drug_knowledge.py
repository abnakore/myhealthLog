"""
apps.core.drug_knowledge: name resolution and class lookup, with the public
services replaced by recorded answers.
"""

from unittest.mock import patch

import pytest

from apps.core import drug_knowledge as dk

RX = dk.RXNAV


def fake_get(url, params=None):
    params = params or {}
    if url == f"{RX}/rxcui.json":
        return {"idGroup": {"rxnormId": {"sulfamethoxazole": ["10180"], "trimethoprim": ["10829"],
                                         "amoxicillin": ["723"]}.get(params["name"], [])}}
    if url == f"{RX}/approximateTerm.json":
        # The live service really does answer 'co-trimoxazole' with ubidecarenone.
        return {"approximateGroup": {"candidate": [{"rxcui": "21406"}]}}
    if url.endswith("/properties.json"):
        rxcui = url.split("/")[-2]
        return {"properties": {"21406": {"name": "ubidecarenone", "tty": "IN"},
                               "10180": {"name": "sulfamethoxazole", "tty": "IN"},
                               "10829": {"name": "trimethoprim", "tty": "IN"},
                               "723": {"name": "amoxicillin", "tty": "IN"}}[rxcui]}
    if url == f"{RX}/rxclass/class/byRxcui.json":
        table = {("723", "MEDRT"): [("ci_chemclass", "Penicillins"), ("ci_with", "Drug Hypersensitivity")],
                 ("723", "FDASPL"): [("has_chemical_structure", "Penicillins"),
                                     ("has_epc", "Penicillin-class Antibacterial")],
                 ("10180", "FDASPL"): [("has_chemical_structure", "Sulfonamides")]}
        rows = table.get((params["rxcui"], params["relaSource"]), [])
        return {"rxclassDrugInfoList": {"rxclassDrugInfo": [
            {"rela": r, "rxclassMinConceptItem": {"className": n}} for r, n in rows]}}
    return None


@pytest.fixture
def online(settings):
    settings.DRUG_LOOKUP_ENABLED = True
    with patch("apps.core.drug_knowledge._get", side_effect=fake_get):
        yield


class TestCleanName:
    @pytest.mark.parametrize("raw,clean", [
        ("Amoxicillin 500mg capsules", "amoxicillin"), ("Folic acid tablets", "folic acid"),
        ("Coartem 20/120", "coartem"), ("  Lisinopril (Zestril) 10 mg  ", "lisinopril"),
    ])
    def test_strength_and_form_are_removed(self, raw, clean):
        assert dk.clean_name(raw) == clean


@pytest.mark.django_db
class TestLookup:
    def test_classes_come_from_rxclass(self, online):
        f = dk.lookup("Amoxicillin 500mg capsules")
        assert f.found and f.ingredients == ["amoxicillin"]
        assert f.contraindicated_classes == ["Penicillins"]
        assert f.pharmacologic_classes == ["Penicillin-class Antibacterial"]

    def test_a_wrong_fuzzy_match_is_rejected_and_the_ai_gives_the_generic_name(self, online):
        with patch("apps.core.drug_knowledge._ai_generic_names", return_value=["sulfamethoxazole", "trimethoprim"]):
            f = dk.lookup("Co-trimoxazole")
        assert f.mapped_by_ai and f.ingredients == ["sulfamethoxazole", "trimethoprim"]
        assert "ubidecarenone" not in f.ingredients
        assert f.chemical_classes == ["Sulfonamides"]

    def test_unknown_name(self, online):
        with patch("apps.core.drug_knowledge._ai_generic_names", return_value=[]):
            f = dk.lookup("Zzyxtrol")
        assert not f.found and not f.unavailable

    def test_results_are_cached(self, online):
        dk.lookup("amoxicillin")
        with patch("apps.core.drug_knowledge._get", side_effect=AssertionError("network used")):
            assert dk.lookup("Amoxicillin").found

    def test_service_down_is_not_cached(self, settings):
        settings.DRUG_LOOKUP_ENABLED = True
        with patch("apps.core.drug_knowledge._get", side_effect=dk._Unavailable("timeout")):
            assert dk.lookup("amoxicillin").unavailable
        with patch("apps.core.drug_knowledge._get", side_effect=fake_get):
            assert dk.lookup("amoxicillin").found

    def test_switched_off(self):
        assert dk.lookup("amoxicillin").unavailable


class TestNameMatching:
    @pytest.mark.parametrize("a,b,expected", [
        ("Penicillin", "Penicillins", True),
        ("Sulfa drugs", "Sulfonamides", True),
        ("NSAIDs", "Nonsteroidal Anti-inflammatory Drug", True),
        ("Bronchial asthma", "Asthma", True),
        ("G6PD deficiency", "Glucosephosphate Dehydrogenase Deficiency", True),
        ("Hypertension", "Hypotension", False),
        ("Chronic kidney disease", "Liver Diseases", False),
    ])
    def test_names(self, a, b, expected):
        from apps.core.clinical_rules import names_match

        assert names_match(a, b) is expected
