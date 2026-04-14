import uuid
from datetime import datetime

from pydantic import BaseModel


class PermissionCreate(BaseModel):
    doctor_id: uuid.UUID


class PermissionResponse(BaseModel):
    doctor_id: uuid.UUID
    doctor_name: str
    granted_at: datetime
