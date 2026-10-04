"""Synchronous office-scoped document processing orchestration."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import json
from typing import Callable
from uuid import UUID, uuid4

from sqlalchemy.orm import Session

from backend.app import document_repository
from backend.app.auth import AccessContext
from backend.app.config import Settings
from backend.app.database import get_session_factory
from backend.app.document_formats import DocumentProcessingError, anonymize_docx, anonymize_pdf
from backend.app.storage import DocumentMappingCipher, DocumentStorage


@dataclass(frozen=True)
class DocumentProcessingResult:
    """Safe metadata returned after a document has been anonymized and persisted."""

    document_id: UUID
    original_filename: str
    document_format: str
    size_bytes: int
    status: str


class DocumentProcessingService:
    """Store original and result under a trusted office, encrypting mappings before persistence."""

    def __init__(
        self,
        *,
        session_factory: Callable[[], Session],
        storage: DocumentStorage,
        mapping_cipher: DocumentMappingCipher,
    ):
        self._session_factory = session_factory
        self._storage = storage
        self._mapping_cipher = mapping_cipher

    @classmethod
    def from_settings(cls, settings: Settings) -> "DocumentProcessingService":
        return cls(
            session_factory=get_session_factory(),
            storage=DocumentStorage(settings),
            mapping_cipher=DocumentMappingCipher.from_settings(settings),
        )

    def process_upload(
        self,
        access_context: AccessContext,
        *,
        content: bytes,
        original_filename: str,
        document_format: str,
        content_type: str,
    ) -> DocumentProcessingResult:
        """Persist a single validated upload and make its result ready synchronously."""
        document_id = uuid4()
        original_key = self._storage.build_object_key(access_context, document_id, "original")
        anonymized_key = self._storage.build_object_key(access_context, document_id, "anonymized")
        session = self._session_factory()
        document = None
        try:
            with session.begin():
                document = document_repository.create_processing_document(
                    session,
                    access_context,
                    document_id=document_id,
                    original_filename=original_filename,
                    document_format=document_format,
                    size_bytes=len(content),
                    original_object_key=original_key,
                )
            self._storage.put_object(original_key, content, content_type)
            transformed_content, mapping = self._anonymize(document_format, content)
            self._storage.put_object(anonymized_key, transformed_content, content_type)
            encrypted_mapping = self._mapping_cipher.encrypt(
                json.dumps(mapping, sort_keys=True, separators=(",", ":")).encode("utf-8")
            )
            with session.begin():
                ready_document = document_repository.mark_document_ready(
                    session,
                    access_context,
                    document_id,
                    anonymized_object_key=anonymized_key,
                    encrypted_mapping=encrypted_mapping,
                )
                if ready_document is None:
                    raise RuntimeError("Document ownership was unavailable during processing")
            return DocumentProcessingResult(
                document_id=document_id,
                original_filename=original_filename,
                document_format=document_format,
                size_bytes=len(content),
                status="ready",
            )
        except DocumentProcessingError:
            self._mark_failed(session, access_context, document_id, document)
            raise
        except Exception as error:
            self._mark_failed(session, access_context, document_id, document)
            raise DocumentProcessingError("The document could not be processed.") from error
        finally:
            session.close()

    @staticmethod
    def _anonymize(document_format: str, content: bytes) -> tuple[bytes, dict[str, str]]:
        if document_format == "pdf":
            return anonymize_pdf(content)
        if document_format == "docx":
            return anonymize_docx(content)
        raise DocumentProcessingError("The document format is not supported.")

    @staticmethod
    def _mark_failed(session: Session, access_context: AccessContext, document_id: UUID, document: object | None) -> None:
        if document is None:
            return
        try:
            with session.begin():
                document_repository.mark_document_failed(session, access_context, document_id)
        except Exception:
            # The original exception remains the only client-visible result.
            return


@dataclass(frozen=True)
class DocumentHistoryEntry:
    """The intentionally small document history contract safe for an office user."""

    document_id: UUID
    original_filename: str | None
    document_format: str
    size_bytes: int
    status: str
    created_at: datetime


class DocumentAccessService:
    """Read office-scoped document history and mint result URLs after ownership checks."""

    def __init__(self, *, session_factory: Callable[[], Session], storage: DocumentStorage):
        self._session_factory = session_factory
        self._storage = storage

    @classmethod
    def from_settings(cls, settings: Settings) -> "DocumentAccessService":
        return cls(session_factory=get_session_factory(), storage=DocumentStorage(settings))

    def list_documents(self, access_context: AccessContext) -> tuple[DocumentHistoryEntry, ...]:
        session = self._session_factory()
        try:
            with session.begin():
                return tuple(
                    DocumentHistoryEntry(
                        document_id=document.id,
                        original_filename=document.original_filename,
                        document_format=document.document_format,
                        size_bytes=document.size_bytes,
                        status=document.status,
                        created_at=document.created_at,
                    )
                    for document in document_repository.list_documents_for_access_context(session, access_context)
                )
        finally:
            session.close()

    def create_anonymized_download_url(self, access_context: AccessContext, document_id: UUID) -> str | None:
        """Presign only a ready result whose stored key matches its server-derived ownership."""
        session = self._session_factory()
        try:
            with session.begin():
                document = document_repository.get_document_for_access_context(
                    session, access_context, document_id
                )
                if (
                    document is None
                    or document.status != "ready"
                    or document.anonymized_object_key is None
                ):
                    return None
                result_key = self._storage.build_object_key(access_context, document.id, "anonymized")
                if document.anonymized_object_key != result_key.value:
                    return None
                return self._storage.create_result_download_url(result_key)
        finally:
            session.close()
