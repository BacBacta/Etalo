import re

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session
from web3 import AsyncWeb3, AsyncHTTPProvider

from app.config import settings
from app.database import get_db

router = APIRouter(tags=["health"])


def _redact_rpc(url: str) -> str:
    """Strip API key from /v2/<KEY> path fragment for safe logging."""
    return re.sub(r"/v2/[^/?]+", "/v2/<redacted>", url)


@router.get("/health")
async def health():
    """Liveness + Celo Sepolia RPC connectivity check.

    Returns latest_block from the configured Celo RPC to prove the
    backend can reach the chain. If the RPC fails, status flips to
    `degraded` and the error is included.
    """
    rpc_url = settings.celo_sepolia_rpc
    try:
        w3 = AsyncWeb3(AsyncHTTPProvider(rpc_url))
        latest_block = await w3.eth.block_number
        return {
            "status": "ok",
            "environment": settings.environment,
            "rpc": _redact_rpc(rpc_url),
            "latest_block": latest_block,
        }
    except Exception as e:
        return {
            "status": "degraded",
            "environment": settings.environment,
            "rpc": _redact_rpc(rpc_url),
            "error": str(e),
        }


@router.get("/health/db")
def health_db(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected"}
    except Exception as e:
        return {"status": "error", "database": str(e)}


@router.get("/health/redis")
async def health_redis():
    try:
        import redis as redis_lib

        r = redis_lib.from_url(settings.redis_url)
        r.ping()
        return {"status": "ok", "redis": "connected"}
    except Exception as e:
        return {"status": "error", "redis": str(e)}
