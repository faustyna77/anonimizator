from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import FastAPI, status
from fastapi.testclient import TestClient
import pytest

from backend.app.auth import AccessContext, get_current_access_context
from backend.app.config import Settings
from backend.app.document_service import (
    DocumentHistoryEntry,
    DocumentProcessingError,
    DocumentProcessingResult,
)
from backend.app.main import create_app


class FakeDocumentService:
    def __init__(self):
        self.calls = []

    def process_upload(self, access_context, *, content, original_filename, document_format, content_type):
        self.calls.append(
            {
                "access_context": access_context,
                "content": content,
                "original_filename": original_filename,
                "document_format": document_format,
                "content_type": content_type,
            }
        )
        return DocumentProcessingResult(
            document_id=UUID("00000000-0000-0000-0000-000000000003"),
            original_filename=original_filename,
            document_format=document_format,
            size_bytes=len(content),
            status="ready",
        )


class FailingDocumentService:
    def process_upload(self, *_args, **_kwargs):
        raise DocumentProcessingError("PDF text layer is unavailable; OCR is not supported in this MVP.")


class FakeDocumentAccessService:
    def __init__(self, entries_by_office, download_urls):
        self.entries_by_office = entries_by_office
        self.download_urls = download_urls
        self.list_calls = []
        self.download_calls = []

    def list_documents(self, access_context):
        self.list_calls.append(access_context)
        return tuple(self.entries_by_office.get(access_context.office_id, ()))

    def create_anonymized_download_url(self, access_context, document_id):
        self.download_calls.append((access_context, document_id))
        return self.download_urls.get((access_context.office_id, document_id))


def build_client(
    settings: Optional[Settings] = None, document_service=None, document_access_service=None
) -> tuple[TestClient, FastAPI]:
    app = create_app(
        settings or Settings(panel_allowed_origins="http://panel.test"),
        document_service=document_service,
        document_access_service=document_access_service,
    )
    return TestClient(app), app


def _context() -> AccessContext:
    return AccessContext(
        user_id="controlled-user",
        profile_id=UUID("00000000-0000-0000-0000-000000000001"),
        office_id=UUID("00000000-0000-0000-0000-000000000002"),
    )


def _controlled_file(filename="synthetic.pdf", content=b"synthetic PDF", content_type="application/pdf"):
    return {"file": (filename, content, content_type)}


def test_health_is_public_and_anonymize_requires_a_token():
    client, _ = build_client(document_service=FakeDocumentService())

    assert client.get("/health").json() == {"status": "ok"}
    response = client.post("/anonymize")

    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert response.json() == {"detail": "Invalid or missing access token"}
    assert response.headers["www-authenticate"] == "Bearer"


def test_anonymize_returns_403_when_the_verified_user_has_no_office_context():
    client, app = build_client(document_service=FakeDocumentService())

    def missing_office_context():
        from fastapi import HTTPException

        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Office access is unavailable")

    app.dependency_overrides[get_current_access_context] = missing_office_context
    response = client.post("/anonymize", headers={"Authorization": "Bearer controlled-token"})

    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert response.json() == {"detail": "Office access is unavailable"}


@pytest.mark.parametrize(
    ("files", "expected_detail"),
    [
        ({}, "A single file is required."),
        (_controlled_file("synthetic.txt", b"synthetic", "application/pdf"), "Only PDF and DOCX files are accepted."),
        (_controlled_file("synthetic.pdf", b"synthetic", "application/octet-stream"), "The file MIME type is not allowed."),
        (_controlled_file(content=b""), "The file must not be empty."),
        (_controlled_file(content=b"x" * (10 * 1024 * 1024 + 1)), "The file exceeds the 10 MB limit."),
        (
            [
                ("file", ("first.pdf", b"first", "application/pdf")),
                ("file", ("second.pdf", b"second", "application/pdf")),
            ],
            "Exactly one file is accepted.",
        ),
    ],
)
def test_anonymize_rejects_invalid_uploads(files, expected_detail):
    client, app = build_client(document_service=FakeDocumentService())
    app.dependency_overrides[get_current_access_context] = _context

    response = client.post("/anonymize", headers={"Authorization": "Bearer controlled-token"}, files=files)

    assert response.status_code == 422
    assert response.json() == {"detail": expected_detail}


def test_anonymize_rejects_client_selected_office_id():
    client, app = build_client(document_service=FakeDocumentService())
    app.dependency_overrides[get_current_access_context] = _context

    response = client.post(
        "/anonymize",
        headers={"Authorization": "Bearer controlled-token"},
        files=_controlled_file(),
        data={"office_id": "attacker-controlled-office"},
    )

    assert response.status_code == 422
    assert response.json() == {"detail": "office_id is not accepted."}


def test_anonymize_succeeds_with_a_server_derived_office_context_without_private_data():
    service = FakeDocumentService()
    client, app = build_client(document_service=service)
    context = _context()
    app.dependency_overrides[get_current_access_context] = lambda: context

    response = client.post(
        "/anonymize",
        headers={"Authorization": "Bearer controlled-token"},
        files=_controlled_file(content=b"synthetic PDF"),
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {
        "document_id": "00000000-0000-0000-0000-000000000003",
        "original_filename": "synthetic.pdf",
        "document_format": "pdf",
        "size_bytes": 13,
        "status": "ready",
    }
    assert service.calls == [
        {
            "access_context": context,
            "content": b"synthetic PDF",
            "original_filename": "synthetic.pdf",
            "document_format": "pdf",
            "content_type": "application/pdf",
        }
    ]
    assert "office_id" not in response.text
    assert "mapping" not in response.text


def test_anonymize_returns_a_safe_basename_for_uploaded_filename_metadata():
    service = FakeDocumentService()
    client, app = build_client(document_service=service)
    app.dependency_overrides[get_current_access_context] = _context

    response = client.post(
        "/anonymize",
        headers={"Authorization": "Bearer controlled-token"},
        files=_controlled_file(filename="C:\\restricted\\umowa.pdf"),
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["original_filename"] == "umowa.pdf"
    assert service.calls[0]["original_filename"] == "umowa.pdf"


def test_documents_and_download_routes_use_the_server_derived_office_context():
    first_context = _context()
    second_context = AccessContext(
        user_id="second-controlled-user",
        profile_id=UUID("00000000-0000-0000-0000-000000000004"),
        office_id=UUID("00000000-0000-0000-0000-000000000005"),
    )
    document_id = UUID("00000000-0000-0000-0000-000000000003")
    access_service = FakeDocumentAccessService(
        {
            first_context.office_id: (
                DocumentHistoryEntry(
                    document_id=document_id,
                    original_filename="umowa-klienta.pdf",
                    document_format="pdf",
                    size_bytes=42,
                    status="ready",
                    created_at=datetime(2026, 10, 4, tzinfo=timezone.utc),
                ),
            )
        },
        {(first_context.office_id, document_id): "https://storage.example.test/temporary-result"},
    )
    client, app = build_client(
        document_service=FakeDocumentService(), document_access_service=access_service
    )
    app.dependency_overrides[get_current_access_context] = lambda: first_context

    history = client.get("/documents", headers={"Authorization": "Bearer controlled-token"})
    own_download = client.get(
        f"/documents/{document_id}/anonymized-download",
        headers={"Authorization": "Bearer controlled-token"},
    )
    app.dependency_overrides[get_current_access_context] = lambda: second_context
    cross_office_history = client.get("/documents", headers={"Authorization": "Bearer controlled-token"})
    cross_office_download = client.get(
        f"/documents/{document_id}/anonymized-download",
        headers={"Authorization": "Bearer controlled-token"},
    )

    assert history.json() == [
        {
            "document_id": str(document_id),
            "original_filename": "umowa-klienta.pdf",
            "document_format": "pdf",
            "size_bytes": 42,
            "status": "ready",
            "created_at": "2026-10-04T00:00:00Z",
        }
    ]
    assert "object_key" not in history.text
    assert "mapping" not in history.text
    assert own_download.json() == {"download_url": "https://storage.example.test/temporary-result"}
    assert cross_office_history.json() == []
    assert cross_office_download.status_code == status.HTTP_404_NOT_FOUND
    assert access_service.list_calls == [first_context, second_context]
    assert access_service.download_calls == [
        (first_context, document_id),
        (second_context, document_id),
    ]


def test_anonymize_returns_a_controlled_processing_error():
    client, app = build_client(document_service=FailingDocumentService())
    app.dependency_overrides[get_current_access_context] = _context

    response = client.post(
        "/anonymize",
        headers={"Authorization": "Bearer controlled-token"},
        files=_controlled_file(),
    )

    assert response.status_code == 422
    assert response.json() == {
        "detail": "PDF text layer is unavailable; OCR is not supported in this MVP."
    }


def test_production_disables_docs_and_uses_explicit_cors_origins():
    settings = Settings(
        app_environment="production",
        panel_allowed_origins="https://panel.example.com, https://admin.example.com",
    )
    client, app = build_client(settings, document_service=FakeDocumentService())

    assert app.user_middleware[0].kwargs["allow_origins"] == [
        "https://panel.example.com",
        "https://admin.example.com",
    ]
    assert client.get("/docs").status_code == status.HTTP_404_NOT_FOUND
    assert client.get("/redoc").status_code == status.HTTP_404_NOT_FOUND
    assert client.get("/openapi.json").status_code == status.HTTP_404_NOT_FOUND


def test_local_environment_exposes_api_documentation():
    client, _ = build_client(
        Settings(app_environment="local", panel_allowed_origins="http://localhost:5173"),
        document_service=FakeDocumentService(),
    )

    assert client.get("/docs").status_code == status.HTTP_200_OK
    assert client.get("/redoc").status_code == status.HTTP_200_OK
    assert client.get("/openapi.json").status_code == status.HTTP_200_OK


def test_anonymize_api_contract_exposes_a_multipart_file_field():
    client, _ = build_client(document_service=FakeDocumentService())

    schema = client.get("/openapi.json").json()
    request_schema = schema["paths"]["/anonymize"]["post"]["requestBody"]["content"]["multipart/form-data"][
        "schema"
    ]

    assert request_schema == {
        "type": "object",
        "properties": {"file": {"type": "string", "format": "binary"}},
        "required": ["file"],
    }


def test_production_rejects_wildcard_cors_origins():
    settings = Settings(app_environment="production", panel_allowed_origins="*")

    with pytest.raises(RuntimeError, match="cannot contain"):
        _ = settings.allowed_origins
