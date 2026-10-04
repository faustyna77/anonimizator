"""add document original filename metadata

Revision ID: 20261004_01
Revises: 20261003_01
Create Date: 2026-10-04
"""

from alembic import op
import sqlalchemy as sa


revision = "20261004_01"
down_revision = "20261003_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("original_filename", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("documents", "original_filename")
