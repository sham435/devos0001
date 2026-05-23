from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.config import settings
from app.api.router import api_router
from app.exceptions import register_exception_handlers
from app.core.logging import setup_logging
from app.db.session import engine, AsyncSessionLocal
from app.core.cache import redis_client


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    app.state.redis = await redis_client()
    async with engine.begin() as conn:
        from app.db.base import Base
        await conn.run_sync(Base.metadata.create_all)
    yield
    await app.state.redis.close()
    await engine.dispose()


def create_app() -> FastAPI:
    app = FastAPI(
        title="FastAPI Starter API",
        description="Production-ready FastAPI REST API",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.state.limiter = None
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_middleware(SlowAPIMiddleware)

    register_exception_handlers(app)
    app.include_router(api_router)

    return app


app = create_app()
