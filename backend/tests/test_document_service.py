from io import BytesIO
import json
from types import SimpleNamespace
from uuid import UUID

from docx import Document

from backend.app import document_service
from backend.app.auth import AccessContext
from backend.app.config import Settings
from backend.app.document_service import DocumentProcessingError, DocumentProcessingService
from backend.app.storage import DocumentMappingCipher, DocumentStorage


class FakeS3Client:
    def __init__(self):
        self.objects = {}

    def put_object(self, **kwargs):
        self.objects[kwargs["Key"]] = kwargs["Body"]


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


def _context() -> AccessContext:
    return AccessContext(
        user_id="controlled-user",
        profile_id=UUID("00000000-0000-0000-0000-000000000001"),
        office_id=UUID("00000000-0000-0000-0000-000000000002"),
    )


def _docx_bytes(text: str) -> bytes:
    document = Document()
    document.add_paragraph(text)
    output = BytesIO()
    document.save(output)
    return output.getvalue()


def test_service_persists_synthetic_original_result_and_encrypted_mapping_with_fake_s3(monkeypatch):
    fake_s3 = FakeS3Client()
    settings = _settings()
    created = []

    def create_processing(session, context, **kwargs):
        document = SimpleNamespace(id=kwargs["document_id"], status="processing", **kwargs)
        created.append(document)
        return document

    def mark_ready(session, context, document_id, **kwargs):
        document = created[0]
        document.status = "ready"
        document.anonymized_object_key = kwargs["anonymized_object_key"].value
        document.encrypted_mapping = kwargs["encrypted_mapping"]
        return document

    monkeypatch.setattr(document_service.document_repository, "create_processing_document", create_processing)
    monkeypatch.setattr(document_service.document_repository, "mark_document_ready", mark_ready)
    service = DocumentProcessingService(
        session_factory=FakeSession,
        storage=DocumentStorage(settings, client=fake_s3),
        mapping_cipher=DocumentMappingCipher.from_settings(settings),
    )

    result = service.process_upload(
        _context(),
        content=_docx_bytes("Synthetic identifier 44051401458."),
        original_filename="synthetic.docx",
        document_format="docx",
        content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )

    assert result.document_format == "docx"
    assert result.original_filename == "synthetic.docx"
    assert result.status == "ready"
    assert created[0].status == "ready"
    assert len(fake_s3.objects) == 2
    assert f"offices/{_context().office_id}/documents/{result.document_id}/original" in fake_s3.objects
    result_key = f"offices/{_context().office_id}/documents/{result.document_id}/anonymized"
    assert result_key in fake_s3.objects
    decrypted = DocumentMappingCipher.from_settings(settings).decrypt(created[0].encrypted_mapping)
    assert json.loads(decrypted) == {"[PESEL_1]": "44051401458"}
    assert b"44051401458" not in fake_s3.objects[result_key]


def test_service_marks_document_failed_after_a_controlled_format_error(monkeypatch):
    fake_s3 = FakeS3Client()
    settings = _settings()
    created = []

    def create_processing(session, context, **kwargs):
        document = SimpleNamespace(id=kwargs["document_id"], status="processing", **kwargs)
        created.append(document)
        return document

    def mark_failed(session, context, document_id):
        created[0].status = "failed"
        return created[0]

    monkeypatch.setattr(document_service.document_repository, "create_processing_document", create_processing)
    monkeypatch.setattr(document_service.document_repository, "mark_document_failed", mark_failed)
    service = DocumentProcessingService(
        session_factory=FakeSession,
        storage=DocumentStorage(settings, client=fake_s3),
        mapping_cipher=DocumentMappingCipher.from_settings(settings),
    )

    try:
        service.process_upload(
            _context(),
            content=b"not-a-pdf",
            original_filename="synthetic.pdf",
            document_format="pdf",
            content_type="application/pdf",
        )
    except DocumentProcessingError as error:
        assert str(error) == "The PDF file could not be processed."
    else:
        raise AssertionError("invalid document unexpectedly processed")

    assert created[0].status == "failed"
    assert len(fake_s3.objects) == 1
