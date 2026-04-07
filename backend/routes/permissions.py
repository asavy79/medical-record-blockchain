import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from dependencies import get_current_user, get_db
from models.doctor import Doctor
from models.permission import RecordPermission
from models.record import PatientRecord
from schemas.permission import PermissionResponse

router = APIRouter(
    prefix="/patients/{patient_id}/records/{record_id}/permissions",
    tags=["permissions"],
)


@router.get("", response_model=list[PermissionResponse])
async def list_permissions(
    patient_id: uuid.UUID,
    record_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    # Only the patient who owns the record can view its permissions
    if current_user["role"] != "patient" or current_user["id"] != str(patient_id):
        raise HTTPException(status_code=403, detail="Only the record owner can view permissions")

    # Verify record exists and belongs to this patient
    result = await db.execute(
        select(PatientRecord).where(
            PatientRecord.id == record_id,
            PatientRecord.patient_id == patient_id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Record not found")

    # Get active permissions joined with doctor info
    perm_result = await db.execute(
        select(RecordPermission, Doctor)
        .join(Doctor, Doctor.id == RecordPermission.doctor_id)
        .where(
            RecordPermission.record_id == record_id,
            RecordPermission.revoked_at.is_(None),
        )
    )
    rows = perm_result.all()
    return [
        PermissionResponse(
            doctor_id=perm.doctor_id,
            doctor_name=doctor.name,
            granted_at=perm.granted_at,
        )
        for perm, doctor in rows
    ]
