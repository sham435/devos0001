# FastAPI Starter — Architecture

## Overview
Production-ready REST API scaffold for multi-tenant SaaS backends. Async-first, PostgreSQL + Redis + Celery.

## Tech Stack
| Layer | Tech | Why |
| --- | --- | --- |
| Framework | FastAPI 0.115 | Async-native, auto OpenAPI docs, Pydantic v2 integration |
| ASGI | Uvicorn 0.30 | Workers=4, production-tested, graceful reload |
| ORM | SQLAlchemy 2.0.35 (async) | Mapped-column style, no sync/async confusion |
| DB | PostgreSQL 16 + asyncpg 0.29 | Connection pooling, prepared stmts, UUID native |
| Validation | Pydantic v2 + pydantic-settings | `field_validator` over legacy `@validator`, env config |
| Auth | python-jose + passlib[bcrypt] | JWT HS256, bcrypt 12 rounds, refresh rotation |
| Cache | Redis 7 (redis.asyncio) | Refresh token blacklist, query cache, session store |
| Queue | Celery 5.4 + Redis broker | Email tasks, background ingestion, retry logic |
| Testing | pytest + pytest-asyncio + httpx | Async test client, factory-boy fixtures |
| Linting | ruff + black + mypy | Strict typing, 100-char lines, modern rulesets |

## Data Flow
```
Client → HTTP → Uvicorn → FastAPI lifespan (DB pool + Redis)
                              ├── /api/v1/auth/* → JWT, bcrypt, Redis blacklist
                              ├── /api/v1/users/* → SQLAlchemy async, cache decorator
                              ├── /api/v1/items/* → Row-level ownership check
                              └── /api/v1/healthz → DB ping + Redis ping
                              ↓
                         Celery worker → SMTP email tasks
```

## Key Architecture Decisions

### 3-Layer Pattern
```
Router → validates HTTP, calls service → returns typed response
Service → business logic, no HTTP concerns
Repository → SQLAlchemy queries, no business logic
```

### Async Everything
- `async with AsyncSession` for all DB queries
- `await session.execute()` — no `.all()` on async queries, use `.scalars().all()`
- Redis `async with redis_client() as r` — no blocking calls
- Lifespan context manager replaces deprecated `@app.on_event`

### Security Model
| Token | Type | Expiry | Storage | Rotation |
| --- | --- | --- | --- | --- |
| Access | JWT HS256 | 15min | Stateless (in request) | Not rotated |
| Refresh | JWT HS256 | 7 days | Redis SET with TTL | Rotated on use, old blacklisted |

## Scaling Plan
| Load | Bottleneck | Mitigation |
| --- | --- | --- |
| 1k req/s | DB connection pool | Increase pool_size=50, add PgBouncer |
| 10k req/s | Auth token decode | Add Redis cache for public keys, JWT cache layer |
| 100k req/s | Python GIL | Horizontal scale behind nginx + multiple uvicorn workers |

## Related
- `DECISIONS.md` — Detailed tradeoff log
- `architectures/` — Reusable patterns in DevOS vault
- `snippets/django/stripe_webhook.py` — Async SQLAlchemy pattern reference
