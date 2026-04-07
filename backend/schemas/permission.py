import uuid
from datetime import datetime

from pydantic import BaseModel


class PermissionResponse(BaseModel):
    doctor_id: uuid.UUID
    doctor_name: str
    granted_at: datetime
