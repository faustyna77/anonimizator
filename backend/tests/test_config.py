import pytest

from backend.app.config import Settings


def test_auth_configuration_rejects_missing_values_without_echoing_environment(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "public-key")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "server-secret-that-must-not-leak")
    monkeypatch.delenv("DATABASE_URL", raising=False)

    settings = Settings()

    with pytest.raises(RuntimeError) as error:
        settings.require_protected_route_configuration()

    message = str(error.value)
    assert "DATABASE_URL" in message
    assert "server-secret-that-must-not-leak" not in message
    assert "public-key" not in message


def test_public_auth_configuration_excludes_server_credentials(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "public-key")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "server-secret")
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://user:password@localhost:5432/app")

    settings = Settings()

    assert settings.public_auth_configuration == {
        "url": "https://example.supabase.co",
        "anon_key": "public-key",
    }
    assert "server-secret" not in settings.public_auth_configuration.values()
