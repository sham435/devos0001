import json
import hashlib
from functools import wraps
from typing import Optional, Callable, Any
from redis.asyncio import Redis
from app.config import settings

_redis: Optional[Redis] = None


async def redis_client() -> Redis:
    global _redis
    if _redis is None:
        _redis = Redis.from_url(settings.redis_url, decode_responses=True)
    return _redis


async def get_redis() -> Redis:
    return await redis_client()


async def cache_get(key: str) -> Optional[str]:
    r = await redis_client()
    return await r.get(key)


async def cache_set(key: str, value: str, ttl: int = 300) -> None:
    r = await redis_client()
    await r.setex(key, ttl, value)


async def cache_delete(key: str) -> None:
    r = await redis_client()
    await r.delete(key)


async def cache_delete_pattern(pattern: str) -> None:
    r = await redis_client()
    async for key in r.scan_iter(match=pattern):
        await r.delete(key)


async def blacklist_refresh_token(token_jti: str, ttl: int) -> None:
    r = await redis_client()
    await r.setex(f"blacklist:{token_jti}", ttl, "1")


async def is_token_blacklisted(token_jti: str) -> bool:
    r = await redis_client()
    return await r.exists(f"blacklist:{token_jti}") == 1


def cached(ttl: int = 300, key_prefix: str = "cache"):
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, **kwargs) -> Any:
            cache_key_parts = [key_prefix, func.__name__]
            for arg in args:
                cache_key_parts.append(str(arg))
            for k, v in kwargs.items():
                cache_key_parts.append(f"{k}={v}")
            raw_key = ":".join(cache_key_parts)
            cache_key = hashlib.md5(raw_key.encode()).hexdigest()
            cached_value = await cache_get(cache_key)
            if cached_value is not None:
                return json.loads(cached_value)
            result = await func(*args, **kwargs)
            await cache_set(cache_key, json.dumps(result, default=str), ttl=ttl)
            return result
        return wrapper
    return decorator
