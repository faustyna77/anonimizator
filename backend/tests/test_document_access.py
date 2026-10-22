from datetime import datetime, timezone
import json
from types import SimpleNamespace
from uuid import UUID

from backend.app import document_service
from backend.app.auth import AccessContext
from backend.app.config import Settings
from backend.app.document_service import DocumentAccessService, ResponseDeanonymizationService
from backend.app.storage import DocumentMappingCipher, DocumentStorage


class FakeS3Client:
    def __init__(self):
        self.presign_calls = []

    def generate_presigned_url(self, operation, **kwargs):
        self.presign_calls.append((operation, kwargs))
        return "https://storage.example.test/temporary-result"


class FakeSession:
    def begin(self):
        return self

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def close(self):
        pass


def _settings() -> Settings:
    return Settings(
        _env_file=None,
        s3_bucket="test-documents",
        s3_region="eu-central-1",
        aws_access_key_id="test-access-key",
        aws_secret_access_key="test-secret-key",
        document_mapping_encryption_key="MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
    )


def _context(office_id: str) -> AccessContext:
    return AccessContext(
        user_id=f"user-{office_id[-1]}",
        profile_id=UUID(f"00000000-0000-0000-0000-00000000000{office_id[-1]}"),
        office_id=UUID(office_id),
    )


def _document(document_id: str, office_id: str, *, status: str = "ready") -> SimpleNamespace:
    return SimpleNamespace(
        id=UUID(document_id),
        office_id=UUID(office_id),
        original_filename="umowa-klienta.pdf",
        document_format="pdf",
        size_bytes=42,
        status=status,
        anonymized_object_key=(
            f"offices/{office_id}/documents/{document_id}/anonymized" if status == "ready" else None
        ),
        encrypted_mapping=b"private-mapping",
        original_object_key=f"offices/{office_id}/documents/{document_id}/original",
        created_at=datetime(2026, 10, 4, tzinfo=timezone.utc),
    )


def test_document_access_service_scopes_history_and_presigned_results_to_the_server_office(monkeypatch):
    first_context = _context("00000000-0000-0000-0000-000000000002")
    second_context = _context("00000000-0000-0000-0000-000000000004")
    first_document = _document(
        "00000000-0000-0000-0000-000000000003", str(first_context.office_id)
    )
    second_document = _document(
        "00000000-0000-0000-0000-000000000005", str(second_context.office_id)
    )
    documents = [first_document, second_document]
    fake_s3 = FakeS3Client()

    monkeypatch.setattr(
        document_service.document_repository,
        "list_documents_for_access_context",
        lambda _session, context: [document for document in documents if document.office_id == context.office_id],
    )
    monkeypatch.setattr(
        document_service.document_repository,
        "get_document_for_access_context",
        lambda _session, context, document_id: next(
            (
                document
                for document in documents
                if document.id == document_id and document.office_id == context.office_id
            ),
            None,
        ),
    )
    service = DocumentAccessService(
        session_factory=FakeSession,
        storage=DocumentStorage(_settings(), client=fake_s3),
    )

    history = service.list_documents(first_context)
    denied_url = service.create_anonymized_download_url(second_context, first_document.id)
    own_url = service.create_anonymized_download_url(first_context, first_document.id)

    assert [item.document_id for item in history] == [first_document.id]
    assert history[0].original_filename == "umowa-klienta.pdf"
    assert history[0].status == "ready"
    assert not hasattr(history[0], "original_object_key")
    assert denied_url is None
    assert own_url == "https://storage.example.test/temporary-result"
    assert fake_s3.presign_calls == [
        (
            "get_object",
            {
                "Params": {
                    "Bucket": "test-documents",
                    "Key": f"offices/{first_context.office_id}/documents/{first_document.id}/anonymized",
                },
                "ExpiresIn": 300,
            },
        )
    ]


def test_document_access_service_does_not_presign_non_ready_documents(monkeypatch):
    context = _context("00000000-0000-0000-0000-000000000002")
    document = _document(
        "00000000-0000-0000-0000-000000000003", str(context.office_id), status="processing"
    )
    fake_s3 = FakeS3Client()
    monkeypatch.setattr(
        document_service.document_repository,
        "get_document_for_access_context",
        lambda *_args: document,
    )
    service = DocumentAccessService(
        session_factory=FakeSession,
        storage=DocumentStorage(_settings(), client=fake_s3),
    )

    assert service.create_anonymized_download_url(context, document.id) is None
    assert fake_s3.presign_calls == []


def test_document_access_service_does_not_presign_when_scoped_repository_finds_no_document(monkeypatch):
    context = _context("00000000-0000-0000-0000-000000000002")
    document_id = UUID("00000000-0000-0000-0000-000000000003")
    fake_s3 = FakeS3Client()
    monkeypatch.setattr(
        document_service.document_repository,
        "get_document_for_access_context",
        lambda *_args: None,
    )
    service = DocumentAccessService(
        session_factory=FakeSession,
        storage=DocumentStorage(_settings(), client=fake_s3),
    )

    assert service.create_anonymized_download_url(context, document_id) is None
    assert fake_s3.presign_calls == []


def test_response_deanonymization_replaces_only_known_markers_for_the_selected_document(monkeypatch):
    context = _context("00000000-0000-0000-0000-000000000002")
    document = _document(
        "00000000-0000-0000-0000-000000000003", str(context.office_id)
    )
    cipher = DocumentMappingCipher.from_settings(_settings())
    document.encrypted_mapping = cipher.encrypt(
        json.dumps({"[KLIENT_1]": "Jan Kowalski"}, sort_keys=True).encode("utf-8")
    )
    monkeypatch.setattr(
        document_service.document_repository,
        "get_document_for_access_context",
        lambda _session, requested_context, document_id: (
            document if requested_context == context and document_id == document.id else None
        ),
    )
    service = ResponseDeanonymizationService(session_factory=FakeSession, mapping_cipher=cipher)

    result = service.deanonymize_response(
        context,
        document.id,
        "Odpowiedź dla [KLIENT_1] oraz [NIEZNANY_1].",
    )

    assert result == "Odpowiedź dla Jan Kowalski oraz [NIEZNANY_1]."


def test_response_deanonymization_rejects_a_mapping_with_non_marker_keys(monkeypatch):
    context = _context("00000000-0000-0000-0000-000000000002")
    document = _document(
        "00000000-0000-0000-0000-000000000003", str(context.office_id)
    )
    cipher = DocumentMappingCipher.from_settings(_settings())
    document.encrypted_mapping = cipher.encrypt(
        json.dumps({"not-a-marker": "Jan Kowalski"}, sort_keys=True).encode("utf-8")
    )
    monkeypatch.setattr(
        document_service.document_repository,
        "get_document_for_access_context",
        lambda _session, _requested_context, _document_id: document,
    )
    service = ResponseDeanonymizationService(session_factory=FakeSession, mapping_cipher=cipher)

    assert service.deanonymize_response(context, document.id, "not-a-marker") is None


def test_response_deanonymization_returns_none_for_all_unavailable_mapping_states(monkeypatch):
    context = _context("00000000-0000-0000-0000-000000000002")
    other_context = _context("00000000-0000-0000-0000-000000000004")
    document = _document(
        "00000000-0000-0000-0000-000000000003", str(context.office_id)
    )
    cipher = DocumentMappingCipher.from_settings(_settings())
    valid_mapping = cipher.encrypt(json.dumps({"[KLIENT_1]": "Jan Kowalski"}).encode("utf-8"))
    monkeypatch.setattr(
        document_service.document_repository,
        "get_document_for_access_context",
        lambda _session, requested_context, document_id: (
            document if requested_context == context and document_id == document.id else None
        ),
    )
    service = ResponseDeanonymizationService(session_factory=FakeSession, mapping_cipher=cipher)

    document.status = "processing"
    document.encrypted_mapping = valid_mapping
    assert service.deanonymize_response(context, document.id, "[KLIENT_1]") is None

    document.status = "ready"
    for encrypted_mapping in (
        None,
        b"not-a-fernet-token",
        cipher.encrypt(b"\xff"),
        cipher.encrypt(b"[]"),
    ):
        document.encrypted_mapping = encrypted_mapping
        assert service.deanonymize_response(context, document.id, "[KLIENT_1]") is None

    document.encrypted_mapping = valid_mapping
    assert service.deanonymize_response(other_context, document.id, "[KLIENT_1]") is None
