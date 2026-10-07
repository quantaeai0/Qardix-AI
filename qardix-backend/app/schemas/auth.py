from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from app.models.models import AppRole, AccountStatus


class LoginRequest(BaseModel):
    login_id: str
    password: str


class UserMinResponse(BaseModel):
    id: UUID
    email: str
    display_name: str
    role: AppRole
    company_id: Optional[UUID] = None
    company_name: Optional[str] = None
    specialty: Optional[str] = None
    status: AccountStatus
    force_password_reset: bool

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserMinResponse


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class PasswordResetRequest(BaseModel):
    current_password: str
    new_password: str
