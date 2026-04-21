from fastapi import APIRouter

router = APIRouter(prefix="/products", tags=["products"])


@router.get("/")
async def list_products():
    return {"message": "stub", "products": []}


@router.post("/")
async def create_product():
    return {"message": "stub"}


@router.get("/{product_id}")
async def get_product(product_id: str):
    return {"message": "stub", "product_id": product_id}


@router.put("/{product_id}")
async def update_product(product_id: str):
    return {"message": "stub", "product_id": product_id}


@router.delete("/{product_id}")
async def delete_product(product_id: str):
    return {"message": "stub", "product_id": product_id}
