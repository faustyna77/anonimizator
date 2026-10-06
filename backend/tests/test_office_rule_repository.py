from threading import Barrier, Thread

import pytest
from sqlalchemy import inspect, select

from backend.app.auth import AccessContext
from backend.app.models import Office, Profile
from backend.app.office_rule_repository import (
    ActiveRuleLimitExceeded,
    MAX_ACTIVE_RULES_PER_OFFICE,
    create_office_rule,
    delete_office_rule,
    get_office_rule_for_access_context,
    list_office_rules_for_access_context,
    update_office_rule,
)


@pytest.mark.postgresql
def test_office_rule_migration_creates_scoped_constraints(migrated_session_factory):
    with migrated_session_factory() as session:
        inspector = inspect(session.bind)
        foreign_key_names = {
            foreign_key["name"] for foreign_key in inspector.get_foreign_keys("office_anonymization_rules")
        }
        index_names = {index["name"] for index in inspector.get_indexes("office_anonymization_rules")}
        unique_constraint_names = {
            constraint["name"] for constraint in inspector.get_unique_constraints("office_anonymization_rules")
        }
        check_constraint_names = {
            constraint["name"] for constraint in inspector.get_check_constraints("office_anonymization_rules")
        }

    assert "fk_office_rules_office" in foreign_key_names
    assert "ix_office_rules_office_enabled" in index_names
    assert "uq_office_rules_kind_pattern" in unique_constraint_names
    assert "ck_office_rules_kind" in check_constraint_names


@pytest.mark.postgresql
def test_office_rule_repository_never_reads_or_mutates_another_office_rule(migrated_session_factory):
    with migrated_session_factory.begin() as session:
        first_office = Office(name="First office")
        second_office = Office(name="Second office")
        first_profile = Profile(user_id="first-user", office=first_office)
        second_profile = Profile(user_id="second-user", office=second_office)
        session.add_all([first_profile, second_profile])
        session.flush()
        first_context = AccessContext("first-user", first_profile.id, first_office.id)
        second_context = AccessContext("second-user", second_profile.id, second_office.id)

        rule = create_office_rule(
            session,
            first_context,
            kind="phrase",
            pattern="Jan Kowalski",
            marker_label="KLIENT",
        )

        assert list_office_rules_for_access_context(session, second_context) == []
        assert get_office_rule_for_access_context(session, second_context, rule.id) is None
        assert (
            update_office_rule(
                session,
                second_context,
                rule.id,
                kind="regex",
                pattern=r"SPRAWA-\\d{4}",
                marker_label="NUMER_SPRAWY",
                enabled=False,
            )
            is None
        )
        assert delete_office_rule(session, second_context, rule.id) is False

        updated = update_office_rule(
            session,
            first_context,
            rule.id,
            kind="regex",
            pattern=r"SPRAWA-\\d{4}",
            marker_label="NUMER_SPRAWY",
            enabled=False,
        )

        assert updated is rule
        assert rule.kind == "regex"
        assert rule.enabled is False
        assert delete_office_rule(session, first_context, rule.id) is True
        assert list_office_rules_for_access_context(session, first_context) == []


@pytest.mark.postgresql
def test_office_rule_repository_enforces_active_rule_limit(migrated_session_factory):
    with migrated_session_factory.begin() as session:
        office = Office(name="Rule limit office")
        profile = Profile(user_id="rule-limit-user", office=office)
        session.add(profile)
        session.flush()
        access_context = AccessContext("rule-limit-user", profile.id, office.id)

        for index in range(MAX_ACTIVE_RULES_PER_OFFICE):
            create_office_rule(
                session,
                access_context,
                kind="phrase",
                pattern=f"Client {index}",
                marker_label="KLIENT",
            )



@pytest.mark.postgresql
def test_parallel_active_rule_creates_cannot_exceed_the_office_limit(migrated_session_factory):
    with migrated_session_factory.begin() as session:
        office = Office(name="Concurrent rule limit office")
        profile = Profile(user_id="concurrent-rule-limit-user", office=office)
        session.add(profile)
        session.flush()
        access_context = AccessContext("concurrent-rule-limit-user", profile.id, office.id)
        for index in range(MAX_ACTIVE_RULES_PER_OFFICE - 1):
            create_office_rule(
                session,
                access_context,
                kind="phrase",
                pattern=f"Existing client {index}",
                marker_label="KLIENT",
            )

    start = Barrier(3)
    outcomes: list[str] = []

    def create_final_rule(index: int) -> None:
        try:
            with migrated_session_factory.begin() as session:
                start.wait(timeout=5)
                create_office_rule(
                    session,
                    access_context,
                    kind="phrase",
                    pattern=f"Concurrent client {index}",
                    marker_label="KLIENT",
                )
        except ActiveRuleLimitExceeded:
            outcomes.append("limit")
        except Exception as error:  # pragma: no cover - surfaced by the assertion below
            outcomes.append(f"unexpected:{type(error).__name__}")
        else:
            outcomes.append("created")

    workers = [Thread(target=create_final_rule, args=(index,)) for index in range(2)]
    for worker in workers:
        worker.start()
    start.wait(timeout=5)
    for worker in workers:
        worker.join(timeout=5)

    assert all(not worker.is_alive() for worker in workers)
    assert sorted(outcomes) == ["created", "limit"]
