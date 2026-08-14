"""
Helpers de aislamiento multi-tenant.
Inyecta user_id automáticamente en queries para que ningún endpoint
pueda filtrar datos de otro usuario.
"""

from typing import Optional
from motor.motor_asyncio import AsyncIOMotorCollection
from motor.motor_asyncio import AsyncIOMotorCursor
from fastapi import HTTPException

from app.core.logger import api_logger as logger


def scoped_find(
    collection: AsyncIOMotorCollection,
    user_id: str,
    filter: Optional[dict] = None,
    **kwargs,
) -> AsyncIOMotorCursor:
    """
    Find con scope obligatorio por user_id.

    Ejemplo:
        cursor = scoped_find(sessions_col, user["firebase_uid"], {"type": "direct"})
    """
    query = {**(filter or {}), "user_id": user_id}
    return collection.find(query, **kwargs)


async def scoped_find_one(
    collection: AsyncIOMotorCollection,
    user_id: str,
    filter: Optional[dict] = None,
    **kwargs,
) -> Optional[dict]:
    """FindOne con scope obligatorio por user_id."""
    query = {**(filter or {}), "user_id": user_id}
    return await collection.find_one(query, **kwargs)


async def scoped_insert(
    collection: AsyncIOMotorCollection,
    user_id: str,
    doc: dict,
) -> dict:
    """
    Insert con user_id inyectado automáticamente.
    Si el doc ya tiene user_id, lo sobreescribe (seguridad > flexibilidad).
    """
    doc["user_id"] = user_id
    result = await collection.insert_one(doc)
    doc["_id"] = result.inserted_id
    return doc


async def scoped_update(
    collection: AsyncIOMotorCollection,
    user_id: str,
    filter: dict,
    update: dict,
    **kwargs,
):
    """Update con scope obligatorio por user_id."""
    query = {**filter, "user_id": user_id}
    return await collection.update_one(query, update, **kwargs)


async def scoped_delete(
    collection: AsyncIOMotorCollection,
    user_id: str,
    filter: Optional[dict] = None,
):
    """Delete con scope obligatorio por user_id."""
    query = {**(filter or {}), "user_id": user_id}
    return await collection.delete_one(query)


def require_owner(doc: Optional[dict], user_id: str, resource_name: str = "recurso"):
    """
    Verifica que un documento pertenezca al usuario.
    Lanza 403 si no es dueño, 404 si no existe.
    """
    if doc is None:
        raise HTTPException(status_code=404, detail=f"{resource_name} no encontrado")

    # Soportar ambos campos: user_id y owner_user_id
    doc_user_id = doc.get("user_id") or doc.get("owner_user_id")
    # Un documento sin dueño (campo ausente/None/"") NO pertenece a nadie: negar.
    # Antes se saltaba la comprobación y cualquier usuario autenticado accedía.
    if not doc_user_id or doc_user_id != user_id:
        logger.warning(
            f"Acceso denegado: usuario {user_id} intentó acceder a "
            f"{resource_name} perteneciente a {doc_user_id or '(sin dueño)'}"
        )
        raise HTTPException(
            status_code=404,  # 404 en vez de 403 para no revelar existencia
            detail=f"{resource_name} no encontrado",
        )


async def scoped_find_paginated(
    collection: AsyncIOMotorCollection,
    user_id: str,
    filter: Optional[dict] = None,
    sort_field: str = "created_at",
    limit: int = 50,
    cursor_value: Optional[str] = None,
    cursor_id: Optional[str] = None,
) -> tuple[list[dict], Optional[str], Optional[str]]:
    """
    Paginación por cursor (keyset) con scope obligatorio por user_id.

    Returns:
        (items, next_cursor_value, next_cursor_id)
    """
    query = {**(filter or {}), "user_id": user_id}

    # Cursor-based pagination
    if cursor_value and cursor_id:
        query["$or"] = [
            {sort_field: {"$lt": cursor_value}},
            {sort_field: cursor_value, "_id": {"$lt": cursor_id}},
        ]

    cursor = (
        collection.find(query).sort([(sort_field, -1), ("_id", -1)]).limit(limit + 1)
    )  # +1 para detectar si hay más

    items = []
    async for doc in cursor:
        doc.pop("_id", None)
        items.append(doc)

    has_more = len(items) > limit
    if has_more:
        items = items[:limit]

    next_cursor_value = None
    next_cursor_id = None
    if has_more and items:
        last = items[-1]
        next_cursor_value = last.get(sort_field)
        next_cursor_id = last.get("_id")

    return items, next_cursor_value, next_cursor_id
