import uuid
from datetime import datetime

from pydantic import BaseModel


class RecordMetadata(BaseModel):
    filename: str
    file_type: str
    size_bytes: int
    category: str
    description: str | None = None


class RecordCreate(BaseModel):
    metadata: RecordMetadata
    encrypted_master_key: str


class RecordResponse(BaseModel):
    id: uuid.UUID
    patient_id: uuid.UUID
    metadata: RecordMetadata
    encrypted_master_key: str
    created_at: datetime
