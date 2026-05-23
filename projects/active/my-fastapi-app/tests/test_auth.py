from httpx import AsyncClient


class TestRegister:
    async def test_valid(self, client: AsyncClient, user_data: dict):
        resp = await client.post("/api/v1/auth/register", json=user_data)
        assert resp.status_code == 201
        data = resp.json()
        assert data["email"] == user_data["email"]
        assert data["username"] == user_data["username"]
        assert "password" not in data

    async def test_duplicate_email(self, client: AsyncClient, user_data: dict, registered_user: dict):
        resp = await client.post("/api/v1/auth/register", json=user_data)
        assert resp.status_code == 409

    async def test_weak_password(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/register", json={
            "email": "a@b.com", "username": "u", "password": "s",
        })
        assert resp.status_code == 422

    async def test_invalid_email(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/register", json={
            "email": "bad", "username": "valid", "password": "strongpass123",
        })
        assert resp.status_code == 422


class TestLogin:
    async def test_valid(self, client: AsyncClient, user_data: dict, registered_user: dict):
        resp = await client.post("/api/v1/auth/login", json={
            "email": user_data["email"], "password": user_data["password"],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data

    async def test_wrong_password(self, client: AsyncClient, registered_user: dict):
        resp = await client.post("/api/v1/auth/login", json={
            "email": "test@example.com", "password": "wrong",
        })
        assert resp.status_code == 401

    async def test_nonexistent_user(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/login", json={
            "email": "no@no.com", "password": "pass1234",
        })
        assert resp.status_code == 401


class TestRefresh:
    async def test_valid(self, client: AsyncClient, auth_tokens: dict):
        resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": auth_tokens["refresh"]})
        assert resp.status_code == 200
        assert resp.json()["access_token"] != auth_tokens["access"]

    async def test_invalid(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": "garbage"})
        assert resp.status_code == 401

    async def test_after_logout(self, client: AsyncClient, auth_tokens: dict):
        await client.post("/api/v1/auth/logout", json={"refresh_token": auth_tokens["refresh"]})
        resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": auth_tokens["refresh"]})
        assert resp.status_code == 401


class TestProtected:
    async def test_valid_token(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/v1/users/me", headers=auth_headers)
        assert resp.status_code == 200

    async def test_no_token(self, client: AsyncClient):
        resp = await client.get("/api/v1/users/me")
        assert resp.status_code == 403

    async def test_expired_token(self, client: AsyncClient):
        resp = await client.get("/api/v1/users/me", headers={"Authorization": "Bearer x.y.z"})
        assert resp.status_code == 401
