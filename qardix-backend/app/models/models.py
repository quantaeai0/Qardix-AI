"""
SQLAlchemy ORM models — mirrors the Qardix AI schema.
NOTE: Users table here replaces auth.users + profiles + user_roles from Lovable/Supabase.
      We manage auth ourselves via JWT; Supabase Storage is still used for ECG files.
"""

import uuid
import enum
from sqlalchemy import (
    Column, String, Integer, Numeric, Boolean,
    DateTime, ForeignKey, Text, JSON, Enum as PgEnum,
)
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database.connection import Base


# ── Enums ─────────────────────────────────────────────────────────────────────

class AppRole(str, enum.Enum):
    super_admin = "super_admin"
    marketing_manager = "marketing_manager"
    doctor = "doctor"


class AccountStatus(str, enum.Enum):
    active = "active"
    inactive = "inactive"


class ProcessingStatus(str, enum.Enum):
    uploaded = "uploaded"
    quality_checking = "quality_checking"
    quality_failed = "quality_failed"
    preprocessing = "preprocessing"
    digitising = "digitising"
    digitisation_failed = "digitisation_failed"
    predicting = "predicting"
    completed = "completed"
    failed = "failed"


# ── Tables ────────────────────────────────────────────────────────────────────

class Company(Base):
    __tablename__ = "companies"

    id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name           = Column(String(255), nullable=False)
    code           = Column(String(50), nullable=False, unique=True)
    primary_contact= Column(String(255))
    contact_email  = Column(String(255))
    contact_phone  = Column(String(50))
    notes          = Column(Text)
    status         = Column(PgEnum(AccountStatus, name="account_status"), nullable=False, default=AccountStatus.active)
    created_at     = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    users = relationship("User", back_populates="company")


class User(Base):
    """
    Single table for all user types (super_admin / marketing_manager / doctor).
    Replaces Supabase auth.users + profiles + user_roles.
    """
    __tablename__ = "users"

    id                  = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email               = Column(String(255), nullable=False, unique=True, index=True)
    hashed_password     = Column(String(255), nullable=False)
    display_name        = Column(String(255), nullable=False)
    role                = Column(PgEnum(AppRole, name="app_role"), nullable=False)
    company_id          = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="SET NULL"), index=True)
    specialty           = Column(String(120))
    status              = Column(PgEnum(AccountStatus, name="account_status"), nullable=False, default=AccountStatus.active)
    force_password_reset= Column(Boolean, nullable=False, default=False)
    last_activity_at    = Column(DateTime(timezone=True))
    created_at          = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    company     = relationship("Company", back_populates="users")
    assessments = relationship("PatientAssessment", back_populates="doctor", foreign_keys="PatientAssessment.doctor_id")


class PatientAssessment(Base):
    __tablename__ = "patient_assessments"

    id                    = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    anonymous_patient_id  = Column(String(50), nullable=False, unique=True)
    doctor_id             = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    company_id            = Column(UUID(as_uuid=True), ForeignKey("companies.id"), index=True)
    age                   = Column(Integer, nullable=False)
    sex                   = Column(String(20), nullable=False)
    height_cm             = Column(Numeric(5, 1), nullable=False)
    weight_kg             = Column(Numeric(5, 1), nullable=False)
    bmi                   = Column(Numeric(5, 2))
    bp_systolic           = Column(Integer, nullable=False)
    bp_diastolic          = Column(Integer, nullable=False)
    heart_rate            = Column(Integer, nullable=False)
    spo2                  = Column(Integer, nullable=False)
    diabetes_status       = Column(String(50), nullable=False)
    diabetic_complications= Column(ARRAY(String), nullable=False, server_default="{}")
    symptoms              = Column(JSON, nullable=False, server_default="{}")
    medicines             = Column(ARRAY(String), nullable=False, server_default="{}")
    training_consent      = Column(Boolean, nullable=False, default=False)
    created_at            = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)

    doctor          = relationship("User", back_populates="assessments", foreign_keys=[doctor_id])
    company         = relationship("Company", foreign_keys=[company_id])
    ecg_record      = relationship("EcgRecord", back_populates="assessment", uselist=False, cascade="all, delete-orphan")
    ai_result       = relationship("AiResult", back_populates="assessment", uselist=False, cascade="all, delete-orphan")
    validation      = relationship("DoctorValidation", back_populates="assessment", uselist=False, cascade="all, delete-orphan")
    report          = relationship("Report", back_populates="assessment", uselist=False, cascade="all, delete-orphan")


class EcgRecord(Base):
    __tablename__ = "ecg_records"

    id                = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    assessment_id     = Column(UUID(as_uuid=True), ForeignKey("patient_assessments.id", ondelete="CASCADE"), nullable=False, index=True)
    doctor_id         = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    company_id        = Column(UUID(as_uuid=True), ForeignKey("companies.id"))
    image_path        = Column(String(500))          # Supabase Storage path
    quality_status    = Column(String(30), nullable=False, default="pending")   # accepted | needs_reupload
    quality_reason    = Column(String(500))
    processing_status = Column(String(30), nullable=False, default="uploaded")  # see ProcessingStatus enum
    model_version     = Column(String(50))
    created_at        = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    assessment = relationship("PatientAssessment", back_populates="ecg_record")
    ai_result  = relationship("AiResult", back_populates="ecg_record", uselist=False)


class AiResult(Base):
    __tablename__ = "ai_results"

    id                  = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ecg_record_id       = Column(UUID(as_uuid=True), ForeignKey("ecg_records.id", ondelete="CASCADE"), nullable=False)
    assessment_id       = Column(UUID(as_uuid=True), ForeignKey("patient_assessments.id", ondelete="CASCADE"), nullable=False, index=True)
    doctor_id           = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    company_id          = Column(UUID(as_uuid=True), ForeignKey("companies.id"))
    ai_summary          = Column(Text, nullable=False)
    findings            = Column(JSON, nullable=False, server_default="[]")     # [{label, detail}]
    confidence_json     = Column(JSON, nullable=False, server_default="{}")     # {overall: 0.91}
    abnormal_leads      = Column(ARRAY(String), nullable=False, server_default="{}")
    urgency             = Column(String(20), nullable=False)                    # routine|review_soon|urgent
    patient_explanation = Column(Text, nullable=False)
    warning_signs       = Column(ARRAY(String), nullable=False, server_default="{}")
    raw_output_json     = Column(JSON, nullable=False, server_default="{}")     # full model output preserved
    created_at          = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    ecg_record = relationship("EcgRecord", back_populates="ai_result")
    assessment = relationship("PatientAssessment", back_populates="ai_result")


class DoctorValidation(Base):
    __tablename__ = "doctor_validations"

    id                       = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ai_result_id             = Column(UUID(as_uuid=True), ForeignKey("ai_results.id", ondelete="CASCADE"), nullable=False)
    assessment_id            = Column(UUID(as_uuid=True), ForeignKey("patient_assessments.id", ondelete="CASCADE"), nullable=False, index=True)
    doctor_id                = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    company_id               = Column(UUID(as_uuid=True), ForeignKey("companies.id"))
    status                   = Column(String(20), nullable=False)   # confirm | correct | reject
    corrected_interpretation = Column(Text)
    notes                    = Column(Text)
    validated_at             = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    assessment = relationship("PatientAssessment", back_populates="validation")


class Report(Base):
    __tablename__ = "reports"

    id            = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    report_code   = Column(String(30), nullable=False, unique=True)
    assessment_id = Column(UUID(as_uuid=True), ForeignKey("patient_assessments.id", ondelete="CASCADE"), nullable=False)
    validation_id = Column(UUID(as_uuid=True), ForeignKey("doctor_validations.id"))
    doctor_id     = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    company_id    = Column(UUID(as_uuid=True), ForeignKey("companies.id"))
    report_status = Column(String(30), nullable=False, default="generated")
    pdf_ref       = Column(String(500))
    generated_at  = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)

    assessment = relationship("PatientAssessment", back_populates="report")


class UsageEvent(Base):
    __tablename__ = "usage_events"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id      = Column(UUID(as_uuid=True), ForeignKey("companies.id"), index=True)
    doctor_id       = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    event_type      = Column(String(50), nullable=False, index=True)   # login|analysis_completed|report_generated
    analysis_status = Column(String(30))
    created_at      = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    actor_id    = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    actor_role  = Column(String(30))
    action      = Column(String(100), nullable=False)    # user.created | ecg.uploaded | validation.saved ...
    target_type = Column(String(50))
    target_id   = Column(UUID(as_uuid=True))
    log_metadata= Column(JSON, server_default="{}")
    ip_address  = Column(String(50))
    created_at  = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)


class DemoRequest(Base):
    __tablename__ = "demo_requests"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name         = Column(String(255), nullable=False)
    email        = Column(String(255), nullable=False)
    organisation = Column(String(255))
    message      = Column(Text)
    created_at   = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
