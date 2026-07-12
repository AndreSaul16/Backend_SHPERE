"""
Cliente atómico para Notion API.
"""
import httpx
from app.core.logger import checkpoint_logger as logger

NOTION_API = "https://api.notion.com/v1"


async def create_page(access_token: str, parent_id: str, title: str, content: str = "") -> dict:
    """Crea una página en Notion."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{NOTION_API}/pages",
            json={
                "parent": {"page_id": parent_id},
                "properties": {
                    "title": {
                        "title": [{"text": {"content": title}}]
                    }
                },
                "children": [
                    {
                        "object": "block",
                        "type": "paragraph",
                        "paragraph": {
                            "rich_text": [{"type": "text", "text": {"content": content}}]
                        }
                    }
                ] if content else [],
            },
            headers={
                "Authorization": f"Bearer {access_token}",
                "Notion-Version": "2022-06-28",
                "Content-Type": "application/json",
            },
            timeout=15.0,
        )
        resp.raise_for_status()
        data = resp.json()
        return {"url": data.get("url", ""), "id": data["id"]}


async def search_first_page(access_token: str) -> str | None:
    """Busca la primera página accesible por la integración (para usar de padre).

    Notion no expone un "root" navegable vía API: hay que buscar entre las
    páginas que el usuario compartió con la integración. Devuelve el id de la
    primera, o None si la integración no tiene acceso a ninguna.
    """
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{NOTION_API}/search",
            json={"filter": {"value": "page", "property": "object"}, "page_size": 1},
            headers={
                "Authorization": f"Bearer {access_token}",
                "Notion-Version": "2022-06-28",
                "Content-Type": "application/json",
            },
            timeout=15.0,
        )
        resp.raise_for_status()
        results = resp.json().get("results", [])
        for item in results:
            if item.get("object") == "page" and item.get("id"):
                return item["id"]
        return None


async def update_page(access_token: str, page_id: str, content: str) -> dict:
    """Agrega contenido a una página existente."""
    async with httpx.AsyncClient() as client:
        resp = await client.patch(
            f"{NOTION_API}/blocks/{page_id}/children",
            json={
                "children": [
                    {
                        "object": "block",
                        "type": "paragraph",
                        "paragraph": {
                            "rich_text": [{"type": "text", "text": {"content": content}}]
                        }
                    }
                ]
            },
            headers={
                "Authorization": f"Bearer {access_token}",
                "Notion-Version": "2022-06-28",
                "Content-Type": "application/json",
            },
            timeout=15.0,
        )
        resp.raise_for_status()
        return {"status": "updated"}
