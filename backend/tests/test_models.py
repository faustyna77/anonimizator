from sqlalchemy import UniqueConstraint

from backend.app.models import Office, Profile


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
