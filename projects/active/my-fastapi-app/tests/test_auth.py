import pytest
from httpx import AsyncClient


class TestAuthRegister:
    async def test_register_valid(self, client: AsyncClient, user_data: dict):
        response = await client.post("/api/v1/auth/register", json=user_data)
        assert response.status_code == 201
        data = response.json()
        assert data["email"] == user_data["email"]
        assert data["username"] == user_data["username"]
        assert "password" not in data
        assert data["is_active"] is True

    async def test_register_duplicate_email(self, client: AsyncClient, user_data: dict, registered_user: dict):
        response = await client.post("/api/v1/auth/register", json=user_data)
        assert response.status_code == 409
        assert "already registered" in response.json()["detail"].lower()

    async def test_register_weak_password(self, client: AsyncClient):
        response = await client.post("/api/v1/auth/register", json={
            "email": "weak@example.com",
            "username": "weakuser",
            "password": "short",
        })
        assert response.status_code == 422

    async def test_register_invalid_email(self, client: AsyncClient):
        response = await client.post("/api/v1/auth/register", json={
            "email": "not-an-email",
            "username": "validuser",
            "password": "strongpass123",
        })
        assert response.status_code == 422


class TestAuthLogin:
    async def test_login_valid(self, client: AsyncClient, user_data: dict, registered_user: dict):
        response = await client.post("/api/v1/auth/login", json={
            "email": user_data["email"],
            "password": user_data["password"],
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"

    async def test_login_wrong_password(self, client: AsyncClient, user_data: dict, registered_user: dict):
        response = await client.post("/api/v1/auth/login", json={
            "email": user_data["email"],
            "password": "wrongpassword",
        })
        assert response.status_code == 401

    async def test_login_nonexistent_user(self, client: AsyncClient):
        response = await client.post("/api/v1/auth/login", json={
            "email": "nobody@example.com",
            "password": "somepass123",
        })
        assert response.status_code == 401


class TestAuthRefresh:
    async def test_refresh_valid(self, client: AsyncClient, user_data: dict, auth_tokens: dict):
        response = await client.post("/api/v1/auth/refresh", json={
            "refresh_token": auth_tokens["refresh"],
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["access_token"] != auth_tokens["access"]

    async def test_refresh_invalid_token(self, client: AsyncClient):
        response = await client.post("/api/v1/auth/refresh", json={
            "refresh_token": "invalid-token-here",
        })
        assert response.status_code == 401

    async def test_logout_then_refresh_fails(self, client: AsyncClient, user_data: dict, auth_tokens: dict):
        logout_resp = await client.post("/api/v1/auth/logout", json={
            "refresh_token": auth_tokens["refresh"],
        })
        assert logout_resp.status_code == 200

        refresh_resp = await client.post("/api/v1/auth/refresh", json={
            "refresh_token": auth_tokens["refresh"],
        })
        assert refresh_resp.status_code == 401


class TestAuthProtected:
    async def test_access_with_valid_token(self, client: AsyncClient, auth_headers: dict):
        response = await client.get("/api/v1/users/me", headers=auth_headers)
        assert response.status_code == 200
        assert response.json()["email"] == "test@example.com"

    async def test_access_without_token(self, client: AsyncClient):
        response = await client.get("/api/v1/users/me")
        assert response.status_code == 403

    async def test_access_with_expired_token(self, client: AsyncClient):
        headers = {"Authorization": "Bearer expired.token.here"}
        response = await client.get("/api/v1/users/me", headers=headers)
        assert response.status_code == 401
