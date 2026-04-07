from pydantic import BaseModel


class ChallengeResponse(BaseModel):
    nonce: str


class LoginRequest(BaseModel):
    wallet_address: str
    signature: str
    nonce: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    role: str
