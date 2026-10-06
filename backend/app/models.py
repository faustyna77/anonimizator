"""Minimal PostgreSQL ownership model for a Supabase account and office."""

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    LargeBinary,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID as PostgreSQLUUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Office(Base):
    __tablename__ = "offices"

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    profile: Mapped["Profile"] = relationship(back_populates="office", uselist=False)
    documents: Mapped[list["Document"]] = relationship(
        back_populates="office",
        overlaps="uploaded_by_profile,uploaded_documents",
    )
    anonymization_rules: Mapped[list["OfficeAnonymizationRule"]] = relationship(back_populates="office")


class OfficeAnonymizationRule(Base):
    """A phrase or RE2 regex rule scoped to one trusted office."""

    __tablename__ = "office_anonymization_rules"
    __table_args__ = (
        CheckConstraint("kind IN ('phrase', 'regex')", name="ck_office_rules_kind"),
        ForeignKeyConstraint(
            ["office_id"],
            ["offices.id"],
            name="fk_office_rules_office",
            ondelete="RESTRICT",
        ),
        UniqueConstraint("office_id", "kind", "pattern", name="uq_office_rules_kind_pattern"),
        Index("ix_office_rules_office_enabled", "office_id", "enabled"),
    )

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4)
    office_id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    pattern: Mapped[str] = mapped_column(String(512), nullable=False)
    marker_label: Mapped[str] = mapped_column(String(32), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    office: Mapped[Office] = relationship(back_populates="anonymization_rules")


class Profile(Base):
    __tablename__ = "profiles"
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_profiles_user_id"),
        UniqueConstraint("office_id", name="uq_profiles_office_id"),
        UniqueConstraint("id", "office_id", name="uq_profiles_id_office_id"),
    )

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[str] = mapped_column(String(255), nullable=False)
    office_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True), ForeignKey("offices.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    office: Mapped[Office] = relationship(back_populates="profile")
    uploaded_documents: Mapped[list["Document"]] = relationship(
        back_populates="uploaded_by_profile",
        primaryjoin=lambda: (Profile.id == Document.uploaded_by_profile_id)
        & (Profile.office_id == Document.office_id),
        foreign_keys=lambda: [Document.uploaded_by_profile_id, Document.office_id],
        overlaps="documents,office",
    )


class Document(Base):
    """S3-backed document metadata scoped to one server-derived office."""

    __tablename__ = "documents"
    __table_args__ = (
        CheckConstraint(
            "status IN ('processing', 'ready', 'failed')",
            name="ck_documents_status",
        ),
        ForeignKeyConstraint(
            ["uploaded_by_profile_id", "office_id"],
            ["profiles.id", "profiles.office_id"],
            name="fk_documents_uploader_office",
            ondelete="RESTRICT",
        ),
        Index("ix_documents_office_id", "office_id"),
    )

    id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), primary_key=True, default=uuid4)
    office_id: Mapped[UUID] = mapped_column(
        PostgreSQLUUID(as_uuid=True),
        ForeignKey("offices.id", ondelete="RESTRICT"),
        nullable=False,
    )
    uploaded_by_profile_id: Mapped[UUID] = mapped_column(PostgreSQLUUID(as_uuid=True), nullable=False)
    original_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    document_format: Mapped[str] = mapped_column(String(10), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="processing")
    original_object_key: Mapped[str] = mapped_column(String(1024), nullable=False, unique=True)
    anonymized_object_key: Mapped[str | None] = mapped_column(String(1024), unique=True)
    encrypted_mapping: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    office: Mapped[Office] = relationship(
        back_populates="documents",
        overlaps="uploaded_by_profile,uploaded_documents",
    )
    uploaded_by_profile: Mapped[Profile] = relationship(
        back_populates="uploaded_documents",
        primaryjoin=lambda: (Document.uploaded_by_profile_id == Profile.id)
        & (Document.office_id == Profile.office_id),
        foreign_keys=lambda: [Document.uploaded_by_profile_id, Document.office_id],
        overlaps="documents,office",
    )
