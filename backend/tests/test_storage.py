from uuid import UUID

from backend.app.auth import AccessContext
from backend.app.config import Settings
from backend.app.storage import DocumentMappingCipher, DocumentStorage, StorageObjectKey


class FakeS3Client:
    def __init__(self):
        self.put_calls = []
        self.objects = {}
        self.presign_calls = []

    def put_object(self, **kwargs):
        self.put_calls.append(kwargs)
        self.objects[kwargs["Key"]] = kwargs["Body"]

    def get_object(self, **kwargs):
        return {"Body": FakeBody(self.objects[kwargs["Key"]])}

    def generate_presigned_url(self, operation, **kwargs):
        self.presign_calls.append((operation, kwargs))
        return "https://storage.example.test/temporary-result"


class FakeBody:
    def __init__(self, content: bytes):
        self._content = content

    def read(self) -> bytes:
        return self._content


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


def test_storage_uses_server_derived_office_id_with_a_fake_client_only():
    client = FakeS3Client()
    storage = DocumentStorage(_settings(), client=client)
    document_id = UUID("00000000-0000-0000-0000-000000000003")
    object_key = storage.build_object_key(_context(), document_id, "original")

    storage.put_object(object_key, b"synthetic document", "application/pdf")

    assert object_key.value == (
        "offices/00000000-0000-0000-0000-000000000002/"
        "documents/00000000-0000-0000-0000-000000000003/original"
    )
    assert client.put_calls == [
        {
            "Bucket": "test-documents",
            "Key": object_key.value,
            "Body": b"synthetic document",
            "ContentType": "application/pdf",
        }
    ]
    assert storage.get_object(object_key) == b"synthetic document"
    result_key = storage.build_object_key(_context(), document_id, "anonymized")
    assert storage.create_result_download_url(result_key) == "https://storage.example.test/temporary-result"


def test_storage_rejects_a_client_string_instead_of_a_server_created_key():
    storage = DocumentStorage(_settings(), client=FakeS3Client())

    try:
        storage.put_object("attacker-selected-key", b"data", "application/pdf")  # type: ignore[arg-type]
    except TypeError as error:
        assert "server-created StorageObjectKey" in str(error)
    else:
        raise AssertionError("storage accepted a client-controlled object key")


def test_mapping_cipher_encrypts_before_persistence():
    cipher = DocumentMappingCipher.from_settings(_settings())

    encrypted = cipher.encrypt(b'{"PESEL_1":"synthetic"}')

    assert encrypted != b'{"PESEL_1":"synthetic"}'
    assert cipher.decrypt(encrypted) == b'{"PESEL_1":"synthetic"}'
