import secrets

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.security import create_access_token

router = APIRouter(prefix="/auth", tags=["auth"])

# In-memory nonce store (replace with Redis in production)
_nonces: dict[str, str] = {}


class NonceRequest(BaseModel):
    wallet_address: str


class NonceResponse(BaseModel):
    nonce: str
    message: str


class VerifyRequest(BaseModel):
    wallet_address: str
    signature: str


class VerifyResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


@router.post("/nonce", response_model=NonceResponse)
async def request_nonce(body: NonceRequest):
    nonce = secrets.token_hex(16)
    _nonces[body.wallet_address.lower()] = nonce
    message = f"Sign this message to log in to Etalo: {nonce}"
    return NonceResponse(nonce=nonce, message=message)


@router.post("/verify", response_model=VerifyResponse)
async def verify_signature(body: VerifyRequest):
    address = body.wallet_address.lower()
    stored_nonce = _nonces.pop(address, None)

    if not stored_nonce:
        raise HTTPException(status_code=400, detail="No nonce found for this address")

    # TODO: Verify EIP-191 signature against nonce message using viem/ethers
    # For now, accept any signature in development
    token = create_access_token(data={"sub": address})
    return VerifyResponse(access_token=token)
