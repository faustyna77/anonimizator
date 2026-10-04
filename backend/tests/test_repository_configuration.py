from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
PUBLIC_BUILD_CONFIGURATION = (
    REPOSITORY_ROOT / "frontend" / "Dockerfile",
    REPOSITORY_ROOT / "frontend" / "fly.toml",
    REPOSITORY_ROOT / ".github" / "workflows" / "fly-panel.yml",
)


def test_public_build_configuration_has_no_server_role_variable():
    for configuration_file in PUBLIC_BUILD_CONFIGURATION:
        contents = configuration_file.read_text(encoding="utf-8")
        assert "SUPABASE_SERVICE_ROLE_KEY" not in contents
        assert "VITE_SUPABASE_SERVICE_ROLE_KEY" not in contents


def test_example_server_role_value_is_a_non_secret_placeholder():
    example = (REPOSITORY_ROOT / ".env.example").read_text(encoding="utf-8")

    assert "SUPABASE_SERVICE_ROLE_KEY=replace-with-server-only-service-role-key" in example


def test_document_storage_secrets_are_not_frontend_build_variables():
    example = (REPOSITORY_ROOT / ".env.example").read_text(encoding="utf-8")

    for name in (
        "S3_BUCKET",
        "S3_REGION",
        "AWS_ACCESS_KEY_ID",
        "AWS_SECRET_ACCESS_KEY",
        "DOCUMENT_MAPPING_ENCRYPTION_KEY",
    ):
        assert f"VITE_{name}" not in example
        for configuration_file in PUBLIC_BUILD_CONFIGURATION:
            assert name not in configuration_file.read_text(encoding="utf-8")


def test_document_storage_example_uses_only_nonsecret_placeholders():
    example = (REPOSITORY_ROOT / ".env.example").read_text(encoding="utf-8")

    expected_placeholders = {
        "S3_BUCKET": "replace-with-document-storage-bucket",
        "S3_REGION": "replace-with-aws-region",
        "AWS_ACCESS_KEY_ID": "replace-with-s3-access-key-id",
        "AWS_SECRET_ACCESS_KEY": "replace-with-s3-secret-access-key",
        "DOCUMENT_MAPPING_ENCRYPTION_KEY": "replace-with-fernet-key",
    }
    definitions = dict(
        line.split("=", maxsplit=1)
        for line in example.splitlines()
        if "=" in line and not line.lstrip().startswith("#")
    )

    for name, placeholder in expected_placeholders.items():
        assert definitions[name] == placeholder
