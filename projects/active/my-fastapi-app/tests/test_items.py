import pytest
from httpx import AsyncClient


class TestItems:
    async def test_create_item(self, client: AsyncClient, auth_headers: dict):
        response = await client.post(
            "/api/v1/items/",
            headers=auth_headers,
            json={"title": "My Item", "description": "A test item", "is_public": False},
        )
        assert response.status_code == 201
        data = response.json()
        assert data["title"] == "My Item"
        assert data["is_public"] is False
        assert "id" in data
        assert "owner_id" in data

    async def test_list_items(self, client: AsyncClient, auth_headers: dict):
        await client.post("/api/v1/items/", headers=auth_headers, json={"title": "Item 1"})
        await client.post("/api/v1/items/", headers=auth_headers, json={"title": "Item 2"})

        response = await client.get("/api/v1/items/", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 2
        assert len(data["items"]) >= 2

    async def test_get_item_by_id(self, client: AsyncClient, auth_headers: dict):
        create_resp = await client.post(
            "/api/v1/items/", headers=auth_headers, json={"title": "Specific Item"}
        )
        item_id = create_resp.json()["id"]

        response = await client.get(f"/api/v1/items/{item_id}", headers=auth_headers)
        assert response.status_code == 200
        assert response.json()["title"] == "Specific Item"

    async def test_get_item_not_found(self, client: AsyncClient, auth_headers: dict):
        response = await client.get(
            "/api/v1/items/00000000-0000-0000-0000-000000000000",
            headers=auth_headers,
        )
        assert response.status_code == 404

    async def test_update_own_item(self, client: AsyncClient, auth_headers: dict):
        create_resp = await client.post(
            "/api/v1/items/", headers=auth_headers, json={"title": "Original Title"}
        )
        item_id = create_resp.json()["id"]

        response = await client.patch(
            f"/api/v1/items/{item_id}",
            headers=auth_headers,
            json={"title": "Updated Title"},
        )
        assert response.status_code == 200
        assert response.json()["title"] == "Updated Title"

    async def test_non_owner_cannot_update(self, client: AsyncClient, auth_headers: dict):
        create_resp = await client.post(
            "/api/v1/items/", headers=auth_headers, json={"title": "My Item"}
        )
        item_id = create_resp.json()["id"]

        other_data = {
            "email": "other2@example.com",
            "username": "otheruser2",
            "password": "strongpass123",
        }
        reg_resp = await client.post("/api/v1/auth/register", json=other_data)
        login_resp = await client.post("/api/v1/auth/login", json={
            "email": other_data["email"],
            "password": other_data["password"],
        })
        other_token = login_resp.json()["access_token"]
        other_headers = {"Authorization": f"Bearer {other_token}"}

        response = await client.patch(
            f"/api/v1/items/{item_id}",
            headers=other_headers,
            json={"title": "Hacked Title"},
        )
        assert response.status_code == 403

    async def test_delete_own_item(self, client: AsyncClient, auth_headers: dict):
        create_resp = await client.post(
            "/api/v1/items/", headers=auth_headers, json={"title": "To Delete"}
        )
        item_id = create_resp.json()["id"]

        response = await client.delete(f"/api/v1/items/{item_id}", headers=auth_headers)
        assert response.status_code == 204

    async def test_non_owner_cannot_delete(self, client: AsyncClient, auth_headers: dict):
        create_resp = await client.post(
            "/api/v1/items/", headers=auth_headers, json={"title": "Mine"}
        )
        item_id = create_resp.json()["id"]

        other_data = {
            "email": "other3@example.com",
            "username": "otheruser3",
            "password": "strongpass123",
        }
        await client.post("/api/v1/auth/register", json=other_data)
        login_resp = await client.post("/api/v1/auth/login", json={
            "email": other_data["email"],
            "password": other_data["password"],
        })
        other_headers = {"Authorization": f"Bearer {login_resp.json()['access_token']}"}

        response = await client.delete(f"/api/v1/items/{item_id}", headers=other_headers)
        assert response.status_code == 403

    async def test_public_item_visible_to_others(self, client: AsyncClient, auth_headers: dict):
        create_resp = await client.post(
            "/api/v1/items/",
            headers=auth_headers,
            json={"title": "Public Item", "is_public": True},
        )
        item_id = create_resp.json()["id"]

        other_data = {
            "email": "viewer@example.com",
            "username": "viewer",
            "password": "strongpass123",
        }
        await client.post("/api/v1/auth/register", json=other_data)
        login_resp = await client.post("/api/v1/auth/login", json={
            "email": other_data["email"],
            "password": other_data["password"],
        })
        viewer_headers = {"Authorization": f"Bearer {login_resp.json()['access_token']}"}

        response = await client.get(f"/api/v1/items/{item_id}", headers=viewer_headers)
        assert response.status_code == 200
        assert response.json()["title"] == "Public Item"
