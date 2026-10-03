"""Shared fixtures for isolated backend access-boundary tests."""

from __future__ import annotations

import os
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.app.config import get_settings
from backend.app.database import get_engine, get_session_factory


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]


def _require_test_database_url() -> str:
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is required for PostgreSQL migration integration tests")
    assert database_url is not None
    if not database_url.startswith(("postgresql://", "postgresql+psycopg://")):
        pytest.fail("TEST_DATABASE_URL must point to PostgreSQL")
    if not database_url.rsplit("/", maxsplit=1)[-1].split("?", maxsplit=1)[0].endswith("_test"):
        pytest.fail("TEST_DATABASE_URL must use a database whose name ends in _test")
    return database_url


@pytest.fixture
def migrated_session_factory(monkeypatch):
    """Apply Alembic to an explicitly named local/test database and clean it up."""
    database_url = _require_test_database_url()
    monkeypatch.setenv("DATABASE_URL", database_url)
    get_settings.cache_clear()
    get_engine.cache_clear()
    get_session_factory.cache_clear()

    alembic_config = Config(str(REPOSITORY_ROOT / "alembic.ini"))
    command.upgrade(alembic_config, "head")

    engine = create_engine(database_url)
    with engine.begin() as connection:
        connection.execute(text("TRUNCATE TABLE profiles, offices RESTART IDENTITY CASCADE"))

    factory = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    yield factory

    with engine.begin() as connection:
        connection.execute(text("TRUNCATE TABLE profiles, offices RESTART IDENTITY CASCADE"))
    engine.dispose()
    get_settings.cache_clear()
    get_engine.cache_clear()
    get_session_factory.cache_clear()
