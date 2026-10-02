"""Repository for atomically deriving an office from a verified Supabase user."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from backend.app.models import Office, Profile


def get_or_create_profile_for_verified_user(session: Session, user_id: str) -> Profile:
    """Create exactly one profile and office for a verified user in one transaction.

    The user ID comes from a verified Supabase token in Phase 2; callers never pass
    an office identifier or name. A transaction-scoped PostgreSQL advisory lock
    serializes first use of the same external account.
    """
    session.execute(select(func.pg_advisory_xact_lock(func.hashtext(user_id))))
    profile = session.scalar(
        select(Profile)
        .options(joinedload(Profile.office))
        .where(Profile.user_id == user_id)
        .with_for_update()
    )
    if profile is not None:
        return profile

    office = Office(name="Kancelaria")
    profile = Profile(user_id=user_id, office=office)
    session.add(profile)
    session.flush()
    return profile
