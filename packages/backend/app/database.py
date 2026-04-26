"""Database configuration — sync (legacy routes) + async (Sprint J5
indexer + future async routes) sessions sharing the same metadata.
"""
from __future__ import annotations

from collections.abc import AsyncGenerator, Generator

from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings


def _normalized_db_url() -> str:
    """psycopg3 driver string used for both sync and async engines."""
    url = settings.database_url
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg://", 1)
    return url


# ============================================================
# Sync layer (legacy routes via Depends(get_db))
# ============================================================
_engine = None
_SessionLocal = None


def get_engine():
    global _engine
    if _engine is None:
        _engine = create_engine(
            _normalized_db_url(),
            pool_pre_ping=True,
            pool_size=10,
            max_overflow=20,
        )
    return _engine


def get_session_factory():
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(
            bind=get_engine(), autocommit=False, autoflush=False
        )
    return _SessionLocal


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session]:
    session_factory = get_session_factory()
    db = session_factory()
    try:
        yield db
    finally:
        db.close()


# ============================================================
# Async layer (Sprint J5 indexer + future async routes)
# ============================================================
_async_engine: AsyncEngine | None = None
_AsyncSessionLocal: async_sessionmaker[AsyncSession] | None = None


def get_async_engine() -> AsyncEngine:
    global _async_engine
    if _async_engine is None:
        _async_engine = create_async_engine(
            _normalized_db_url(),
            pool_pre_ping=True,
            pool_size=10,
            max_overflow=20,
            # psycopg3 caches prepared statements per connection by name
            # (`_pg3_N`). Across SQLAlchemy sessions reusing the same
            # connection from the pool, collisions surface as
            # DuplicatePreparedStatement. Setting prepare_threshold=None
            # disables prepared-statement caching entirely — SQLAlchemy's
            # own statement cache covers the same ground for our workload.
            # Required for J7 Block 6 (multiple INSERTs into
            # seller_credits_ledger across handler+test+request paths).
            connect_args={"prepare_threshold": None},
        )
    return _async_engine


def get_async_session_factory() -> async_sessionmaker[AsyncSession]:
    global _AsyncSessionLocal
    if _AsyncSessionLocal is None:
        _AsyncSessionLocal = async_sessionmaker(
            bind=get_async_engine(),
            class_=AsyncSession,
            expire_on_commit=False,
            autoflush=False,
        )
    return _AsyncSessionLocal


async def get_async_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI async dependency. Yields a transactional AsyncSession."""
    factory = get_async_session_factory()
    async with factory() as db:
        try:
            yield db
        finally:
            await db.close()
