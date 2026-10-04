"""Detection and deterministic marker assignment for supported document identifiers."""
from __future__ import annotations

from dataclasses import dataclass, field
import re
from typing import Callable


@dataclass(frozen=True)
class AnonymizationResult:
    """Transformed text, mapping, and source offsets for format-specific adapters."""

    text: str
    mapping: dict[str, str]
    replacements: tuple[tuple[int, int, str], ...] = ()


@dataclass(frozen=True)
class _IdentifierRule:
    marker_type: str
    pattern: re.Pattern[str]
    is_valid: Callable[[str], bool]
    canonicalize: Callable[[str], str]


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

    _markers_by_value: dict[tuple[str, str], str] = field(default_factory=dict)
    _mapping: dict[str, str] = field(default_factory=dict)
    _counters: dict[str, int] = field(default_factory=dict)

    def anonymize(self, text: str) -> AnonymizationResult:
        matches: list[tuple[int, int, _IdentifierRule, str]] = []
        for rule in _RULES:
            for match in rule.pattern.finditer(text):
                value = match.group(0)
                if rule.is_valid(value):
                    matches.append((match.start(), match.end(), rule, value))

        replacements: list[tuple[int, int, str]] = []
        occupied_until = -1
        for start, end, rule, value in sorted(matches, key=lambda item: (item[0], -(item[1] - item[0]))):
            if start < occupied_until:
                continue
            canonical = rule.canonicalize(value)
            marker = self._marker_for(rule.marker_type, canonical, value)
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
