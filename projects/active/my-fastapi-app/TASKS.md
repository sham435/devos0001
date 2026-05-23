# Tasks

## TODO
- [ ] Run `docker compose up -d db redis`
- [ ] Run `alembic upgrade head`
- [ ] Run `pytest -v --cov=app`
- [ ] Run `ruff check . && black --check .`

## IN PROGRESS
- [ ] Full project scaffolded

## COMPLETED
- [x] Config: pyproject.toml, .env.example, Docker, docker-compose, CI
- [x] Core: main.py, config.py, deps, exceptions, security, cache, logging
- [x] DB: session, base, User model, Item model
- [x] Schemas: auth, user, item with Pydantic v2 validators
- [x] Services: auth_service, user_service, item_service (3-layer arch)
- [x] API: auth router (register/login/refresh/logout), users CRUD, items CRUD
- [x] Tasks: Celery app, welcome email, password reset email
- [x] Infra: Dockerfile (multi-stage), entrypoint.sh, docker-compose.yml
- [x] CI: GitHub Actions (lint → typecheck → test → build)
- [x] Tests: conftest, factories, test_auth (13 cases), test_users, test_items
- [x] Alembic: async env.py, initial migration
- [x] Health endpoint: GET /api/v1/healthz
