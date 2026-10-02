"""FastAPI dependencies for verified Supabase users and their Fly office context."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from backend.app.config import get_settings
from backend.app.database import get_session_factory
from backend.app.repository import get_or_create_profile_for_verified_user

_bearer_scheme = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class AccessContext:
    """Trusted identity and office relation derived server-side for a product route."""

    user_id: str
    profile_id: UUID
    office_id: UUID


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or missing access token",
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_verified_user_id(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme),
) -> str:
    """Verify a bearer token with Supabase Auth and return its immutable user ID."""
    if credentials is None or not credentials.credentials:
        raise _unauthorized()

    settings = get_settings()
    try:
        settings.require_protected_route_configuration()
        from supabase import create_client

        response = create_client(
            settings.supabase_url,
            settings.supabase_anon_key,
        ).auth.get_user(credentials.credentials)
        user_id = getattr(getattr(response, "user", None), "id", None)
    except Exception as error:
        raise _unauthorized() from error

    if not user_id:
        raise _unauthorized()
    return str(user_id)


def get_current_access_context(
    user_id: str = Depends(get_verified_user_id),
) -> AccessContext:
    """Create or retrieve the one permitted office relation for a verified user."""
    session = None
    try:
        session = get_session_factory()()
        with session.begin():
            profile = get_or_create_profile_for_verified_user(session, user_id)
            context = AccessContext(
                user_id=user_id,
                profile_id=profile.id,
                office_id=profile.office_id,
            )
        return context
    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Office access is unavailable",
        ) from error
    finally:
        if session is not None:
            session.close()
