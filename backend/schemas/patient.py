import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr


class PatientCreate(BaseModel):
    name: str
    email: EmailStr
    wallet_address: str
    public_key: str


class PatientResponse(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    wallet_address: str
    public_key: str
    created_at: datetime
