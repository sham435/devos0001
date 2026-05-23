# Engineering Decisions

## Why FastAPI over Django REST Framework?
FastAPI's async-native design, auto-generated OpenAPI docs, and first-class Pydantic v2 integration make it the right choice for a new project. DRF is mature but carries Django ORM baggage. For a pure API, FastAPI + SQLAlchemy async is lighter and faster.

## Why UUID primary keys over auto-increment integers?
UUIDs enable:
- Client-side ID generation (no DB round-trip for ID)
- Safe ID exposure in URLs (no sequential guessing)
- Distributed sharding without collision risk
- `gen_random_uuid()` is Postgres-native, no Python overhead

## Why Redis DB 1 for Celery broker?
Redis DB 0 is the app cache (queries, token blacklist). DB 1 is the Celery broker. Separate DB indices prevent:
- Cache eviction from Celery result flood
- Celery visibility timeout conflicting with cache TTLs
- Easy monitoring: `redis-cli -n 0 info keyspace` vs `redis-cli -n 1 info keyspace`

## Why bcrypt 12 rounds?
OWASP recommends 12 rounds for 2024+ hardware. Benchmark on M1: ~250ms per hash. Acceptable for auth endpoints. 15 rounds would push to 500ms+ which DoS's the login endpoint.

## Why refresh token rotation?
Each refresh invalidates the old token and issues a new pair. Prevents:
- Leaked refresh token replay (old token is blacklisted)
- Long-lived token exposure (max 7 days, single use)
- Race condition: if two refresh requests arrive simultaneously, only one wins

## Why JSON logging via structlog?
- Structured logs parse into Datadog/Splunk without custom parsers
- `time=2026-05-23T12:00:00Z level=info` vs freeform text
- Request IDs can be injected into log context per-request

## Why 3-layer (router → service) not controller pattern?
- Router: HTTP concerns only (status codes, response models, Depends())
- Service: business logic only (no request/response objects, pure functions)
- Testability: services test without HTTP, routers test with async client
