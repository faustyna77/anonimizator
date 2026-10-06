from sqlalchemy import CheckConstraint, ForeignKeyConstraint, Index, UniqueConstraint

from backend.app.models import Document, Office, OfficeAnonymizationRule, Profile


def test_profile_uses_supabase_user_id_and_one_office_relation():
    constraints = {
        constraint.name
        for constraint in Profile.__table__.constraints
        if isinstance(constraint, UniqueConstraint)
    }

    assert "uq_profiles_user_id" in constraints
    assert "uq_profiles_office_id" in constraints
    assert Profile.__table__.c.user_id.nullable is False
    assert Profile.__table__.c.office_id.nullable is False
    assert Office.__tablename__ == "offices"


def test_document_metadata_has_office_owned_storage_fields_and_private_mapping():
    constraint_names = {constraint.name for constraint in Document.__table__.constraints}
    indexes = {index.name for index in Document.__table__.indexes if isinstance(index, Index)}
    foreign_keys = {
        constraint.name
        for constraint in Document.__table__.constraints
        if isinstance(constraint, ForeignKeyConstraint)
    }

    assert "ck_documents_status" in constraint_names
    assert "fk_documents_uploader_office" in foreign_keys
    assert "ix_documents_office_id" in indexes
    assert Document.__table__.c.office_id.nullable is False
    assert Document.__table__.c.uploaded_by_profile_id.nullable is False
    assert Document.__table__.c.original_filename.nullable is True
    assert Document.__table__.c.original_filename.type.length == 255
    assert Document.__table__.c.encrypted_mapping.type.python_type is bytes
    status_constraint = next(
        constraint
        for constraint in Document.__table__.constraints
        if isinstance(constraint, CheckConstraint) and constraint.name == "ck_documents_status"
    )
    assert "status IN ('processing', 'ready', 'failed')" == str(status_constraint.sqltext)


def test_office_rules_are_office_owned_and_allow_a_shared_marker_label():
    constraint_names = {constraint.name for constraint in OfficeAnonymizationRule.__table__.constraints}
    indexes = {index.name for index in OfficeAnonymizationRule.__table__.indexes if isinstance(index, Index)}
    foreign_keys = {
        constraint.name
        for constraint in OfficeAnonymizationRule.__table__.constraints
        if isinstance(constraint, ForeignKeyConstraint)
    }

    assert "ck_office_rules_kind" in constraint_names
    assert "uq_office_rules_kind_pattern" in constraint_names
    assert "fk_office_rules_office" in foreign_keys
    assert "ix_office_rules_office_enabled" in indexes
    assert "uq_office_rules_marker_label" not in constraint_names
    assert OfficeAnonymizationRule.__table__.c.enabled.default.arg is True
    assert OfficeAnonymizationRule.__table__.c.pattern.type.length == 512
