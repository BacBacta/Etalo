from fastapi import APIRouter

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me")
async def get_current_user():
    # TODO: implement with JWT auth dependency
    return {"message": "stub — requires auth"}


@router.put("/me")
async def update_current_user():
    return {"message": "stub"}


@router.get("/{wallet_address}/profile")
async def get_public_profile(wallet_address: str):
    return {"message": "stub", "wallet_address": wallet_address}
