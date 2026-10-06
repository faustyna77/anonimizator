import pytest

from backend.app.anonymization import (
    CustomRegexRule,
    DocumentAnonymizer,
    PhraseRule,
    RuleValidationError,
)


def test_anonymizer_uses_one_shared_marker_label_for_multiple_phrase_rules():
    anonymizer = DocumentAnonymizer(
        phrase_rules=(
            PhraseRule(rule_id="1", phrase="Jan Kowalski", marker_label="KLIENT"),
            PhraseRule(rule_id="2", phrase="Anna Nowak", marker_label="KLIENT"),
        )
    )

    result = anonymizer.anonymize("jan kowalski spotkał Anna Nowak.")

    assert result.text == "[KLIENT_1] spotkał [KLIENT_2]."
    assert result.mapping == {
        "[KLIENT_1]": "jan kowalski",
        "[KLIENT_2]": "Anna Nowak",
    }


def test_anonymizer_replaces_re2_regex_with_custom_marker_label():
    result = DocumentAnonymizer(
        regex_rules=(
            CustomRegexRule(
                rule_id="case-number",
                pattern=r"SPRAWA-\d{4}",
                marker_label="NUMER_SPRAWY",
            ),
        )
    ).anonymize("Numer SPRAWA-2026 jest poufny.")

    assert result.text == "Numer [NUMER_SPRAWY_1] jest poufny."
    assert result.mapping == {"[NUMER_SPRAWY_1]": "SPRAWA-2026"}


@pytest.mark.parametrize("pattern", [r"^SPRAWA-\d{4}$", r"\bSPRAWA-\d{4}\b", r".*"])
def test_contextual_or_empty_matching_regex_is_rejected(pattern):
    with pytest.raises(RuleValidationError, match="invalid or unsupported"):
        CustomRegexRule(rule_id="unsafe", pattern=pattern, marker_label="NUMER_SPRAWY")


def test_builtin_identifier_wins_tie_with_custom_regex():
    result = DocumentAnonymizer(
        regex_rules=(
            CustomRegexRule(rule_id="digits", pattern=r"\d{11}", marker_label="NUMER"),
        )
    ).anonymize("44051401458")

    assert result.text == "[PESEL_1]"
