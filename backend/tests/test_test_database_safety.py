import pytest

from backend.tests.conftest import _require_test_database_url


def test_test_database_url_rejects_a_non_loopback_postgresql_host(monkeypatch):
    monkeypatch.setenv(
        "TEST_DATABASE_URL",
        "postgresql+psycopg://test-user@remote.example.test:5432/anonimizator_test",
    )

    with pytest.raises(pytest.fail.Exception, match="loopback"):
        _require_test_database_url()


@pytest.mark.parametrize(
    "database_url",
    (
        "postgresql+psycopg://test-user@127.0.0.1:5432/anonimizator_test",
        "postgresql+psycopg://test-user@localhost:5432/anonimizator_test",
        "postgresql+psycopg://test-user@[::1]:5432/anonimizator_test",
    ),
)
def test_test_database_url_accepts_loopback_postgresql_hosts(monkeypatch, database_url):
    monkeypatch.setenv("TEST_DATABASE_URL", database_url)

    assert _require_test_database_url() == database_url
