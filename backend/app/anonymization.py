"""Detection and deterministic marker assignment for supported document identifiers."""
from __future__ import annotations

from dataclasses import dataclass, field
import re
from typing import Any, Callable

import re2


@dataclass(frozen=True)
class AnonymizationResult:
    """Transformed text, mapping, and source offsets for format-specific adapters."""

    text: str
    mapping: dict[str, str]
    replacements: tuple[tuple[int, int, str], ...] = ()


class RuleValidationError(ValueError):
    """A custom anonymization rule cannot be used safely."""


_MARKER_LABEL = re.compile(r"^[A-Z][A-Z0-9_]{0,31}$")
_RESERVED_MARKER_LABELS = frozenset({"PESEL", "NIP", "EMAIL", "TELEFON", "IBAN"})
_CONTEXTUAL_REGEX_TOKENS = ("^", "$", r"\b", r"\B")
_MAX_PHRASE_LENGTH = 255
_MAX_REGEX_LENGTH = 512


def _validate_marker_label(marker_label: str) -> None:
    if not _MARKER_LABEL.fullmatch(marker_label) or marker_label in _RESERVED_MARKER_LABELS:
        raise RuleValidationError("Marker label is invalid or reserved.")


def _validate_regex_pattern(pattern: str) -> None:
    if not pattern or len(pattern) > _MAX_REGEX_LENGTH:
        raise RuleValidationError("Regex pattern is invalid.")
    if any(token in pattern for token in _CONTEXTUAL_REGEX_TOKENS):
        raise RuleValidationError("Regex pattern is invalid or unsupported.")
    try:
        compiled = re2.compile(pattern)
    except re2.error as error:
        raise RuleValidationError("Regex pattern is invalid or unsupported.") from error
    if compiled.search("") is not None:
        raise RuleValidationError("Regex pattern is invalid or unsupported.")


@dataclass(frozen=True)
class PhraseRule:
    """A literal, case-insensitive phrase configured by one office."""

    rule_id: str
    phrase: str
    marker_label: str

    def __post_init__(self) -> None:
        _validate_marker_label(self.marker_label)
        if not self.phrase.strip() or len(self.phrase) > _MAX_PHRASE_LENGTH:
            raise RuleValidationError("Phrase is invalid.")


@dataclass(frozen=True)
class CustomRegexRule:
    """A RE2 rule that matches only the value redacted in PDF and DOCX."""

    rule_id: str
    pattern: str
    marker_label: str

    def __post_init__(self) -> None:
        _validate_marker_label(self.marker_label)
        _validate_regex_pattern(self.pattern)


@dataclass(frozen=True)
class _ConfiguredRule:
    marker_label: str
    pattern: Any
    canonicalize: Callable[[str], str]
    priority: int
    rule_id: str


@dataclass(frozen=True)
class _IdentifierRule:
    marker_type: str
    pattern: re.Pattern[str]
    is_valid: Callable[[str], bool]
    canonicalize: Callable[[str], str]
    priority: int = 0
    rule_id: str = ""


_DIGITS = re.compile(r"\D")


def _digits(value: str) -> str:
    return _DIGITS.sub("", value)


def _pesel_is_valid(value: str) -> bool:
    digits = _digits(value)
    if len(digits) != 11:
        return False
    checksum = sum(
        digit * weight for digit, weight in zip(map(int, digits[:10]), (1, 3, 7, 9, 1, 3, 7, 9, 1, 3))
    )
    return (10 - checksum % 10) % 10 == int(digits[10])


def _nip_is_valid(value: str) -> bool:
    digits = _digits(value)
    if len(digits) != 10:
        return False
    checksum = sum(
        digit * weight for digit, weight in zip(map(int, digits[:9]), (6, 5, 7, 2, 3, 4, 5, 6, 7))
    ) % 11
    return checksum != 10 and checksum == int(digits[9])


def _iban_is_valid(value: str) -> bool:
    compact = re.sub(r"[ -]", "", value).upper()
    if not re.fullmatch(r"PL\d{26}", compact):
        return False
    rearranged = compact[4:] + compact[:4]
    numeric = "".join(str(ord(character) - 55) if character.isalpha() else character for character in rearranged)
    remainder = 0
    for character in numeric:
        remainder = (remainder * 10 + int(character)) % 97
    return remainder == 1


def _email_is_valid(value: str) -> bool:
    local, _, domain = value.rpartition("@")
    return bool(local and domain and "." in domain and not domain.startswith(".") and not domain.endswith("."))


def _phone_is_valid(value: str) -> bool:
    digits = _digits(value)
    return len(digits) == 9 or (len(digits) == 11 and digits.startswith("48"))


_RULES = (
    _IdentifierRule(
        "IBAN",
        re.compile(r"(?<![A-Z0-9])PL(?:[ -]?\d){26}(?![A-Z0-9])", re.IGNORECASE),
        _iban_is_valid,
        lambda value: re.sub(r"[ -]", "", value).upper(),
    ),
    _IdentifierRule(
        "EMAIL",
        re.compile(r"(?<![\w.+-])[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}(?![\w.-])", re.IGNORECASE),
        _email_is_valid,
        lambda value: value.lower(),
    ),
    _IdentifierRule(
        "PESEL",
        re.compile(r"(?<!\d)\d{11}(?!\d)"),
        _pesel_is_valid,
        _digits,
    ),
    _IdentifierRule(
        "NIP",
        re.compile(r"(?<!\d)\d{3}-?\d{2}-?\d{2}-?\d{3}(?!\d)"),
        _nip_is_valid,
        _digits,
    ),
    _IdentifierRule(
        "TELEFON",
        re.compile(r"(?<!\d)(?:\+48[ .-]?)?\d{3}(?:[ .-]?\d{3}){2}(?!\d)"),
        _phone_is_valid,
        _digits,
    ),
)


@dataclass
class DocumentAnonymizer:
    """Assign per-document, per-type markers while replacing recognised identifiers."""

    phrase_rules: tuple[PhraseRule, ...] = ()
    regex_rules: tuple[CustomRegexRule, ...] = ()
    _markers_by_value: dict[tuple[str, str], str] = field(default_factory=dict)
    _mapping: dict[str, str] = field(default_factory=dict)
    _counters: dict[str, int] = field(default_factory=dict)

    def _configured_rules(self) -> tuple[_ConfiguredRule, ...]:
        phrase_rules = tuple(
            _ConfiguredRule(
                marker_label=rule.marker_label,
                pattern=re.compile(re.escape(rule.phrase), re.IGNORECASE),
                canonicalize=str.casefold,
                priority=1,
                rule_id=rule.rule_id,
            )
            for rule in sorted(self.phrase_rules, key=lambda rule: rule.rule_id)
        )
        regex_rules = tuple(
            _ConfiguredRule(
                marker_label=rule.marker_label,
                pattern=re2.compile(rule.pattern),
                canonicalize=lambda value: value,
                priority=2,
                rule_id=rule.rule_id,
            )
            for rule in sorted(self.regex_rules, key=lambda rule: rule.rule_id)
        )
        return (*phrase_rules, *regex_rules)

    def anonymize(self, text: str) -> AnonymizationResult:
        matches: list[tuple[int, int, _IdentifierRule | _ConfiguredRule, str]] = []
        for rule in (*_RULES, *self._configured_rules()):
            for match in rule.pattern.finditer(text):
                value = match.group(0)
                if isinstance(rule, _IdentifierRule) and not rule.is_valid(value):
                    continue
                matches.append((match.start(), match.end(), rule, value))

        replacements: list[tuple[int, int, str]] = []
        occupied_until = -1
        for start, end, rule, value in sorted(
            matches,
            key=lambda item: (item[0], -(item[1] - item[0]), item[2].priority, item[2].rule_id),
        ):
            if start < occupied_until:
                continue
            canonical = rule.canonicalize(value)
            marker_label = rule.marker_type if isinstance(rule, _IdentifierRule) else rule.marker_label
            marker = self._marker_for(marker_label, canonical, value)
            replacements.append((start, end, marker))
            occupied_until = end

        transformed = text
        for start, end, marker in reversed(replacements):
            transformed = transformed[:start] + marker + transformed[end:]
        return AnonymizationResult(
            text=transformed,
            mapping=dict(self._mapping),
            replacements=tuple(replacements),
        )

    def _marker_for(self, marker_type: str, canonical_value: str, original_value: str) -> str:
        key = (marker_type, canonical_value)
        existing = self._markers_by_value.get(key)
        if existing is not None:
            return existing
        number = self._counters.get(marker_type, 0) + 1
        self._counters[marker_type] = number
        marker = f"[{marker_type}_{number}]"
        self._markers_by_value[key] = marker
        self._mapping[marker] = original_value
        return marker
