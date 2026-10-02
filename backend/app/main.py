from typing import Optional

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.auth import AccessContext, get_current_access_context
from backend.app.config import Settings, get_settings


def create_app(settings: Optional[Settings] = None) -> FastAPI:
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

    @app.post("/anonymize")
    async def anonymize(_: AccessContext = Depends(get_current_access_context)):
        # Stub — core logic in src/anonymizer_prawniczy/ (scaffold per AGENTS.md)
        return {"status": "anonymized", "backend": "anonimizator"}

    return app


app = create_app()
