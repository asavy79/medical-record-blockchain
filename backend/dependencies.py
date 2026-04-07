from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import async_session
from models.doctor import Doctor
from models.patient import Patient
from services.auth import decode_jwt


async def get_db():
    async with async_session() as session:
        yield session


async def get_current_user(
    authorization: str = Header(...),
    db: AsyncSession = Depends(get_db),
) -> dict:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")

    token = authorization.removeprefix("Bearer ")
    try:
        payload = decode_jwt(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user_id = payload["sub"]
    role = payload["role"]

    # Verify user still exists
    if role == "patient":
        result = await db.execute(select(Patient).where(Patient.id == user_id))
        user = result.scalar_one_or_none()
    elif role == "doctor":
        result = await db.execute(select(Doctor).where(Doctor.id == user_id))
        user = result.scalar_one_or_none()
    else:
        raise HTTPException(status_code=401, detail="Invalid role in token")

    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return {
        "id": str(user.id),
        "role": role,
        "wallet_address": user.wallet_address,
    }
