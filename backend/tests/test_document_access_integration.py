import json
from uuid import uuid4

import pytest

from backend.app.auth import AccessContext
from backend.app.config import Settings
from backend.app.document_repository import (
    create_processing_document,
    get_document_for_access_context,
    mark_document_ready,
)
from backend.app.document_service import DocumentAccessService, ResponseDeanonymizationService
from backend.app.models import Office, Profile
from backend.app.storage import DocumentMappingCipher, DocumentStorage, StorageObjectKey


class FakeS3Client:
    def __init__(self):
        self.presign_calls = []

    def generate_presigned_url(self, operation, **kwargs):
        self.presign_calls.append((operation, kwargs))
        return "https://storage.example.test/temporary-result"


def _settings() -> Settings:
    return Settings(
        _env_file=None,
        s3_bucket="test-documents",
        s3_region="eu-central-1",
        aws_access_key_id="test-access-key",
        aws_secret_access_key="test-secret-key",
        document_mapping_encryption_key="MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
    )


@pytest.mark.postgresql
def test_real_document_services_deny_foreign_access_to_download_and_mapping(migrated_session_factory):
    settings = _settings()
    cipher = DocumentMappingCipher.from_settings(settings)
    fake_s3 = FakeS3Client()
    encrypted_mapping = cipher.encrypt(
        json.dumps({"[KLIENT_1]": "Jan Kowalski"}, sort_keys=True).encode("utf-8")
    )

    with migrated_session_factory.begin() as session:
        first_office = Office(name="First office")
        second_office = Office(name="Second office")
        first_profile = Profile(user_id="first-user", office=first_office)
        second_profile = Profile(user_id="second-user", office=second_office)
        session.add_all([first_profile, second_profile])
        session.flush()
        first_context = AccessContext(
            user_id="first-user",
            profile_id=first_profile.id,
            office_id=first_office.id,
        )
        second_context = AccessContext(
            user_id="second-user",
            profile_id=second_profile.id,
            office_id=second_office.id,
        )
        document_id = uuid4()
        document = create_processing_document(
            session,
            first_context,
            document_id=document_id,
            original_filename="first-office.pdf",
            document_format="pdf",
            size_bytes=42,
            original_object_key=StorageObjectKey(
                f"offices/{first_office.id}/documents/{document_id}/original"
            ),
        )
        result_key = StorageObjectKey(
            f"offices/{first_office.id}/documents/{document_id}/anonymized"
        )
        assert (
            mark_document_ready(
                session,
                first_context,
                document.id,
                anonymized_object_key=result_key,
                encrypted_mapping=encrypted_mapping,
            )
            is not None
        )

    storage = DocumentStorage(settings, client=fake_s3)
    access_service = DocumentAccessService(session_factory=migrated_session_factory, storage=storage)
    deanonymization_service = ResponseDeanonymizationService(
        session_factory=migrated_session_factory,
        mapping_cipher=cipher,
    )

    assert access_service.list_documents(second_context) == ()
    assert access_service.create_anonymized_download_url(second_context, document_id) is None
    assert deanonymization_service.deanonymize_response(
        second_context,
        document_id,
        "Odpowiedź dla [KLIENT_1].",
    ) is None
    assert fake_s3.presign_calls == []

    owner_history = access_service.list_documents(first_context)
    owner_url = access_service.create_anonymized_download_url(first_context, document_id)
    owner_response = deanonymization_service.deanonymize_response(
        first_context,
        document_id,
        "Odpowiedź dla [KLIENT_1].",
    )

    assert [entry.document_id for entry in owner_history] == [document_id]
    assert owner_url == "https://storage.example.test/temporary-result"
    assert owner_response == "Odpowiedź dla Jan Kowalski."
    assert fake_s3.presign_calls == [
        (
            "get_object",
            {
                "Params": {"Bucket": "test-documents", "Key": result_key.value},
                "ExpiresIn": 300,
            },
        )
    ]

    with migrated_session_factory() as session:
        persisted_document = get_document_for_access_context(session, first_context, document_id)

    assert persisted_document is not None
    assert persisted_document.status == "ready"
    assert persisted_document.encrypted_mapping == encrypted_mapping
