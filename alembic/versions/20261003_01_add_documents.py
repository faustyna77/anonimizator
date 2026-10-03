"""add documents

Revision ID: 20261003_01
Revises: 20261002_01
Create Date: 2026-10-03
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20261003_01"
down_revision = "20261002_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_unique_constraint(
        "uq_profiles_id_office_id",
        "profiles",
        ["id", "office_id"],
    )
    op.create_table(
        "documents",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("office_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("uploaded_by_profile_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("document_format", sa.String(length=10), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("original_object_key", sa.String(length=1024), nullable=False),
        sa.Column("anonymized_object_key", sa.String(length=1024), nullable=True),
        sa.Column("encrypted_mapping", sa.LargeBinary(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status IN ('processing', 'ready', 'failed')",
            name="ck_documents_status",
        ),
        sa.ForeignKeyConstraint(["office_id"], ["offices.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["uploaded_by_profile_id", "office_id"],
            ["profiles.id", "profiles.office_id"],
            name="fk_documents_uploader_office",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("original_object_key"),
        sa.UniqueConstraint("anonymized_object_key"),
    )
    op.create_index("ix_documents_office_id", "documents", ["office_id"])


def downgrade() -> None:
    op.drop_index("ix_documents_office_id", table_name="documents")
    op.drop_table("documents")
    op.drop_constraint("uq_profiles_id_office_id", "profiles", type_="unique")
