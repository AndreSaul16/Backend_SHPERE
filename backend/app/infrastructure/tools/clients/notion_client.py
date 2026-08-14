"""
Cliente atómico para Notion API.
"""
import httpx

NOTION_API = "https://api.notion.com/v1"

# Notion rechaza cualquier text.content > 2000 caracteres (validation_error).
_NOTION_TEXT_LIMIT = 2000


def _content_to_blocks(content: str) -> list[dict]:
    """Trocea el markdown del acta en bloques Notion de <=2000 chars.

    Una acta real (resumen + tabla de votación + próximos pasos) supera siempre
    los 2000 chars, así que meter todo en un solo bloque hacía fallar la
    exportación con 400. Partimos por líneas y, si una línea excede el límite,
    la cortamos en trozos; cada trozo es un bloque paragraph.
    """
    if not content:
        return []
    chunks: list[str] = []
    buffer = ""
    for line in content.split("\n"):
        # Una línea sola más larga que el límite: partirla en trozos duros.
        while len(line) > _NOTION_TEXT_LIMIT:
            if buffer:
                chunks.append(buffer)
                buffer = ""
            chunks.append(line[:_NOTION_TEXT_LIMIT])
            line = line[_NOTION_TEXT_LIMIT:]
        candidate = f"{buffer}\n{line}" if buffer else line
        if len(candidate) > _NOTION_TEXT_LIMIT:
            chunks.append(buffer)
            buffer = line
        else:
            buffer = candidate
    if buffer:
        chunks.append(buffer)
    # Notion admite hasta 100 bloques por request; un acta no se acerca.
    return [
        {
            "object": "block",
            "type": "paragraph",
            "paragraph": {"rich_text": [{"type": "text", "text": {"content": c}}]},
        }
        for c in chunks[:100]
    ]


async def create_page(access_token: str, parent_id: str, title: str, content: str = "") -> dict:
    """Crea una página en Notion."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{NOTION_API}/pages",
            json={
                "parent": {"page_id": parent_id},
                "properties": {
                    "title": {
                        "title": [{"text": {"content": title[:_NOTION_TEXT_LIMIT]}}]
                    }
                },
                "children": _content_to_blocks(content),
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
