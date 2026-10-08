from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from uuid import UUID


class SymptomsSchema(BaseModel):
    chest_pain: bool = False
    palpitation: bool = False
    breathlessness: bool = False
    syncope: bool = False


class PatientAssessmentCreate(BaseModel):
    age: int = Field(..., ge=1, le=120)
    sex: str = Field(..., description="Male | Female | Other")
    height_cm: float = Field(..., ge=30, le=250)
    weight_kg: float = Field(..., ge=2, le=300)
    bp_systolic: int = Field(..., ge=50, le=250)
    bp_diastolic: int = Field(..., ge=30, le=150)
    heart_rate: int = Field(..., ge=30, le=220)
    spo2: int = Field(..., ge=50, le=100)
    diabetes_status: str = Field(..., description="Non-Diabetic | Prediabetes | Type 1 Diabetes | Type 2 Diabetes | Unknown")
    diabetic_complications: List[str] = []
    symptoms: SymptomsSchema
    medicines: List[str] = []
    training_consent: bool = False


class PatientAssessmentResponse(BaseModel):
    id: UUID
    anonymous_patient_id: str
    doctor_id: UUID
    company_id: Optional[UUID] = None
    doctor_name: Optional[str] = None
    company_name: Optional[str] = None
    age: int
    sex: str
    height_cm: float
    weight_kg: float
    bmi: Optional[float] = None
    bp_systolic: int
    bp_diastolic: int
    heart_rate: int
    spo2: int
    diabetes_status: str
    diabetic_complications: List[str]
    symptoms: Dict[str, Any]
    medicines: List[str]
    training_consent: bool
    created_at: datetime
    ai_summary: Optional[str] = None
    urgency: Optional[str] = None
    quality_status: Optional[str] = None
    processing_status: Optional[str] = None
    validation_status: Optional[str] = None
    report_code: Optional[str] = None
    report_status: Optional[str] = None

    class Config:
        from_attributes = True


class DoctorValidationCreate(BaseModel):
    status: str = Field(..., description="confirm | correct | reject")
    corrected_interpretation: Optional[str] = None
    notes: Optional[str] = None


class DoctorValidationResponse(BaseModel):
    id: UUID
    ai_result_id: UUID
    assessment_id: UUID
    doctor_id: UUID
    status: str
    corrected_interpretation: Optional[str] = None
    notes: Optional[str] = None
    validated_at: datetime

    class Config:
        from_attributes = True
