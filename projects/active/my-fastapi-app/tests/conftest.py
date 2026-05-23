import pytest
import asyncio
from typing import AsyncGenerator
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import NullPool

from app.main import create_app
from app.db.base import Base
from app.db.session import AsyncSessionLocal
from app.dependencies import get_db
from app.config import settings
from app.core.cache import redis_client

TEST_DATABASE_URL = settings.database_url + "_test"

test_engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
TestSessionLocal = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(autouse=True)
async def setup_database():
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
    async with TestSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


@pytest.fixture
async def app():
    application = create_app()
    application.dependency_overrides[get_db] = override_get_db
    return application


@pytest.fixture
async def client(app) -> AsyncGenerator[AsyncClient, None]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    async with TestSessionLocal() as session:
        yield session


@pytest.fixture
async def user_data():
    return {
        "email": "test@example.com",
        "username": "testuser",
        "password": "strongpass123",
    }


@pytest.fixture
async def registered_user(client: AsyncClient, user_data: dict):
    response = await client.post("/api/v1/auth/register", json=user_data)
    assert response.status_code == 201
    return response.json()


@pytest.fixture
async def auth_tokens(client: AsyncClient, user_data: dict):
    response = await client.post("/api/v1/auth/login", json={
        "email": user_data["email"],
        "password": user_data["password"],
    })
    assert response.status_code == 200
    data = response.json()
    return {"access": data["access_token"], "refresh": data["refresh_token"]}


@pytest.fixture
async def auth_headers(auth_tokens: dict):
    return {"Authorization": f"Bearer {auth_tokens['access']}"}
