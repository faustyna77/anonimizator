"""add office anonymization rules

Revision ID: 20261006_01
Revises: 20261004_01
Create Date: 2026-10-06
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20261006_01"
down_revision = "20261004_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "office_anonymization_rules",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("office_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("pattern", sa.String(length=512), nullable=False),
        sa.Column("marker_label", sa.String(length=32), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint("kind IN ('phrase', 'regex')", name="ck_office_rules_kind"),
        sa.ForeignKeyConstraint(
            ["office_id"],
            ["offices.id"],
            name="fk_office_rules_office",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("office_id", "kind", "pattern", name="uq_office_rules_kind_pattern"),
    )
    op.create_index(
        "ix_office_rules_office_enabled",
        "office_anonymization_rules",
        ["office_id", "enabled"],
    )


def downgrade() -> None:
    op.drop_index("ix_office_rules_office_enabled", table_name="office_anonymization_rules")
    op.drop_table("office_anonymization_rules")
