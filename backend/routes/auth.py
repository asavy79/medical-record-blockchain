from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends

from dependencies import get_db
from models.doctor import Doctor
from models.patient import Patient
from schemas.auth import ChallengeResponse, LoginRequest, LoginResponse
from services.auth import create_jwt, generate_challenge, verify_wallet_signature

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/challenge", response_model=ChallengeResponse)
async def get_challenge(wallet_address: str = Query(...)):
    nonce = generate_challenge(wallet_address)
    return ChallengeResponse(nonce=nonce)


@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    if not verify_wallet_signature(body.wallet_address, body.signature, body.nonce):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Look up user in patients first, then doctors
    addr = body.wallet_address.lower()

    result = await db.execute(
        select(Patient).where(Patient.wallet_address.ilike(addr))
    )
    patient = result.scalar_one_or_none()
    if patient:
        token = create_jwt(str(patient.id), "patient")
        return LoginResponse(
            access_token=token, user_id=str(patient.id), role="patient"
        )

    result = await db.execute(
        select(Doctor).where(Doctor.wallet_address.ilike(addr))
    )
    doctor = result.scalar_one_or_none()
    if doctor:
        token = create_jwt(str(doctor.id), "doctor")
        return LoginResponse(
            access_token=token, user_id=str(doctor.id), role="doctor"
        )

    raise HTTPException(status_code=404, detail="Wallet not registered")
