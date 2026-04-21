from fastapi import APIRouter

router = APIRouter(prefix="/orders", tags=["orders"])


@router.get("/")
async def list_orders():
    return {"message": "stub", "orders": []}


@router.post("/")
async def create_order():
    return {"message": "stub"}


@router.get("/{order_id}")
async def get_order(order_id: str):
    return {"message": "stub", "order_id": order_id}


@router.post("/{order_id}/confirm")
async def confirm_delivery(order_id: str):
    return {"message": "stub", "order_id": order_id}
