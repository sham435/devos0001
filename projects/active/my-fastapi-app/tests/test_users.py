from httpx import AsyncClient


class TestUsersMe:
    async def test_get(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/v1/users/me", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["email"] == "test@example.com"

    async def test_update(self, client: AsyncClient, auth_headers: dict):
        resp = await client.patch("/api/v1/users/me", headers=auth_headers, json={"username": "newuser"})
        assert resp.status_code == 200
        assert resp.json()["username"] == "newuser"

    async def test_delete(self, client: AsyncClient, auth_headers: dict):
        resp = await client.delete("/api/v1/users/me", headers=auth_headers)
        assert resp.status_code == 204


class TestUsersAdmin:
    async def test_list_superuser(self, client: AsyncClient, auth_headers: dict):
        from app.db.session import AsyncSessionLocal
        from app.services.user_service import get_user_by_id
        from app.dependencies import get_db

        async with AsyncSessionLocal() as db:
            result = await db.execute("SELECT id FROM users WHERE email='test@example.com'")
            user_row = await result.fetchone()
            if user_row:
                user = await get_user_by_id(db, str(user_row[0]))
                if user:
                    user.is_superuser = True
                    await db.commit()

        login_resp = await client.post("/api/v1/auth/login", json={
            "email": "test@example.com", "password": "strongpass123",
        })
        admin_headers = {"Authorization": f"Bearer {login_resp.json()['access_token']}"}
        resp = await client.get("/api/v1/users/", headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["total"] >= 1

    async def test_list_non_superuser_forbidden(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/v1/users/", headers=auth_headers)
        assert resp.status_code == 403
