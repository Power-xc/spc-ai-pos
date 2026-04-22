"""Async SQLAlchemy engine and session management."""

from __future__ import annotations

from collections.abc import AsyncGenerator
import logging
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import get_settings
from app.services.local_data import LocalDataStore

logger = logging.getLogger(__name__)

_engine: AsyncEngine | None = None
_session_factory: Any = None
_data_store: LocalDataStore | None = None


class FileSession:
    """Minimal async context wrapper for file-backed POC data."""

    def __init__(self, data_store: LocalDataStore) -> None:
        self.data_store = data_store

    async def __aenter__(self) -> "FileSession":
        return self

    async def __aexit__(self, exc_type, exc, tb) -> bool:
        return False


class FileSessionFactory:
    """Callable session factory that mimics async_sessionmaker."""

    def __init__(self, data_store: LocalDataStore | None = None, data_dir: str | None = None) -> None:
        self.data_store = data_store
        self.data_dir = data_dir

    def _ensure_data_store(self) -> LocalDataStore:
        if self.data_store is None:
            settings = get_settings()
            self.data_store = LocalDataStore(self.data_dir or settings.data_dir)
        return self.data_store

    def __call__(self) -> FileSession:
        return FileSession(self._ensure_data_store())


def build_file_session_factory(data_dir: str | None = None) -> FileSessionFactory:
    """Return a dedicated file-backed session factory.

    In PostgreSQL mode the existing analytics agents still read from the
    local POC dataset. This keeps read-side behavior stable while write-side
    persistence moves to PostgreSQL.
    """

    return FileSessionFactory(data_dir=data_dir)


def is_file_mode() -> bool:
    """Return whether the runtime uses the local file dataset."""

    return get_settings().data_mode.lower() == "file"


def is_postgres_mode() -> bool:
    """Return whether the runtime uses PostgreSQL-backed persistence."""

    return get_settings().data_mode.lower() in {"postgres", "database", "db"}


def init_engine() -> AsyncEngine | None:
    """Initialize the shared async engine and session factory."""

    global _engine, _session_factory, _data_store

    if _engine is not None and _session_factory is not None:
        return _engine

    settings = get_settings()
    if is_file_mode():
        if _data_store is None:
            _data_store = LocalDataStore(settings.data_dir)
        _session_factory = FileSessionFactory(_data_store)
        return None

    connect_args: dict[str, object] = {}
    if settings.database_schema:
        connect_args["server_settings"] = {"search_path": settings.database_schema}

    _engine = create_async_engine(
        settings.database_url,
        echo=False,
        pool_pre_ping=True,
        connect_args=connect_args,
    )
    _session_factory = async_sessionmaker(
        bind=_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    return _engine


def get_engine() -> AsyncEngine | None:
    """Return the shared engine, initializing it on first use."""

    if _engine is None:
        init_engine()
    return _engine


def get_session_factory() -> Any:
    """Return the shared async sessionmaker or file-session factory."""

    if _session_factory is None:
        init_engine()
    assert _session_factory is not None
    return _session_factory


async def close_engine() -> None:
    """Dispose the shared async engine."""

    global _engine, _session_factory, _data_store

    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _session_factory = None
    _data_store = None


async def get_db() -> AsyncGenerator[Any, None]:
    """FastAPI dependency that yields an async database session."""

    session_factory = get_session_factory()
    async with session_factory() as session:
        yield session


async def get_db_session() -> AsyncGenerator[Any, None]:
    """Alias used by repository/service wiring in PostgreSQL mode."""

    async for session in get_db():
        yield session


async def check_database_connectivity() -> bool:
    """Run a lightweight `SELECT 1` probe in PostgreSQL mode."""

    if not is_postgres_mode():
        return True

    engine = get_engine()
    if engine is None:
        return False

    try:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
        logger.info("PostgreSQL connectivity check succeeded")
        return True
    except Exception:
        logger.exception("PostgreSQL connectivity check failed")
        return False
