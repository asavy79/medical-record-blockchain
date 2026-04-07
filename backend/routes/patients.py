import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from dependencies import get_current_user, get_db
from models.patient import Patient
from schemas.patient import PatientCreate, PatientResponse

router = APIRouter(prefix="/patients", tags=["patients"])


@router.post("", response_model=PatientResponse, status_code=201)
async def create_patient(body: PatientCreate, db: AsyncSession = Depends(get_db)):
    # Check for duplicate wallet or email
    existing = await db.execute(
        select(Patient).where(
            (Patient.wallet_address.ilike(body.wallet_address))
            | (Patient.email == body.email)
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Patient already registered")

    patient = Patient(
        id=uuid.uuid4(),
        name=body.name,
        email=body.email,
        wallet_address=body.wallet_address.lower(),
        public_key=body.public_key,
    )
    db.add(patient)
    await db.commit()
    await db.refresh(patient)
    return patient


@router.get("", response_model=list[PatientResponse])
async def list_patients(
    db: AsyncSession = Depends(get_db),
    _current_user: dict = Depends(get_current_user),
):
    result = await db.execute(select(Patient))
    return result.scalars().all()


@router.get("/by-wallet/{wallet_address}", response_model=PatientResponse)
async def get_patient_by_wallet(
    wallet_address: str,
    db: AsyncSession = Depends(get_db),
    _current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(Patient).where(Patient.wallet_address == wallet_address.lower())
    )
    patient = result.scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    return patient


@router.get("/{patient_id}", response_model=PatientResponse)
async def get_patient(
    patient_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _current_user: dict = Depends(get_current_user),
):
    result = await db.execute(select(Patient).where(Patient.id == patient_id))
    patient = result.scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    return patient
