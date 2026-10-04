"""Office-scoped persistence operations for S3-backed documents."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.auth import AccessContext
from backend.app.models import Document
from backend.app.storage import StorageObjectKey


def create_processing_document(
    session: Session,
    access_context: AccessContext,
    *,
    document_format: str,
    size_bytes: int,
    original_object_key: StorageObjectKey,
    document_id: UUID | None = None,
) -> Document:
    """Create metadata using only the trusted office and profile from access context."""
    document = Document(
        **({"id": document_id} if document_id is not None else {}),
        office_id=access_context.office_id,
        uploaded_by_profile_id=access_context.profile_id,
        document_format=document_format,
        size_bytes=size_bytes,
        status="processing",
        original_object_key=original_object_key.value,
    )
    session.add(document)
    session.flush()
    return document


def get_document_for_access_context(
    session: Session,
    access_context: AccessContext,
    document_id: UUID,
) -> Document | None:
    """Return a document only when it belongs to the trusted office context."""
    return session.scalar(
        select(Document).where(
            Document.id == document_id,
            Document.office_id == access_context.office_id,
        )
    )


def mark_document_ready(
    session: Session,
    access_context: AccessContext,
    document_id: UUID,
    *,
    anonymized_object_key: StorageObjectKey,
    encrypted_mapping: bytes,
) -> Document | None:
    """Persist the result and encrypted mapping only inside the trusted office scope."""
    document = get_document_for_access_context(session, access_context, document_id)
    if document is None:
        return None
    document.anonymized_object_key = anonymized_object_key.value
    document.encrypted_mapping = encrypted_mapping
    document.status = "ready"
    session.flush()
    return document


def mark_document_failed(
    session: Session,
    access_context: AccessContext,
    document_id: UUID,
) -> Document | None:
    """Record a processing failure without accepting an office identifier from a caller."""
    document = get_document_for_access_context(session, access_context, document_id)
    if document is None:
        return None
    document.status = "failed"
    session.flush()
    return document
