import asyncio
import sys
from contextlib import asynccontextmanager

# Windows: psycopg async needs SelectorEventLoop (the default ProactorEventLoop
# is incompatible). No-op on Linux/macOS where Selector is already the default.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import (
    admin,
    analytics,
    auth,
    cart,
    disputes,
    health,
    items,
    marketing,
    marketplace,
    notifications,
    onboarding,
    orders,
    products,
    sellers,
    sitemap,
    uploads,
    users,
)
import logging

# Configure app-level logging so indexer/celo INFO logs are visible.
# uvicorn's --log-level only affects uvicorn's own loggers.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)

from app.database import get_async_session_factory
from app.services.celo import CeloService
from app.services.indexer import Indexer


logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup — instantiate the V2 CeloService (no RPC call yet) and
    # launch the background indexer if enabled.
    app.state.celo_service = CeloService.from_settings()

    indexer_task: asyncio.Task | None = None
    if settings.indexer_enabled:
        indexer = Indexer(
            celo=app.state.celo_service,
            session_factory=get_async_session_factory(),
        )
        app.state.indexer = indexer
        indexer_task = asyncio.create_task(indexer.run(), name="v2-indexer")

        def _log_task_exception(task: asyncio.Task) -> None:
            if task.cancelled():
                return
            exc = task.exception()
            if exc is not None:
                logger.error("Indexer task crashed: %r", exc)

        indexer_task.add_done_callback(_log_task_exception)
    else:
        app.state.indexer = None

    yield

    # Shutdown
    if indexer_task is not None and app.state.indexer is not None:
        app.state.indexer.stop()
        try:
            await asyncio.wait_for(indexer_task, timeout=10)
        except asyncio.TimeoutError:
            logger.warning("Indexer did not stop within 10s; cancelling")
            indexer_task.cancel()


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
    app.include_router(items.router, prefix="/api/v1")
    app.include_router(analytics.router, prefix="/api/v1")
    app.include_router(notifications.router, prefix="/api/v1")
    app.include_router(admin.router, prefix="/api/v1")
    app.include_router(sitemap.router, prefix="/api/v1")
    app.include_router(cart.router, prefix="/api/v1")
    app.include_router(marketplace.router, prefix="/api/v1")
    app.include_router(marketing.router, prefix="/api/v1")

    return app


app = create_app()
