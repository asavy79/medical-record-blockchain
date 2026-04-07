import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, LargeBinary, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class PatientRecord(Base):
    __tablename__ = "patient_records"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    patient_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("patients.id"))
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB)
    encrypted_master_key: Mapped[str] = mapped_column(Text)
    file_data: Mapped[bytes] = mapped_column(LargeBinary)
    created_at: Mapped[datetime] = mapped_column(default=func.now())
