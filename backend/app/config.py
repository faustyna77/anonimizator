"""Application configuration with explicit public and server-only boundaries."""

from __future__ import annotations

from functools import lru_cache
from typing import Dict, Optional

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Read configuration from the environment without serializing secrets."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_environment: str = "development"
    panel_allowed_origins: str = "http://localhost:5173"
    database_url: Optional[SecretStr] = None
    supabase_url: Optional[str] = None
    supabase_anon_key: Optional[str] = None
    supabase_service_role_key: Optional[SecretStr] = None
    s3_bucket: Optional[str] = None
    s3_region: Optional[str] = None
    aws_access_key_id: Optional[SecretStr] = None
    aws_secret_access_key: Optional[SecretStr] = None
    document_mapping_encryption_key: Optional[SecretStr] = None

    @property
    def public_auth_configuration(self) -> Dict[str, Optional[str]]:
        """Return only values safe to provide to a browser build."""
        return {
            "url": self.supabase_url,
            "anon_key": self.supabase_anon_key,
        }

    @property
    def allowed_origins(self) -> list[str]:
        """Return the configured panel origins as a normalized, non-empty list."""
        origins = [origin.strip() for origin in self.panel_allowed_origins.split(",") if origin.strip()]
        if not origins:
            raise RuntimeError("Missing required configuration: PANEL_ALLOWED_ORIGINS")
        if self.app_environment.lower() == "production" and "*" in origins:
            raise RuntimeError("PANEL_ALLOWED_ORIGINS cannot contain '*' in production")
        return origins

    @property
    def exposes_api_documentation(self) -> bool:
        return self.app_environment.lower() in {"development", "local", "test"}

    def require_database_url(self) -> str:
        if self.database_url is None or not self.database_url.get_secret_value():
            raise RuntimeError("Missing required configuration: DATABASE_URL")
        return self.database_url.get_secret_value()

    def require_protected_route_configuration(self) -> None:
        """Fail before a protected route accepts traffic with incomplete config."""
        missing = []
        if self.database_url is None or not self.database_url.get_secret_value():
            missing.append("DATABASE_URL")
        for name, value in (
            ("SUPABASE_URL", self.supabase_url),
            ("SUPABASE_ANON_KEY", self.supabase_anon_key),
        ):
            if not value:
                missing.append(name)
        if missing:
            raise RuntimeError(
                "Missing required configuration for protected routes: "
                + ", ".join(missing)
            )

    def require_document_storage_configuration(self) -> None:
        """Fail document routes closed when their server-only storage secrets are absent."""
        missing = []
        for name, value in (
            ("S3_BUCKET", self.s3_bucket),
            ("S3_REGION", self.s3_region),
            ("AWS_ACCESS_KEY_ID", self.aws_access_key_id),
            ("AWS_SECRET_ACCESS_KEY", self.aws_secret_access_key),
            ("DOCUMENT_MAPPING_ENCRYPTION_KEY", self.document_mapping_encryption_key),
        ):
            if value is None or (isinstance(value, SecretStr) and not value.get_secret_value()):
                missing.append(name)
        if missing:
            raise RuntimeError(
                "Missing required configuration for document storage: " + ", ".join(missing)
            )


@lru_cache
def get_settings() -> Settings:
    return Settings()
