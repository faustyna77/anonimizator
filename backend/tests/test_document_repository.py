from uuid import uuid4

import pytest
from sqlalchemy import inspect

from backend.app.auth import AccessContext
from backend.app.document_repository import (
    create_processing_document,
    get_document_for_access_context,
    mark_document_ready,
)
from backend.app.models import Office, Profile
from backend.app.storage import StorageObjectKey


@pytest.mark.postgresql
def test_document_migration_creates_office_ownership_constraints(migrated_session_factory):
    with migrated_session_factory() as session:
        inspector = inspect(session.bind)
        columns = {column["name"]: column for column in inspector.get_columns("documents")}
        foreign_key_names = {foreign_key["name"] for foreign_key in inspector.get_foreign_keys("documents")}
        index_names = {index["name"] for index in inspector.get_indexes("documents")}
        check_names = {constraint["name"] for constraint in inspector.get_check_constraints("documents")}

    assert "fk_documents_uploader_office" in foreign_key_names
    assert "ix_documents_office_id" in index_names
    assert "ck_documents_status" in check_names
    assert columns["original_filename"]["nullable"] is True


@pytest.mark.postgresql
def test_document_repository_filters_every_lookup_by_trusted_office(migrated_session_factory):
    with migrated_session_factory.begin() as session:
        first_office = Office(name="First office")
        second_office = Office(name="Second office")
        first_profile = Profile(user_id="first-user", office=first_office)
        second_profile = Profile(user_id="second-user", office=second_office)
        session.add_all([first_profile, second_profile])
        session.flush()
        first_context = AccessContext(
            user_id="first-user",
            profile_id=first_profile.id,
            office_id=first_office.id,
        )
        second_context = AccessContext(
            user_id="second-user",
            profile_id=second_profile.id,
            office_id=second_office.id,
        )
        document = create_processing_document(
            session,
            first_context,
            original_filename="first-office.pdf",
            document_format="pdf",
            size_bytes=42,
            original_object_key=StorageObjectKey(f"offices/{first_office.id}/documents/{uuid4()}/original"),
        )
        document_id = document.id
        assert get_document_for_access_context(session, second_context, document_id) is None

        updated = mark_document_ready(
            session,
            first_context,
            document_id,
            anonymized_object_key=StorageObjectKey(
                f"offices/{first_office.id}/documents/{document_id}/anonymized"
            ),
            encrypted_mapping=b"encrypted-test-mapping",
        )

        assert updated is not None
        assert updated.original_filename == "first-office.pdf"
        assert updated.status == "ready"
        assert updated.encrypted_mapping == b"encrypted-test-mapping"
