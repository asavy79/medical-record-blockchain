import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from dependencies import get_current_user, get_db
from models.doctor import Doctor
from schemas.doctor import DoctorCreate, DoctorResponse

router = APIRouter(prefix="/doctors", tags=["doctors"])


@router.post("", response_model=DoctorResponse, status_code=201)
async def create_doctor(body: DoctorCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(
        select(Doctor).where(
            (Doctor.wallet_address.ilike(body.wallet_address))
            | (Doctor.email == body.email)
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Doctor already registered")

    doctor = Doctor(
        id=uuid.uuid4(),
        name=body.name,
        email=body.email,
        wallet_address=body.wallet_address.lower(),
        public_key=body.public_key,
        specialty=body.specialty,
    )
    db.add(doctor)
    await db.commit()
    await db.refresh(doctor)
    return doctor


@router.get("/{doctor_id}", response_model=DoctorResponse)
async def get_doctor(
    doctor_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _current_user: dict = Depends(get_current_user),
):
    result = await db.execute(select(Doctor).where(Doctor.id == doctor_id))
    doctor = result.scalar_one_or_none()
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found")
    return doctor


@router.get("", response_model=list[DoctorResponse])
async def list_doctors(
    search: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _current_user: dict = Depends(get_current_user),
):
    query = select(Doctor)
    if search:
        pattern = f"%{search}%"
        query = query.where(
            Doctor.name.ilike(pattern) | Doctor.specialty.ilike(pattern)
        )
    result = await db.execute(query)
    return result.scalars().all()
