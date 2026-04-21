from fastapi import APIRouter

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/dashboard")
async def get_dashboard():
    return {"message": "stub", "stats": {}}


@router.get("/seller/{wallet_address}")
async def get_seller_analytics(wallet_address: str):
    return {"message": "stub", "wallet_address": wallet_address}
