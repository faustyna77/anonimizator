"""Controlled provider tests: no test reaches a real Supabase project."""

from types import ModuleType, SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from backend.app import auth
from backend.app.config import Settings


def _credentials(token: str = "controlled-token") -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


def _install_controlled_supabase(monkeypatch, user_id: str | None) -> None:
    provider = ModuleType("supabase")
    provider.create_client = lambda _url, _anon_key: SimpleNamespace(
        auth=SimpleNamespace(
            get_user=lambda token: SimpleNamespace(
                user=SimpleNamespace(id=user_id) if token == "controlled-token" else None
            )
        )
    )
    monkeypatch.setitem(__import__("sys").modules, "supabase", provider)


def _settings() -> Settings:
    return Settings(
        database_url="postgresql+psycopg://postgres:postgres@localhost:5432/anonimizator_test",
        supabase_url="https://auth.example.test",
        supabase_anon_key="public-test-key",
    )


def test_verified_user_id_comes_from_a_controlled_provider_response(monkeypatch):
    _install_controlled_supabase(monkeypatch, "controlled-user")
    monkeypatch.setattr(auth, "get_settings", _settings)

    assert auth.get_verified_user_id(_credentials()) == "controlled-user"


def test_rejected_controlled_provider_response_returns_401(monkeypatch):
    _install_controlled_supabase(monkeypatch, None)
    monkeypatch.setattr(auth, "get_settings", _settings)

    with pytest.raises(HTTPException) as error:
        auth.get_verified_user_id(_credentials())

    assert error.value.status_code == 401
    assert error.value.detail == "Invalid or missing access token"
