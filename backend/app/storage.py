"""Server-only S3 storage and document-mapping encryption boundary."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal
from uuid import UUID

from cryptography.fernet import Fernet

from backend.app.auth import AccessContext
from backend.app.config import Settings


DocumentObjectKind = Literal["original", "anonymized"]


@dataclass(frozen=True)
class StorageObjectKey:
    """An internal key created from trusted server-side document ownership."""

    value: str


class DocumentMappingCipher:
    """Encrypt marker mappings before they are persisted to PostgreSQL."""

    def __init__(self, encryption_key: str):
        self._fernet = Fernet(encryption_key.encode("utf-8"))

    @classmethod
    def from_settings(cls, settings: Settings) -> "DocumentMappingCipher":
        settings.require_document_storage_configuration()
        assert settings.document_mapping_encryption_key is not None
        return cls(settings.document_mapping_encryption_key.get_secret_value())

    def encrypt(self, mapping: bytes) -> bytes:
        return self._fernet.encrypt(mapping)

    def decrypt(self, encrypted_mapping: bytes) -> bytes:
        return self._fernet.decrypt(encrypted_mapping)


class DocumentStorage:
    """Keep boto3 and S3 object-key construction outside API route modules."""

    def __init__(self, settings: Settings, client: Any | None = None):
        settings.require_document_storage_configuration()
        assert settings.s3_bucket is not None
        assert settings.s3_region is not None
        assert settings.aws_access_key_id is not None
        assert settings.aws_secret_access_key is not None
        self._bucket = settings.s3_bucket
        self._client = client or self._create_client(settings)

    @staticmethod
    def _create_client(settings: Settings) -> Any:
        """Create the SDK client lazily so imports and fake-client tests stay offline."""
        import boto3

        assert settings.s3_region is not None
        assert settings.aws_access_key_id is not None
        assert settings.aws_secret_access_key is not None
        return boto3.client(
            "s3",
            region_name=settings.s3_region,
            aws_access_key_id=settings.aws_access_key_id.get_secret_value(),
            aws_secret_access_key=settings.aws_secret_access_key.get_secret_value(),
        )

    @staticmethod
    def build_object_key(
        access_context: AccessContext,
        document_id: UUID,
        object_kind: DocumentObjectKind,
    ) -> StorageObjectKey:
        """Derive an S3 key only from the server-derived office context and document ID."""
        return StorageObjectKey(
            value=(
                f"offices/{access_context.office_id}/documents/{document_id}/{object_kind}"
            )
        )

    def put_object(self, object_key: StorageObjectKey, content: bytes, content_type: str) -> None:
        self._client.put_object(
            Bucket=self._bucket,
            Key=self._require_server_key(object_key),
            Body=content,
            ContentType=content_type,
        )

    def get_object(self, object_key: StorageObjectKey) -> bytes:
        response = self._client.get_object(Bucket=self._bucket, Key=self._require_server_key(object_key))
        return response["Body"].read()

    def create_result_download_url(
        self,
        object_key: StorageObjectKey,
        expires_in_seconds: int = 300,
    ) -> str:
        key = self._require_server_key(object_key)
        if not key.endswith("/anonymized"):
            raise ValueError("Only anonymized document results may receive download links")
        return self._client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self._bucket, "Key": key},
            ExpiresIn=expires_in_seconds,
        )

    @staticmethod
    def _require_server_key(object_key: StorageObjectKey) -> str:
        if not isinstance(object_key, StorageObjectKey):
            raise TypeError("Document storage requires a server-created StorageObjectKey")
        return object_key.value
