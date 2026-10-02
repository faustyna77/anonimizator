from typing import Optional
from uuid import UUID

from fastapi import FastAPI, HTTPException, status
from fastapi.testclient import TestClient
import pytest

from backend.app.auth import AccessContext, get_current_access_context
from backend.app.config import Settings
from backend.app.main import create_app


def build_client(settings: Optional[Settings] = None) -> tuple[TestClient, FastAPI]:
    app = create_app(settings or Settings(panel_allowed_origins="http://panel.test"))
    return TestClient(app), app


def test_health_is_public_and_anonymize_requires_a_token():
    client, _ = build_client()

    assert client.get("/health").json() == {"status": "ok"}
    response = client.post("/anonymize")

    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert response.json() == {"detail": "Invalid or missing access token"}
    assert response.headers["www-authenticate"] == "Bearer"


def test_anonymize_returns_403_when_the_verified_user_has_no_office_context():
    client, app = build_client()

    def missing_office_context():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Office access is unavailable")

    app.dependency_overrides[get_current_access_context] = missing_office_context
    response = client.post("/anonymize", headers={"Authorization": "Bearer controlled-token"})

    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert response.json() == {"detail": "Office access is unavailable"}


def test_anonymize_succeeds_only_with_a_server_derived_office_context():
    client, app = build_client()
    context = AccessContext(
        user_id="controlled-user",
        profile_id=UUID("00000000-0000-0000-0000-000000000001"),
        office_id=UUID("00000000-0000-0000-0000-000000000002"),
    )
    app.dependency_overrides[get_current_access_context] = lambda: context

    response = client.post(
        "/anonymize",
        headers={"Authorization": "Bearer controlled-token"},
        json={"office_id": "attacker-controlled-office"},
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {"status": "anonymized", "backend": "anonimizator"}


def test_production_disables_docs_and_uses_explicit_cors_origins():
    settings = Settings(
        app_environment="production",
        panel_allowed_origins="https://panel.example.com, https://admin.example.com",
    )
    client, app = build_client(settings)

    assert app.user_middleware[0].kwargs["allow_origins"] == [
        "https://panel.example.com",
        "https://admin.example.com",
    ]
    assert client.get("/docs").status_code == status.HTTP_404_NOT_FOUND
    assert client.get("/redoc").status_code == status.HTTP_404_NOT_FOUND
    assert client.get("/openapi.json").status_code == status.HTTP_404_NOT_FOUND


def test_local_environment_exposes_api_documentation():
    client, _ = build_client(Settings(app_environment="local", panel_allowed_origins="http://localhost:5173"))

    assert client.get("/docs").status_code == status.HTTP_200_OK
    assert client.get("/redoc").status_code == status.HTTP_200_OK
    assert client.get("/openapi.json").status_code == status.HTTP_200_OK


def test_production_rejects_wildcard_cors_origins():
    settings = Settings(app_environment="production", panel_allowed_origins="*")

    with pytest.raises(RuntimeError, match="cannot contain"):
        _ = settings.allowed_origins
