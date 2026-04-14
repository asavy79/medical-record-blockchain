import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class InviteCreate(BaseModel):
    to_wallet_address: str


class InviteUpdate(BaseModel):
    status: Literal["accepted", "declined"]


class InviteResponse(BaseModel):
    id: uuid.UUID
    from_id: str
    to_id: str
    from_role: str
    status: str
    created_at: datetime
