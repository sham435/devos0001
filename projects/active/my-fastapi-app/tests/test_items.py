from httpx import AsyncClient


class TestItems:
    async def test_create(self, client: AsyncClient, auth_headers: dict):
        resp = await client.post("/api/v1/items/", headers=auth_headers,
                                  json={"title": "My Item", "description": "desc", "is_public": False})
        assert resp.status_code == 201
        assert resp.json()["title"] == "My Item"

    async def test_list(self, client: AsyncClient, auth_headers: dict):
        await client.post("/api/v1/items/", headers=auth_headers, json={"title": "A"})
        await client.post("/api/v1/items/", headers=auth_headers, json={"title": "B"})
        resp = await client.get("/api/v1/items/", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["total"] >= 2

    async def test_get_by_id(self, client: AsyncClient, auth_headers: dict):
        created = (await client.post("/api/v1/items/", headers=auth_headers, json={"title": "X"})).json()
        resp = await client.get(f"/api/v1/items/{created['id']}", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["title"] == "X"

    async def test_not_found(self, client: AsyncClient, auth_headers: dict):
        resp = await client.get("/api/v1/items/00000000-0000-0000-0000-000000000000", headers=auth_headers)
        assert resp.status_code == 404

    async def test_update_own(self, client: AsyncClient, auth_headers: dict):
        created = (await client.post("/api/v1/items/", headers=auth_headers, json={"title": "Old"})).json()
        resp = await client.patch(f"/api/v1/items/{created['id']}", headers=auth_headers,
                                   json={"title": "New"})
        assert resp.status_code == 200
        assert resp.json()["title"] == "New"

    async def test_non_owner_cannot_update(self, client: AsyncClient, auth_headers: dict):
        created = (await client.post("/api/v1/items/", headers=auth_headers, json={"title": "Mine"})).json()

        reg = await client.post("/api/v1/auth/register", json={
            "email": "other@x.com", "username": "otherx", "password": "strongpass123",
        })
        login = await client.post("/api/v1/auth/login", json={"email": "other@x.com", "password": "strongpass123"})
        other_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

        resp = await client.patch(f"/api/v1/items/{created['id']}", headers=other_headers, json={"title": "Hacked"})
        assert resp.status_code == 403

    async def test_delete_own(self, client: AsyncClient, auth_headers: dict):
        created = (await client.post("/api/v1/items/", headers=auth_headers, json={"title": "Del"})).json()
        resp = await client.delete(f"/api/v1/items/{created['id']}", headers=auth_headers)
        assert resp.status_code == 204

    async def test_public_item_visible(self, client: AsyncClient, auth_headers: dict):
        created = (await client.post("/api/v1/items/", headers=auth_headers,
                                      json={"title": "Pub", "is_public": True})).json()

        reg = await client.post("/api/v1/auth/register", json={
            "email": "view@x.com", "username": "viewer", "password": "strongpass123",
        })
        login = await client.post("/api/v1/auth/login", json={"email": "view@x.com", "password": "strongpass123"})
        viewer_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

        resp = await client.get(f"/api/v1/items/{created['id']}", headers=viewer_headers)
        assert resp.status_code == 200
