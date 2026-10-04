from backend.app.anonymization import DocumentAnonymizer


SYNTHETIC_IDENTIFIERS = (
    "PESEL 44051401458; NIP 8567346215; e-mail synthetic.person@example.test; "
    "telefon +48 123 456 789; IBAN PL61 1090 1014 0000 0712 1981 2874."
)


def test_anonymizer_replaces_all_supported_identifiers_with_type_specific_markers():
    result = DocumentAnonymizer().anonymize(SYNTHETIC_IDENTIFIERS)

    assert result.text == (
        "PESEL [PESEL_1]; NIP [NIP_1]; e-mail [EMAIL_1]; "
        "telefon [TELEFON_1]; IBAN [IBAN_1]."
    )
    assert result.mapping == {
        "[PESEL_1]": "44051401458",
        "[NIP_1]": "8567346215",
        "[EMAIL_1]": "synthetic.person@example.test",
        "[TELEFON_1]": "+48 123 456 789",
        "[IBAN_1]": "PL61 1090 1014 0000 0712 1981 2874",
    }


def test_anonymizer_reuses_markers_inside_one_document_and_restarts_for_another_document():
    first = DocumentAnonymizer()
    repeated = first.anonymize("44051401458 then 44051401458 and 8567346215")
    second = DocumentAnonymizer().anonymize("44051401458")

    assert repeated.text == "[PESEL_1] then [PESEL_1] and [NIP_1]"
    assert repeated.mapping == {
        "[PESEL_1]": "44051401458",
        "[NIP_1]": "8567346215",
    }
    assert second.text == "[PESEL_1]"
    assert second.mapping == {"[PESEL_1]": "44051401458"}


def test_anonymizer_leaves_identifiers_with_invalid_checksums_unchanged():
    text = "PESEL 44051401459, NIP 8567346214, IBAN PL61 1090 1014 0000 0712 1981 2875"

    result = DocumentAnonymizer().anonymize(text)

    assert result.text == text
    assert result.mapping == {}
