from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from uuid import UUID
from app.models.models import AppRole, AccountStatus


class UserCreate(BaseModel):
    email: str
    display_name: str
    password: str
    role: AppRole
    company_id: Optional[UUID] = None
    specialty: Optional[str] = None
    status: AccountStatus = AccountStatus.active


class DoctorCreate(BaseModel):
    email: str
    display_name: str
    password: str
    company_id: UUID
    specialty: Optional[str] = None
    status: AccountStatus = AccountStatus.active


class MMCreate(BaseModel):
    email: str
    display_name: str
    password: str
    company_id: UUID
    status: AccountStatus = AccountStatus.active


class UserUpdate(BaseModel):
    display_name: Optional[str] = None
    specialty: Optional[str] = None
    company_id: Optional[UUID] = None
    status: Optional[AccountStatus] = None


class UserStatusToggle(BaseModel):
    status: AccountStatus


class UserResponse(BaseModel):
    id: UUID
    email: str
    display_name: str
    role: AppRole
    company_id: Optional[UUID] = None
    company_name: Optional[str] = None
    specialty: Optional[str] = None
    status: AccountStatus
    force_password_reset: bool
    last_activity_at: Optional[datetime] = None
    created_at: datetime
    total_analyses: int = 0

    class Config:
        from_attributes = True
