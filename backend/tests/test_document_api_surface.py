"""S-01 API-surface regressions for document privacy boundaries."""
import json

from backend.app.config import Settings
from backend.app.main import create_app


def test_document_api_exposes_only_history_and_anonymized_result_download():
    app = create_app(Settings(app_environment="test", panel_allowed_origins="http://panel.test"))

    document_paths = {route.path for route in app.routes if route.path.startswith("/documents")}
    schema = json.dumps(app.openapi(), sort_keys=True)

    assert document_paths == {
        "/documents",
        "/documents/{document_id}/anonymized-download",
    }
    assert "original_object_key" not in schema
    assert "anonymized_object_key" not in schema
    assert "encrypted_mapping" not in schema
