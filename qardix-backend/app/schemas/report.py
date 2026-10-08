from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime
from uuid import UUID


class ReportResponse(BaseModel):
    id: UUID
    report_code: str
    assessment_id: UUID
    validation_id: Optional[UUID] = None
    doctor_id: UUID
    company_id: Optional[UUID] = None
    report_status: str
    generated_at: datetime

    class Config:
        from_attributes = True


class ReportDetailResponse(BaseModel):
    id: UUID
    report_code: str
    generated_at: datetime
    doctor_name: str
    doctor_specialty: Optional[str] = None
    company_name: Optional[str] = None
    anonymous_patient_id: str
    clinical_data: Dict[str, Any]
    ai_summary: str
    findings: List[Any]
    urgency: str
    patient_explanation: str
    warning_signs: List[str]
    validation_status: Optional[str] = None
    doctor_notes: Optional[str] = None
    image_url: Optional[str] = None
