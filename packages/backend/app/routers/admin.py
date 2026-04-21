from fastapi import APIRouter

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users")
async def list_users():
    return {"message": "stub", "users": []}


@router.post("/users/{wallet_address}/sanction")
async def sanction_user(wallet_address: str):
    return {"message": "stub", "wallet_address": wallet_address}


@router.get("/disputes")
async def list_disputes():
    return {"message": "stub", "disputes": []}


@router.post("/disputes/{order_id}/resolve")
async def resolve_dispute(order_id: str):
    return {"message": "stub", "order_id": order_id}
