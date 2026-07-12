"""
API de exportación de actas del board a acciones externas (F2).

Convierte un acta (artifact markdown de la Junta) en:
- una página de Notion (POST /me/exports/notion)
- issues de GitHub (POST /me/exports/github-issues)

Los tokens salen del servicio de credenciales OAuth del usuario; si falta el
token se responde 400 con un hint accionable para conectarlo en Settings.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import List

from app.core.auth import get_current_user
from app.core.credentials import credentials_service
from app.infrastructure.database import get_users_collection
from app.infrastructure.tools.clients import github_client, notion_client
from app.core.logger import api_logger as logger

router = APIRouter()


def _not_connected(provider_label: str) -> HTTPException:
    """400 con hint accionable para conectar el proveedor."""
    return HTTPException(
        status_code=400,
        detail=f"Conecta {provider_label} en Settings → Connections",
    )


# --- NOTION ---


class NotionExportRequest(BaseModel):
    title: str = Field(..., min_length=1)
    content: str = ""


@router.post("/me/exports/notion")
async def export_to_notion(
    body: NotionExportRequest,
    user: dict = Depends(get_current_user),
):
    """Crea una página de Notion con el acta.

    Página padre: usa `notion_parent_page_id` del perfil; si no existe, busca la
    primera página accesible por la integración y la persiste como default.
    """
    user_id = user["firebase_uid"]

    token = await credentials_service.get_token(user_id, "notion")
    if not token:
        raise _not_connected("Notion")

    users_col = get_users_collection()
    profile = await users_col.find_one(
        {"firebase_uid": user_id}, {"notion_parent_page_id": 1}
    )
    parent_id = (profile or {}).get("notion_parent_page_id")

    if not parent_id:
        try:
            parent_id = await notion_client.search_first_page(token)
        except Exception as e:
            logger.warning(f"Notion search falló para {user_id}: {e}")
            raise HTTPException(status_code=400, detail="No se pudo acceder a Notion")
        if not parent_id:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Tu integración de Notion no tiene acceso a ninguna página. "
                    "Comparte una página con la integración y vuelve a intentarlo."
                ),
            )
        # Persistir como default para próximas exportaciones.
        await users_col.update_one(
            {"firebase_uid": user_id},
            {"$set": {"notion_parent_page_id": parent_id}},
        )

    try:
        result = await notion_client.create_page(token, parent_id, body.title, body.content)
    except Exception as e:
        # El parent cacheado puede haberse borrado o dejado de compartir con la
        # integración: invalidar el cache y reintentar buscando una página nueva
        # una sola vez, en vez de devolver 502 para siempre.
        logger.warning(f"Notion create_page falló para {user_id} (parent={parent_id}): {e}")
        await users_col.update_one(
            {"firebase_uid": user_id}, {"$unset": {"notion_parent_page_id": ""}}
        )
        try:
            new_parent = await notion_client.search_first_page(token)
        except Exception:
            new_parent = None
        if not new_parent or new_parent == parent_id:
            raise HTTPException(status_code=502, detail="Notion rechazó la creación de la página")
        try:
            result = await notion_client.create_page(token, new_parent, body.title, body.content)
        except Exception as e2:
            logger.error(f"Notion create_page reintento falló para {user_id}: {e2}")
            raise HTTPException(status_code=502, detail="Notion rechazó la creación de la página")
        await users_col.update_one(
            {"firebase_uid": user_id}, {"$set": {"notion_parent_page_id": new_parent}}
        )

    return {"url": result.get("url", ""), "id": result.get("id", "")}


# --- GITHUB ---


class GithubIssue(BaseModel):
    title: str = Field(..., min_length=1)
    body: str = ""


class GithubIssuesRequest(BaseModel):
    owner: str = Field(..., min_length=1)
    repo: str = Field(..., min_length=1)
    issues: List[GithubIssue] = Field(..., min_length=1)


@router.post("/me/exports/github-issues")
async def export_github_issues(
    body: GithubIssuesRequest,
    user: dict = Depends(get_current_user),
):
    """Crea un issue por cada item; devuelve las urls creadas."""
    user_id = user["firebase_uid"]

    token = await credentials_service.get_token(user_id, "github")
    if not token:
        raise _not_connected("GitHub")

    created = []
    errors = []
    for issue in body.issues:
        try:
            result = await github_client.create_issue(
                token, body.owner, body.repo, issue.title, issue.body
            )
            created.append({"title": issue.title, "url": result.get("url", "")})
        except Exception as e:
            logger.warning(f"Error creando issue '{issue.title}' para {user_id}: {e}")
            errors.append({"title": issue.title, "error": str(e)})

    if not created and errors:
        raise HTTPException(
            status_code=502,
            detail="No se pudo crear ningún issue. Revisa owner/repo y permisos.",
        )

    return {"created": created, "errors": errors}
