import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class RecordPermission(Base):
    __tablename__ = "record_permissions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    record_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("patient_records.id"))
    doctor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("doctors.id"))
    granted_at: Mapped[datetime] = mapped_column(default=func.now())
    revoked_at: Mapped[datetime | None] = mapped_column(nullable=True)
