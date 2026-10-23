from backend.app.anonymization import DocumentAnonymizer
from backend.tests.pii_manifest import (
    CONTROLLED_NEAR_MISSES,
    EXPECTED_ANONYMIZED_DOCUMENT_TEXT,
    EXPECTED_MAPPING,
    EXPECTED_MARKERS,
    PII_DOCUMENT_TEXT,
    PII_MANIFEST,
)


def test_pii_manifest_declares_five_types_variants_and_controlled_near_misses():
    assert tuple(entry.name for entry in PII_MANIFEST) == ("PESEL", "NIP", "EMAIL", "TELEFON", "IBAN")
    assert tuple(entry.marker for entry in PII_MANIFEST) == EXPECTED_MARKERS
    assert tuple(entry.first_spelling for entry in PII_MANIFEST) == tuple(EXPECTED_MAPPING.values())
    assert tuple(entry.near_miss for entry in PII_MANIFEST) == CONTROLLED_NEAR_MISSES
    assert any(entry.first_spelling != entry.canonical_variant for entry in PII_MANIFEST)


def test_anonymizer_matches_the_independent_five_type_pii_manifest():
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
