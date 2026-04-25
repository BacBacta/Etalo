from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import (
    admin,
    analytics,
    auth,
    disputes,
    health,
    notifications,
    onboarding,
    orders,
    products,
    sellers,
    uploads,
    users,
)
from app.services.celo import CeloService


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup — instantiate the V2 CeloService (no RPC call yet, just
    # contract objects). Routes pull it via Depends(get_celo_service).
    app.state.celo_service = CeloService.from_settings()
    yield
    # Shutdown — AsyncHTTPProvider has no explicit close hook in web3.py
    # 7.x; the connection pool is GC'd with the provider.


def get_celo_service(request) -> CeloService:
    """FastAPI dependency that returns the singleton CeloService.

    Use as: `celo: CeloService = Depends(get_celo_service)` in route signatures.
    """
    return request.app.state.celo_service


def create_app() -> FastAPI:
    app = FastAPI(
        title="Etalo API",
        description="Non-custodial social commerce for African sellers",
        version="0.1.0",
        docs_url=None if settings.is_production else "/api/docs",
        redoc_url=None if settings.is_production else "/api/redoc",
        openapi_url=None if settings.is_production else "/api/openapi.json",
        lifespan=lifespan,
    )

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Routers
    app.include_router(health.router, prefix="/api/v1")
    app.include_router(auth.router, prefix="/api/v1")
    app.include_router(users.router, prefix="/api/v1")
    app.include_router(sellers.router, prefix="/api/v1")
    app.include_router(uploads.router, prefix="/api/v1")
    app.include_router(onboarding.router, prefix="/api/v1")
    app.include_router(products.router, prefix="/api/v1")
    app.include_router(orders.router, prefix="/api/v1")
    app.include_router(disputes.router, prefix="/api/v1")
    app.include_router(analytics.router, prefix="/api/v1")
    app.include_router(notifications.router, prefix="/api/v1")
    app.include_router(admin.router, prefix="/api/v1")

    return app


app = create_app()
