"""Office-scoped persistence operations for custom anonymization rules."""
from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.app.auth import AccessContext
from backend.app.models import Office, OfficeAnonymizationRule

MAX_ACTIVE_RULES_PER_OFFICE = 50


class ActiveRuleLimitExceeded(ValueError):
    """The office already has the maximum number of active rules."""


def _lock_office(session: Session, access_context: AccessContext) -> None:
    office = session.scalar(
        select(Office).where(Office.id == access_context.office_id).with_for_update()
    )
    if office is None:
        raise RuntimeError("Office access is unavailable")


def _active_rule_count(session: Session, access_context: AccessContext) -> int:
    return int(
        session.scalar(
            select(func.count())
            .select_from(OfficeAnonymizationRule)
            .where(
                OfficeAnonymizationRule.office_id == access_context.office_id,
                OfficeAnonymizationRule.enabled.is_(True),
            )
        )
        or 0
    )


def _ensure_active_rule_capacity(session: Session, access_context: AccessContext) -> None:
    _lock_office(session, access_context)
    if _active_rule_count(session, access_context) >= MAX_ACTIVE_RULES_PER_OFFICE:
        raise ActiveRuleLimitExceeded("The office has reached its active rule limit.")


def create_office_rule(
    session: Session,
    access_context: AccessContext,
    *,
    kind: str,
    pattern: str,
    marker_label: str,
    enabled: bool = True,
) -> OfficeAnonymizationRule:
    """Create a rule using only the trusted office from access context."""
    if enabled:
        _ensure_active_rule_capacity(session, access_context)
    rule = OfficeAnonymizationRule(
        office_id=access_context.office_id,
        kind=kind,
        pattern=pattern,
        marker_label=marker_label,
        enabled=enabled,
    )
    session.add(rule)
    session.flush()
    return rule


def get_office_rule_for_access_context(
    session: Session,
    access_context: AccessContext,
    rule_id: UUID,
) -> OfficeAnonymizationRule | None:
    """Return a rule only when it belongs to the trusted office context."""
    return session.scalar(
        select(OfficeAnonymizationRule).where(
            OfficeAnonymizationRule.id == rule_id,
            OfficeAnonymizationRule.office_id == access_context.office_id,
        )
    )


def list_office_rules_for_access_context(
    session: Session,
    access_context: AccessContext,
) -> list[OfficeAnonymizationRule]:
    """List all enabled and disabled rules inside one trusted office scope."""
    return list(
        session.scalars(
            select(OfficeAnonymizationRule)
            .where(OfficeAnonymizationRule.office_id == access_context.office_id)
            .order_by(OfficeAnonymizationRule.created_at.asc(), OfficeAnonymizationRule.id.asc())
        )
    )


def list_enabled_office_rules_for_access_context(
    session: Session,
    access_context: AccessContext,
) -> list[OfficeAnonymizationRule]:
    """Return the active snapshot for one document-processing request."""
    return list(
        session.scalars(
            select(OfficeAnonymizationRule)
            .where(
                OfficeAnonymizationRule.office_id == access_context.office_id,
                OfficeAnonymizationRule.enabled.is_(True),
            )
            .order_by(OfficeAnonymizationRule.kind.asc(), OfficeAnonymizationRule.id.asc())
        )
    )


def update_office_rule(
    session: Session,
    access_context: AccessContext,
    rule_id: UUID,
    *,
    kind: str,
    pattern: str,
    marker_label: str,
    enabled: bool,
) -> OfficeAnonymizationRule | None:
    """Update a rule only when it belongs to the trusted office context."""
    rule = get_office_rule_for_access_context(session, access_context, rule_id)
    if rule is None:
        return None
    if enabled and not rule.enabled:
        _ensure_active_rule_capacity(session, access_context)
    rule.kind = kind
    rule.pattern = pattern
    rule.marker_label = marker_label
    rule.enabled = enabled
    session.flush()
    return rule


def delete_office_rule(
    session: Session,
    access_context: AccessContext,
    rule_id: UUID,
) -> bool:
    """Delete a rule only when it belongs to the trusted office context."""
    rule = get_office_rule_for_access_context(session, access_context, rule_id)
    if rule is None:
        return False
    session.delete(rule)
    session.flush()
    return True
