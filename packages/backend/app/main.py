from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import admin, analytics, auth, disputes, health, orders, products, sellers, users


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    yield
    # Shutdown


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
    app.include_router(products.router, prefix="/api/v1")
    app.include_router(orders.router, prefix="/api/v1")
    app.include_router(disputes.router, prefix="/api/v1")
    app.include_router(analytics.router, prefix="/api/v1")
    app.include_router(admin.router, prefix="/api/v1")

    return app


app = create_app()
