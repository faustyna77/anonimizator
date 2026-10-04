from datetime import datetime
from typing import Optional, Protocol
from uuid import UUID

from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from pydantic import BaseModel

from backend.app.auth import AccessContext, get_current_access_context
from backend.app.config import Settings, get_settings
from backend.app.document_service import (
    DocumentAccessService,
    DocumentHistoryEntry,
    DocumentProcessingError,
    DocumentProcessingResult,
    DocumentProcessingService,
)
from backend.app.document_upload import UploadValidationError, parse_uploaded_document


class DocumentProcessor(Protocol):
    def process_upload(
        self,
        access_context: AccessContext,
        *,
        content: bytes,
        original_filename: str,
        document_format: str,
        content_type: str,
    ) -> DocumentProcessingResult: ...


class DocumentAccessProcessor(Protocol):
    def list_documents(self, access_context: AccessContext) -> tuple[DocumentHistoryEntry, ...]: ...

    def create_anonymized_download_url(
        self, access_context: AccessContext, document_id: UUID
    ) -> str | None: ...


class AnonymizedDocumentResponse(BaseModel):
    document_id: str
    original_filename: str
    document_format: str
    size_bytes: int
    status: str


class DocumentHistoryResponse(BaseModel):
    document_id: str
    original_filename: str | None
    document_format: str
    size_bytes: int
    status: str
    created_at: datetime


class AnonymizedDownloadResponse(BaseModel):
    download_url: str


def create_app(
    settings: Optional[Settings] = None,
    document_service: Optional[DocumentProcessor] = None,
    document_access_service: Optional[DocumentAccessProcessor] = None,
) -> FastAPI:
    """Build the API with public health checks and protected product routes."""
    resolved_settings = settings if settings is not None else get_settings()
    docs_enabled = resolved_settings.exposes_api_documentation
    app = FastAPI(
        docs_url="/docs" if docs_enabled else None,
        redoc_url="/redoc" if docs_enabled else None,
        openapi_url="/openapi.json" if docs_enabled else None,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=resolved_settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.post("/anonymize", response_model=AnonymizedDocumentResponse)
    async def anonymize(
        request: Request,
        file: UploadFile | None = File(default=None),
        access_context: AccessContext = Depends(get_current_access_context),
    ) -> AnonymizedDocumentResponse:
        try:
            uploaded_document = await parse_uploaded_document(await request.form())
        except UploadValidationError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error

        processor = document_service or DocumentProcessingService.from_settings(resolved_settings)
        try:
            result = processor.process_upload(
                access_context,
                content=uploaded_document.content,
                original_filename=uploaded_document.original_filename,
                document_format=uploaded_document.document_format,
                content_type=uploaded_document.content_type,
            )
        except DocumentProcessingError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        except Exception as error:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="The document could not be processed.",
            ) from error
        return AnonymizedDocumentResponse(
            document_id=str(result.document_id),
            original_filename=result.original_filename,
            document_format=result.document_format,
            size_bytes=result.size_bytes,
            status=result.status,
        )

    @app.get("/documents", response_model=list[DocumentHistoryResponse])
    def list_documents(
        access_context: AccessContext = Depends(get_current_access_context),
    ) -> list[DocumentHistoryResponse]:
        processor = document_access_service or DocumentAccessService.from_settings(resolved_settings)
        return [
            DocumentHistoryResponse(
                document_id=str(document.document_id),
                original_filename=document.original_filename,
                document_format=document.document_format,
                size_bytes=document.size_bytes,
                status=document.status,
                created_at=document.created_at,
            )
            for document in processor.list_documents(access_context)
        ]

    @app.get(
        "/documents/{document_id}/anonymized-download",
        response_model=AnonymizedDownloadResponse,
    )
    def anonymized_download(
        document_id: UUID,
        access_context: AccessContext = Depends(get_current_access_context),
    ) -> AnonymizedDownloadResponse:
        processor = document_access_service or DocumentAccessService.from_settings(resolved_settings)
        download_url = processor.create_anonymized_download_url(access_context, document_id)
        if download_url is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="An anonymized result is unavailable.")
        return AnonymizedDownloadResponse(download_url=download_url)

    def custom_openapi():
        if app.openapi_schema:
            return app.openapi_schema
        schema = get_openapi(title=app.title, version=app.version, routes=app.routes)
        schema["paths"]["/anonymize"]["post"]["requestBody"] = {
            "required": True,
            "content": {
                "multipart/form-data": {
                    "schema": {
                        "type": "object",
                        "properties": {"file": {"type": "string", "format": "binary"}},
                        "required": ["file"],
                    }
                }
            },
        }
        app.openapi_schema = schema
        return app.openapi_schema

    app.openapi = custom_openapi
    return app


app = create_app()
