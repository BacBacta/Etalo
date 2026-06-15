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
    addresses,
    admin,
    analytics,
    cart,
    disputes,
    health,
    items,
    marketing,
    marketplace,
    mediators,
    notifications,
    onboarding,
    orders,
    products,
    sellers,
    short_links,
    sitemap,
    stats,
    treasury,
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
from app.services.auto_refund_keeper import build_keeper
from app.services.auto_release_keeper import build_release_keeper
from app.services.celo import CeloService
from app.services.indexer import Indexer
from app.services.relayer import RelayerTxSender
from app.services.whatsapp import WhatsAppNotifier


logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup — instantiate the V2 CeloService (no RPC call yet) and
    # launch the background indexer if enabled.
    app.state.celo_service = CeloService.from_settings()
    # Seed one persistent aiohttp session so web3 reuses it for every RPC
    # call instead of creating + leaking one per request (the recurring
    # "Unclosed client session" errors on every indexer poll cycle).
    await app.state.celo_service.init_async_session()

    # WhatsApp seller pings (new-order notifications). Self-disabling
    # when the Twilio creds aren't set — the indexer runs identically
    # until the secrets are configured. Best-effort, fire-and-forget.
    whatsapp_notifier = WhatsAppNotifier.from_settings()
    app.state.whatsapp_notifier = whatsapp_notifier
    if whatsapp_notifier.enabled:
        logger.info("WhatsApp notifier enabled (Twilio configured)")
    else:
        logger.info("WhatsApp notifier disabled (no Twilio creds)")

    indexer_task: asyncio.Task | None = None
    if settings.indexer_enabled:
        indexer = Indexer(
            celo=app.state.celo_service,
            session_factory=get_async_session_factory(),
            notifier=whatsapp_notifier,
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

    # One shared relayer tx-sender for BOTH keepers (#134) — owns the
    # lock + in-process nonce tracking so the auto-refund and auto-release
    # keepers, signing from the same key, never collide on a nonce. None
    # when no relayer key is configured (keepers then stay disabled).
    #
    # A MALFORMED key must NOT take down the whole API: derive the account
    # in a try/except and, on failure, log + disable the keepers (sender
    # = None) instead of crashing startup. The keepers are a non-critical
    # background convenience (their triggers are permissionless on-chain),
    # so the API must stay up even with a bad RELAYER_PRIVATE_KEY.
    relayer_sender = None
    if settings.relayer_private_key:
        try:
            relayer_sender = RelayerTxSender(
                app.state.celo_service._w3, settings.relayer_private_key
            )
        except Exception as exc:  # noqa: BLE001
            logger.error(
                "Invalid RELAYER_PRIVATE_KEY (%r) — keepers DISABLED, API "
                "continues. Fix the secret to re-enable auto-release/refund.",
                exc,
            )

    # ADR-019 auto-refund keeper. Returns None when disabled (no
    # relayer key set or `auto_refund_keeper_enabled = false`) ; the
    # contract function is permissionless so buyers can still self-claim
    # via the /orders/[id] UI.
    keeper = build_keeper(
        celo=app.state.celo_service,
        session_factory=get_async_session_factory(),
        sender=relayer_sender,
    )
    keeper_task: asyncio.Task | None = None
    if keeper is not None:
        app.state.auto_refund_keeper = keeper
        keeper_task = asyncio.create_task(
            keeper.run(), name="auto-refund-keeper"
        )

        def _log_keeper_exception(task: asyncio.Task) -> None:
            if task.cancelled():
                return
            exc = task.exception()
            if exc is not None:
                logger.error("Auto-refund keeper crashed: %r", exc)

        keeper_task.add_done_callback(_log_keeper_exception)
    else:
        app.state.auto_refund_keeper = None

    # Auto-release keeper — symmetric counterpart that auto-pays the
    # seller once a shipped item crosses its finalReleaseAfter. Same
    # relayer key + None-when-disabled semantics as the refund keeper.
    release_keeper = build_release_keeper(
        celo=app.state.celo_service,
        session_factory=get_async_session_factory(),
        sender=relayer_sender,
    )
    release_keeper_task: asyncio.Task | None = None
    if release_keeper is not None:
        app.state.auto_release_keeper = release_keeper
        release_keeper_task = asyncio.create_task(
            release_keeper.run(), name="auto-release-keeper"
        )

        def _log_release_keeper_exception(task: asyncio.Task) -> None:
            if task.cancelled():
                return
            exc = task.exception()
            if exc is not None:
                logger.error("Auto-release keeper crashed: %r", exc)

        release_keeper_task.add_done_callback(_log_release_keeper_exception)
    else:
        app.state.auto_release_keeper = None

    yield

    # Shutdown
    if indexer_task is not None and app.state.indexer is not None:
        app.state.indexer.stop()
        try:
            await asyncio.wait_for(indexer_task, timeout=10)
        except asyncio.TimeoutError:
            logger.warning("Indexer did not stop within 10s; cancelling")
            indexer_task.cancel()
    if keeper_task is not None and app.state.auto_refund_keeper is not None:
        app.state.auto_refund_keeper.stop()
        try:
            await asyncio.wait_for(keeper_task, timeout=10)
        except asyncio.TimeoutError:
            logger.warning("Auto-refund keeper did not stop within 10s; cancelling")
            keeper_task.cancel()
    if (
        release_keeper_task is not None
        and app.state.auto_release_keeper is not None
    ):
        app.state.auto_release_keeper.stop()
        try:
            await asyncio.wait_for(release_keeper_task, timeout=10)
        except asyncio.TimeoutError:
            logger.warning(
                "Auto-release keeper did not stop within 10s; cancelling"
            )
            release_keeper_task.cancel()

    # Close the persistent web3 aiohttp session opened at startup.
    await app.state.celo_service.close_async_session()


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

    # CORS — allow explicit origins + a regex for Vercel preview /
    # deployment-specific URLs (`etalo-<hash>-bactas-projects.vercel.app`).
    # Without the regex, only the production alias `etalo.vercel.app` is
    # accepted and every preview deploy is blocked by the browser.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_origin_regex=settings.cors_origin_regex or None,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Routers
    app.include_router(health.router, prefix="/api/v1")
    app.include_router(users.router, prefix="/api/v1")
    app.include_router(sellers.router, prefix="/api/v1")
    app.include_router(uploads.router, prefix="/api/v1")
    app.include_router(onboarding.router, prefix="/api/v1")
    app.include_router(products.router, prefix="/api/v1")
    app.include_router(orders.router, prefix="/api/v1")
    app.include_router(disputes.router, prefix="/api/v1")
    app.include_router(mediators.router, prefix="/api/v1")
    app.include_router(items.router, prefix="/api/v1")
    app.include_router(analytics.router, prefix="/api/v1")
    app.include_router(notifications.router, prefix="/api/v1")
    app.include_router(admin.router, prefix="/api/v1")
    app.include_router(sitemap.router, prefix="/api/v1")
    app.include_router(stats.router, prefix="/api/v1")
    app.include_router(treasury.router, prefix="/api/v1")
    app.include_router(cart.router, prefix="/api/v1")
    app.include_router(marketplace.router, prefix="/api/v1")
    app.include_router(marketing.router, prefix="/api/v1")
    app.include_router(addresses.router, prefix="/api/v1")
    # Mounted at root (no /api/v1 prefix) — short URLs are
    # `etalo.app/r/{code}` for branding. Next.js rewrites /r/* to here.
    app.include_router(short_links.router)

    return app


app = create_app()
