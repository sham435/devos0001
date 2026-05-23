from datetime import timedelta
from redis.asyncio import Redis
from app.config import settings

_redis: Redis | None = None


async def redis_client() -> Redis:
    global _redis
    if _redis is None:
        _redis = Redis.from_url(settings.redis_url, decode_responses=True)
    return _redis


async def blacklist_refresh_token(token_jti: str, ttl: int = 604800) -> None:
    r = await redis_client()
    await r.setex(f"blacklist:{token_jti}", ttl, "1")


async def is_token_blacklisted(token_jti: str) -> bool:
    r = await redis_client()
    return await r.exists(f"blacklist:{token_jti}") == 1
