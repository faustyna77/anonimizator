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
    ResponseDeanonymizationService,
)
from backend.app.document_upload import UploadValidationError, parse_uploaded_document
from backend.app.office_rule_service import (
    OfficeRule,
    OfficeRulePayloadError,
    OfficeRuleProcessor,
    OfficeRuleService,
    parse_office_rule_payload,
)

_MAX_DEANONYMIZATION_RESPONSE_LENGTH = 50_000


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


class ResponseDeanonymizationProcessor(Protocol):
    def deanonymize_response(
        self,
        access_context: AccessContext,
        document_id: UUID,
        response_text: str,
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


class DeanonymizedResponse(BaseModel):
    response_text: str


class OfficeRuleResponse(BaseModel):
    rule_id: str
    kind: str
    pattern: str
    marker_label: str
    enabled: bool


def _office_rule_response(rule: OfficeRule) -> OfficeRuleResponse:
    return OfficeRuleResponse(
        rule_id=str(rule.rule_id),
        kind=rule.kind,
        pattern=rule.pattern,
        marker_label=rule.marker_label,
        enabled=rule.enabled,
    )


def create_app(
    settings: Optional[Settings] = None,
    document_service: Optional[DocumentProcessor] = None,
    document_access_service: Optional[DocumentAccessProcessor] = None,
    office_rule_service: Optional[OfficeRuleProcessor] = None,
    deanonymization_service: Optional[ResponseDeanonymizationProcessor] = None,
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
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.get("/office-rules", response_model=list[OfficeRuleResponse])
    def list_office_rules(
        access_context: AccessContext = Depends(get_current_access_context),
    ) -> list[OfficeRuleResponse]:
        processor = office_rule_service or OfficeRuleService.from_settings(resolved_settings)
        return [_office_rule_response(rule) for rule in processor.list_rules(access_context)]

    @app.post("/office-rules", response_model=OfficeRuleResponse, status_code=status.HTTP_201_CREATED)
    async def create_office_rule(
        request: Request,
        access_context: AccessContext = Depends(get_current_access_context),
    ) -> OfficeRuleResponse:
        try:
            rule = parse_office_rule_payload(await request.json())
        except (OfficeRulePayloadError, ValueError):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="The rule payload is invalid.")
        processor = office_rule_service or OfficeRuleService.from_settings(resolved_settings)
        return _office_rule_response(processor.create_rule(access_context, rule))

    @app.patch("/office-rules/{rule_id}", response_model=OfficeRuleResponse)
    async def update_office_rule(
        rule_id: UUID,
        request: Request,
        access_context: AccessContext = Depends(get_current_access_context),
    ) -> OfficeRuleResponse:
        try:
            rule = parse_office_rule_payload(await request.json())
        except (OfficeRulePayloadError, ValueError):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="The rule payload is invalid.")
        processor = office_rule_service or OfficeRuleService.from_settings(resolved_settings)
        updated = processor.update_rule(access_context, rule_id, rule)
        if updated is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Office rule was not found.")
        return _office_rule_response(updated)

    @app.delete("/office-rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_office_rule(
        rule_id: UUID,
        access_context: AccessContext = Depends(get_current_access_context),
    ) -> None:
        processor = office_rule_service or OfficeRuleService.from_settings(resolved_settings)
        if not processor.delete_rule(access_context, rule_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Office rule was not found.")

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

    @app.post("/documents/{document_id}/deanonymize-response", response_model=DeanonymizedResponse)
    async def deanonymize_response(
        document_id: UUID,
        request: Request,
        access_context: AccessContext = Depends(get_current_access_context),
    ) -> DeanonymizedResponse:
        try:
            payload = await request.json()
            response_text = payload["response_text"]
        except (KeyError, TypeError, ValueError):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="The response text is invalid.",
            )
        if (
            not isinstance(payload, dict)
            or set(payload) != {"response_text"}
            or not isinstance(response_text, str)
            or len(response_text) > _MAX_DEANONYMIZATION_RESPONSE_LENGTH
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="The response text is invalid.",
            )
        processor = deanonymization_service or ResponseDeanonymizationService.from_settings(resolved_settings)
        restored_response = processor.deanonymize_response(access_context, document_id, response_text)
        if restored_response is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="An anonymized result is unavailable.")
        return DeanonymizedResponse(response_text=restored_response)

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
