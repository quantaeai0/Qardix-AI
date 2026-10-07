from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from uuid import UUID


class DemoRequestCreate(BaseModel):
    name: str
    email: str
    organisation: Optional[str] = None
    message: Optional[str] = None


class DemoRequestResponse(BaseModel):
    id: UUID
    name: str
    email: str
    organisation: Optional[str] = None
    message: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
