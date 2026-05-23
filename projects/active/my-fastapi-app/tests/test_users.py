import pytest
from httpx import AsyncClient


class TestUsersMe:
    async def test_get_me(self, client: AsyncClient, auth_headers: dict):
        response = await client.get("/api/v1/users/me", headers=auth_headers)
        assert response.status_code == 200
        assert response.json()["email"] == "test@example.com"
        assert response.json()["username"] == "testuser"

    async def test_update_me(self, client: AsyncClient, auth_headers: dict):
        response = await client.patch(
            "/api/v1/users/me",
            headers=auth_headers,
            json={"username": "updateduser"},
        )
        assert response.status_code == 200
        assert response.json()["username"] == "updateduser"

    async def test_update_me_duplicate_email(self, client: AsyncClient, user_data: dict, auth_headers: dict,
                                              registered_user: dict):
        other_user_data = {
            "email": "other@example.com",
            "username": "otheruser",
            "password": "strongpass123",
        }
        await client.post("/api/v1/auth/register", json=other_user_data)

        response = await client.patch(
            "/api/v1/users/me",
            headers=auth_headers,
            json={"email": "other@example.com"},
        )
        assert response.status_code == 409

    async def test_delete_me(self, client: AsyncClient, auth_headers: dict):
        response = await client.delete("/api/v1/users/me", headers=auth_headers)
        assert response.status_code == 204


class TestUsersAdmin:
    async def test_list_users_superuser(self, client: AsyncClient):
        admin_data = {
            "email": "admin@example.com",
            "username": "adminuser",
            "password": "strongpass123",
        }
        reg_resp = await client.post("/api/v1/auth/register", json=admin_data)
        assert reg_resp.status_code == 201
        user_id = reg_resp.json()["id"]

        from app.dependencies import get_db, get_current_user
        from app.services.user_service import get_user_by_id
        from app.db.session import AsyncSessionLocal

        async with AsyncSessionLocal() as db:
            user = await get_user_by_id(db, user_id)
            user.is_superuser = True
            db.add(user)
            await db.commit()

        login_resp = await client.post("/api/v1/auth/login", json={
            "email": admin_data["email"],
            "password": admin_data["password"],
        })
        token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        response = await client.get("/api/v1/users/", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert data["total"] >= 1

    async def test_list_users_non_superuser_forbidden(self, client: AsyncClient, auth_headers: dict):
        response = await client.get("/api/v1/users/", headers=auth_headers)
        assert response.status_code == 403
