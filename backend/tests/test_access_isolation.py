from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from backend.app import auth
from backend.app.config import Settings
from backend.app.main import create_app
from backend.app.models import Profile


@pytest.mark.postgresql
def test_anonymize_rejects_client_office_id_after_deriving_verified_users_office(
    migrated_session_factory, monkeypatch
):
    monkeypatch.setattr(auth, "get_session_factory", lambda: migrated_session_factory)

    first_context = auth.get_current_access_context("first-controlled-user")
    second_context = auth.get_current_access_context("second-controlled-user")
    repeated_first_context = auth.get_current_access_context("first-controlled-user")

    assert first_context.office_id != second_context.office_id
    assert repeated_first_context.office_id == first_context.office_id

    app = create_app(Settings(panel_allowed_origins="http://panel.test"))
    app.dependency_overrides[auth.get_verified_user_id] = lambda: "first-controlled-user"
    client = TestClient(app)

    response = client.post(
        "/anonymize",
        headers={"Authorization": "Bearer controlled-token"},
        files={"file": ("synthetic.pdf", b"synthetic", "application/pdf")},
        data={"office_id": str(second_context.office_id)},
    )

    assert response.status_code == 422
    with migrated_session_factory() as session:
        profiles = {
            profile.user_id: profile.office_id
            for profile in session.scalars(select(Profile)).all()
        }
    assert profiles == {
        "first-controlled-user": first_context.office_id,
        "second-controlled-user": second_context.office_id,
    }
    assert UUID(str(profiles["first-controlled-user"])) != second_context.office_id
