"""Strict multipart upload parsing and validation for one protected document."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from starlette.datastructures import FormData, UploadFile


MAX_UPLOAD_BYTES = 10 * 1024 * 1024
_ALLOWED_CONTENT_TYPES = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


class UploadValidationError(ValueError):
    """A stable, source-content-free message appropriate for a 422 response."""


@dataclass(frozen=True)
class UploadedDocument:
    content: bytes
    document_format: str
    content_type: str


async def parse_uploaded_document(form: FormData) -> UploadedDocument:
    """Accept exactly one correctly typed multipart file and no client office selector."""
    if "office_id" in form:
        raise UploadValidationError("office_id is not accepted.")
    files = [
        (name, value)
        for name, value in form.multi_items()
        if isinstance(value, UploadFile)
    ]
    if not files:
        raise UploadValidationError("A single file is required.")
    if len(files) != 1:
        raise UploadValidationError("Exactly one file is accepted.")

    field_name, uploaded_file = files[0]
    if field_name != "file":
        raise UploadValidationError("A single file is required.")
    filename = uploaded_file.filename or ""
    file_content_type = uploaded_file.content_type or ""
    document_format = Path(filename).suffix.lower().lstrip(".")
    if document_format not in _ALLOWED_CONTENT_TYPES:
        raise UploadValidationError("Only PDF and DOCX files are accepted.")
    if file_content_type.lower() != _ALLOWED_CONTENT_TYPES[document_format]:
        raise UploadValidationError("The file MIME type is not allowed.")
    content = await uploaded_file.read()
    if not content:
        raise UploadValidationError("The file must not be empty.")
    if len(content) > MAX_UPLOAD_BYTES:
        raise UploadValidationError("The file exceeds the 10 MB limit.")
    return UploadedDocument(content=content, document_format=document_format, content_type=file_content_type)
