from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.api.v1 import auth, users, items
from app.dependencies import get_db
from app.core.cache import redis_client

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(items.router, prefix="/items", tags=["items"])


@api_router.get("/healthz", tags=["health"])
async def health_check(db: AsyncSession = Depends(get_db)):
    statuses = {"status": "ok"}

    try:
        await db.execute(text("SELECT 1"))
        statuses["db"] = "ok"
    except Exception:
        statuses["db"] = "error"

    try:
        r = await redis_client()
        await r.ping()
        statuses["redis"] = "ok"
    except Exception:
        statuses["redis"] = "error"

    return statuses
