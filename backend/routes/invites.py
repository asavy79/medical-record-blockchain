import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from dependencies import get_current_user, get_db
from models.doctor import Doctor
from models.invite import Invite
from models.patient import Patient
from schemas.invite import InviteCreate, InviteResponse, InviteUpdate

router = APIRouter(prefix="/invites", tags=["invites"])


@router.post("", response_model=InviteResponse, status_code=201)
async def create_invite(
    body: InviteCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    from_wallet = current_user["wallet_address"]
    to_wallet = body.to_wallet_address.lower()

    if from_wallet == to_wallet:
        raise HTTPException(status_code=400, detail="Cannot invite yourself")

    # Validate target wallet exists
    target_patient = await db.execute(
        select(Patient).where(Patient.wallet_address == to_wallet)
    )
    target_doctor = await db.execute(
        select(Doctor).where(Doctor.wallet_address == to_wallet)
    )
    if not target_patient.scalar_one_or_none() and not target_doctor.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Target wallet not registered")

    # Prevent duplicate pending invites
    existing = await db.execute(
        select(Invite).where(
            Invite.from_id == from_wallet,
            Invite.to_id == to_wallet,
            Invite.status == "pending",
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Pending invite already exists")

    invite = Invite(
        id=uuid.uuid4(),
        from_id=from_wallet,
        to_id=to_wallet,
        from_role=current_user["role"],
        status="pending",
    )
    db.add(invite)
    await db.commit()
    await db.refresh(invite)
    return invite


@router.get("", response_model=list[InviteResponse])
async def list_invites(
    status: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    wallet = current_user["wallet_address"]
    query = select(Invite).where(
        or_(Invite.from_id == wallet, Invite.to_id == wallet)
    )
    if status:
        query = query.where(Invite.status == status)

    result = await db.execute(query.order_by(Invite.created_at.desc()))
    return result.scalars().all()


@router.patch("/{invite_id}", response_model=InviteResponse)
async def update_invite(
    invite_id: uuid.UUID,
    body: InviteUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(select(Invite).where(Invite.id == invite_id))
    invite = result.scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")

    # Only the recipient can accept/decline
    if invite.to_id != current_user["wallet_address"]:
        raise HTTPException(status_code=403, detail="Only the invite recipient can update it")

    if invite.status != "pending":
        raise HTTPException(status_code=400, detail="Invite is no longer pending")

    invite.status = body.status
    await db.commit()
    await db.refresh(invite)
    return invite
