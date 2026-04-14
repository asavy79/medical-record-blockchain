import json
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import io

from dependencies import get_current_user, get_db
from models.patient import Patient
from models.record import PatientRecord
from models.permission import RecordPermission

from schemas.record import RecordCreate, RecordMetadata, RecordResponse

router = APIRouter(prefix="/patients/{patient_id}/records", tags=["records"])


@router.post("", response_model=RecordResponse, status_code=201)
async def create_record(
    patient_id: uuid.UUID,
    metadata: str = Form(...),
    encrypted_master_key: str = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    # Only the patient themselves can upload records
    if current_user["role"] != "patient" or current_user["id"] != str(patient_id):
        raise HTTPException(status_code=403, detail="Only the patient can upload their own records")

    # Validate patient exists
    result = await db.execute(select(Patient).where(Patient.id == patient_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Patient not found")

    # Parse metadata JSON
    try:
        meta = RecordMetadata.model_validate_json(metadata)
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid metadata JSON")

    file_bytes = await file.read()

    record = PatientRecord(
        id=uuid.uuid4(),
        patient_id=patient_id,
        metadata_=meta.model_dump(),
        encrypted_master_key=encrypted_master_key,
        file_data=file_bytes,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)

    return RecordResponse(
        id=record.id,
        patient_id=record.patient_id,
        metadata=RecordMetadata.model_validate(record.metadata_),
        encrypted_master_key=record.encrypted_master_key,
        created_at=record.created_at,
    )


@router.get("", response_model=list[RecordResponse])
async def list_records(
    patient_id: uuid.UUID,
    shared_with: uuid.UUID | None = Query(
        default=None,
        description="When set, only return records this doctor has been granted access to (patient role only).",
    ),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] == "patient":
        # Patient can see all their own records, or filter to those shared with a specific doctor
        if current_user["id"] != str(patient_id):
            raise HTTPException(status_code=403, detail="Cannot view another patient's records")
        if shared_with is not None:
            result = await db.execute(
                select(PatientRecord)
                .join(RecordPermission, RecordPermission.record_id == PatientRecord.id)
                .where(
                    PatientRecord.patient_id == patient_id,
                    RecordPermission.doctor_id == shared_with,
                    RecordPermission.revoked_at.is_(None),
                )
            )
        else:
            result = await db.execute(
                select(PatientRecord).where(PatientRecord.patient_id == patient_id)
            )
    elif current_user["role"] == "doctor":
        # Doctor can only see records they have permission for
        from models.doctor import Doctor
        doc_result = await db.execute(
            select(Doctor).where(Doctor.wallet_address == current_user["wallet_address"])
        )
        doctor = doc_result.scalar_one_or_none()
        if not doctor:
            raise HTTPException(status_code=404, detail="Doctor not found")

        result = await db.execute(
            select(PatientRecord)
            .join(RecordPermission, RecordPermission.record_id == PatientRecord.id)
            .where(
                PatientRecord.patient_id == patient_id,
                RecordPermission.doctor_id == doctor.id,
                RecordPermission.revoked_at.is_(None),
            )
        )
    else:
        raise HTTPException(status_code=403, detail="Invalid role")

    records = result.scalars().all()
    return [
        RecordResponse(
            id=r.id,
            patient_id=r.patient_id,
            metadata=RecordMetadata.model_validate(r.metadata_),
            encrypted_master_key=r.encrypted_master_key,
            created_at=r.created_at,
        )
        for r in records
    ]


@router.get("/{record_id}", response_model=RecordResponse)
async def get_record(
    patient_id: uuid.UUID,
    record_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    record = await _get_record_with_access_check(patient_id, record_id, db, current_user)
    return RecordResponse(
        id=record.id,
        patient_id=record.patient_id,
        metadata=RecordMetadata.model_validate(record.metadata_),
        encrypted_master_key=record.encrypted_master_key,
        created_at=record.created_at,
    )


@router.get("/{record_id}/file")
async def get_record_file(
    patient_id: uuid.UUID,
    record_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    record = await _get_record_with_access_check(patient_id, record_id, db, current_user)
    return StreamingResponse(
        io.BytesIO(record.file_data),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename={record.metadata_.get('filename', 'file')}"},
    )


async def _get_record_with_access_check(
    patient_id: uuid.UUID,
    record_id: uuid.UUID,
    db: AsyncSession,
    current_user: dict,
) -> PatientRecord:
    result = await db.execute(
        select(PatientRecord).where(
            PatientRecord.id == record_id,
            PatientRecord.patient_id == patient_id,
        )
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")

    # Patient can access their own records
    if current_user["role"] == "patient" and current_user["id"] == str(patient_id):
        return record

    # Doctor needs a non-revoked permission
    if current_user["role"] == "doctor":
        from models.doctor import Doctor
        doc_result = await db.execute(
            select(Doctor).where(Doctor.wallet_address == current_user["wallet_address"])
        )
        doctor = doc_result.scalar_one_or_none()
        if doctor:
            perm_result = await db.execute(
                select(RecordPermission).where(
                    RecordPermission.record_id == record_id,
                    RecordPermission.doctor_id == doctor.id,
                    RecordPermission.revoked_at.is_(None),
                )
            )
            if perm_result.scalar_one_or_none():
                return record

    raise HTTPException(status_code=403, detail="Access denied")
