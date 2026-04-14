import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr


class DoctorCreate(BaseModel):
    name: str
    email: EmailStr
    wallet_address: str
    public_key: str
    specialty: str | None = None


class DoctorResponse(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    wallet_address: str
    public_key: str
    specialty: str | None
    created_at: datetime
