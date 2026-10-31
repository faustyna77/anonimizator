from backend.app.anonymization import DocumentAnonymizer
from backend.tests.pii_manifest import (
    CONTROLLED_NEAR_MISSES,
    EXPECTED_ANONYMIZED_DOCUMENT_TEXT,
    EXPECTED_MAPPING,
    EXPECTED_MARKERS,
    PII_DOCUMENT_TEXT,
    PII_MANIFEST,
    REGON_NEAR_MISS,
)


def test_pii_manifest_declares_seven_types_variants_and_controlled_near_misses():
    assert tuple(entry.name for entry in PII_MANIFEST) == ("PESEL", "NIP", "EMAIL", "REGON", "TELEFON", "NRB", "IBAN")
    assert tuple(entry.marker for entry in PII_MANIFEST) == EXPECTED_MARKERS
    assert tuple(entry.first_spelling for entry in PII_MANIFEST) == tuple(EXPECTED_MAPPING.values())
    assert tuple(entry.near_miss for entry in PII_MANIFEST if entry.name != "REGON") == CONTROLLED_NEAR_MISSES
    assert next(entry.near_miss for entry in PII_MANIFEST if entry.name == "REGON") == REGON_NEAR_MISS
    assert any(entry.first_spelling != entry.canonical_variant for entry in PII_MANIFEST)


def test_anonymizer_matches_the_independent_seven_type_pii_manifest():
    result = DocumentAnonymizer().anonymize(PII_DOCUMENT_TEXT)

    assert result.text == EXPECTED_ANONYMIZED_DOCUMENT_TEXT
    assert result.mapping == EXPECTED_MAPPING


def test_anonymizer_reuses_manifest_markers_for_canonical_variants():
    result = DocumentAnonymizer().anonymize(PII_DOCUMENT_TEXT)

    assert result.text.count("[PESEL_1]") == 2
    assert result.text.count("[NIP_1]") == 2
    assert result.text.count("[EMAIL_1]") == 2
    assert result.text.count("[TELEFON_1]") == 2
    assert result.text.count("[IBAN_1]") == 2
    assert result.mapping == EXPECTED_MAPPING


def test_anonymizer_leaves_manifest_near_misses_out_of_the_mapping():
    text = "\n".join(CONTROLLED_NEAR_MISSES)

    result = DocumentAnonymizer().anonymize(text)

    assert result.text == text
    assert result.mapping == {}


def test_anonymizer_masks_a_valid_nrb_without_the_pl_prefix():
    result = DocumentAnonymizer().anonymize("Rachunek: 11 1140 2004 0000 3002 1800 0002.")

    assert result.text == "Rachunek: [NRB_1]."
    assert result.mapping == {"[NRB_1]": "11 1140 2004 0000 3002 1800 0002"}


def test_anonymizer_prioritizes_a_valid_regon_over_a_phone_pattern():
    result = DocumentAnonymizer().anonymize("REGON: 192598474; telefon: 123 456 789.")

    assert result.text == "REGON: [REGON_1]; telefon: [TELEFON_1]."
    assert result.mapping == {
        "[REGON_1]": "192598474",
        "[TELEFON_1]": "123 456 789",
    }


def test_anonymizer_does_not_assign_a_regon_marker_to_an_invalid_regon_checksum():
    result = DocumentAnonymizer().anonymize(f"REGON: {REGON_NEAR_MISS}.")

    assert result.text == "REGON: [TELEFON_1]."
    assert result.mapping == {"[TELEFON_1]": REGON_NEAR_MISS}
