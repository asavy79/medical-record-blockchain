import secrets
from datetime import datetime, timedelta, timezone

from eth_account.messages import encode_defunct
from jose import jwt
from web3 import Web3

from config import settings

# In-memory nonce store: wallet_address -> (nonce, expiry)
_nonce_store: dict[str, tuple[str, datetime]] = {}


def generate_challenge(wallet_address: str) -> str:
    nonce = secrets.token_hex(32)
    message = f"Sign this message to authenticate: {nonce}"
    expiry = datetime.now(timezone.utc) + timedelta(minutes=5)
    _nonce_store[wallet_address.lower()] = (message, expiry)
    return message


def verify_wallet_signature(wallet_address: str, signature: str, nonce: str) -> bool:
    key = wallet_address.lower()
    stored = _nonce_store.get(key)
    if not stored:
        return False

    stored_nonce, expiry = stored
    if datetime.now(timezone.utc) > expiry:
        _nonce_store.pop(key, None)
        return False

    if stored_nonce != nonce:
        return False

    # Recover the signer address from the signature
    w3 = Web3()
    message = encode_defunct(text=nonce)
    recovered = w3.eth.account.recover_message(message, signature=signature)

    # Clean up used nonce
    _nonce_store.pop(key, None)

    return recovered.lower() == key


def create_jwt(user_id: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=settings.jwt_expiry_hours),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_jwt(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
