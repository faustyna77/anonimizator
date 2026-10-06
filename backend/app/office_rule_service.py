"""Office-scoped rule validation, persistence, and processing snapshots."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Literal, Protocol
from uuid import UUID

from sqlalchemy.orm import Session

from backend.app.anonymization import (
    CustomRegexRule,
    DocumentAnonymizer,
    PhraseRule,
    RuleValidationError,
)
from backend.app.auth import AccessContext
from backend.app.config import Settings
from backend.app.database import get_session_factory
from backend.app.models import OfficeAnonymizationRule
from backend.app import office_rule_repository


RuleKind = Literal["phrase", "regex"]


class OfficeRulePayloadError(ValueError):
    """A client payload cannot be accepted without exposing its content."""


@dataclass(frozen=True)
class OfficeRuleInput:
    kind: RuleKind
    pattern: str
    marker_label: str
    enabled: bool


@dataclass(frozen=True)
class OfficeRule:
    rule_id: UUID
    kind: RuleKind
    pattern: str
    marker_label: str
    enabled: bool


class OfficeRuleProcessor(Protocol):
    def list_rules(self, access_context: AccessContext) -> tuple[OfficeRule, ...]: ...

    def create_rule(self, access_context: AccessContext, rule: OfficeRuleInput) -> OfficeRule: ...

    def update_rule(
        self, access_context: AccessContext, rule_id: UUID, rule: OfficeRuleInput
    ) -> OfficeRule | None: ...

    def delete_rule(self, access_context: AccessContext, rule_id: UUID) -> bool: ...


class OfficeRuleSnapshotProvider(Protocol):
    def create_active_anonymizer(self, access_context: AccessContext) -> DocumentAnonymizer: ...


def parse_office_rule_payload(payload: Any) -> OfficeRuleInput:
    """Validate the complete public shape without returning Pydantic input details."""
    if not isinstance(payload, dict) or set(payload) != {"kind", "pattern", "marker_label", "enabled"}:
        raise OfficeRulePayloadError("The rule payload is invalid.")

    kind = payload["kind"]
    pattern = payload["pattern"]
    marker_label = payload["marker_label"]
    enabled = payload["enabled"]
    if kind not in {"phrase", "regex"} or not isinstance(pattern, str) or not isinstance(marker_label, str):
        raise OfficeRulePayloadError("The rule payload is invalid.")
    if type(enabled) is not bool:
        raise OfficeRulePayloadError("The rule payload is invalid.")

    try:
        if kind == "phrase":
            PhraseRule(rule_id="validation", phrase=pattern, marker_label=marker_label)
        else:
            CustomRegexRule(rule_id="validation", pattern=pattern, marker_label=marker_label)
    except RuleValidationError as error:
        raise OfficeRulePayloadError("The rule payload is invalid.") from error
    return OfficeRuleInput(kind=kind, pattern=pattern, marker_label=marker_label, enabled=enabled)


class OfficeRuleService:
    """Use the trusted access context for all rule persistence and snapshots."""

    def __init__(self, *, session_factory: Callable[[], Session]):
        self._session_factory = session_factory

    @classmethod
    def from_settings(cls, _settings: Settings) -> "OfficeRuleService":
        return cls(session_factory=get_session_factory())

    def list_rules(self, access_context: AccessContext) -> tuple[OfficeRule, ...]:
        session = self._session_factory()
        try:
            with session.begin():
                return tuple(
                    _to_office_rule(rule)
                    for rule in office_rule_repository.list_office_rules_for_access_context(session, access_context)
                )
        finally:
            session.close()

    def create_rule(self, access_context: AccessContext, rule: OfficeRuleInput) -> OfficeRule:
        session = self._session_factory()
        try:
            with session.begin():
                created = office_rule_repository.create_office_rule(
                    session,
                    access_context,
                    kind=rule.kind,
                    pattern=rule.pattern,
                    marker_label=rule.marker_label,
                    enabled=rule.enabled,
                )
                return _to_office_rule(created)
        finally:
            session.close()

    def update_rule(
        self, access_context: AccessContext, rule_id: UUID, rule: OfficeRuleInput
    ) -> OfficeRule | None:
        session = self._session_factory()
        try:
            with session.begin():
                updated = office_rule_repository.update_office_rule(
                    session,
                    access_context,
                    rule_id,
                    kind=rule.kind,
                    pattern=rule.pattern,
                    marker_label=rule.marker_label,
                    enabled=rule.enabled,
                )
                return None if updated is None else _to_office_rule(updated)
        finally:
            session.close()

    def delete_rule(self, access_context: AccessContext, rule_id: UUID) -> bool:
        session = self._session_factory()
        try:
            with session.begin():
                return office_rule_repository.delete_office_rule(session, access_context, rule_id)
        finally:
            session.close()

    def create_active_anonymizer(self, access_context: AccessContext) -> DocumentAnonymizer:
        session = self._session_factory()
        try:
            with session.begin():
                active_rules = tuple(
                    office_rule_repository.list_enabled_office_rules_for_access_context(session, access_context)
                )
        finally:
            session.close()

        phrase_rules = []
        regex_rules = []
        for rule in active_rules:
            if rule.kind == "phrase":
                phrase_rules.append(
                    PhraseRule(rule_id=str(rule.id), phrase=rule.pattern, marker_label=rule.marker_label)
                )
            elif rule.kind == "regex":
                regex_rules.append(
                    CustomRegexRule(rule_id=str(rule.id), pattern=rule.pattern, marker_label=rule.marker_label)
                )
            else:
                raise RuleValidationError("A stored rule is invalid.")
        return DocumentAnonymizer(phrase_rules=tuple(phrase_rules), regex_rules=tuple(regex_rules))


def _to_office_rule(rule: OfficeAnonymizationRule) -> OfficeRule:
    return OfficeRule(
        rule_id=rule.id,
        kind=rule.kind,
        pattern=rule.pattern,
        marker_label=rule.marker_label,
        enabled=rule.enabled,
    )
