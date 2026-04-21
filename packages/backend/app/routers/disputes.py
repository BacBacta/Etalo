from fastapi import APIRouter

router = APIRouter(prefix="/disputes", tags=["disputes"])


@router.post("/")
async def open_dispute():
    return {"message": "stub"}


@router.get("/{order_id}")
async def get_dispute(order_id: str):
    return {"message": "stub", "order_id": order_id}


@router.post("/{order_id}/escalate")
async def escalate_dispute(order_id: str):
    return {"message": "stub", "order_id": order_id}
