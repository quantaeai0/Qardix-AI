from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from uuid import UUID
from app.models.models import AccountStatus


class CompanyCreate(BaseModel):
    name: str
    code: str
    primary_contact: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    notes: Optional[str] = None
    status: AccountStatus = AccountStatus.active


class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    primary_contact: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[AccountStatus] = None


class CompanyStatusToggle(BaseModel):
    status: AccountStatus


class CompanyResponse(BaseModel):
    id: UUID
    name: str
    code: str
    primary_contact: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    notes: Optional[str] = None
    status: AccountStatus
    created_at: datetime
    doctor_count: int = 0
    mm_count: int = 0
    total_analyses: int = 0

    class Config:
        from_attributes = True
