"""
Tools que consumen los tokens OAuth de usuario (GitHub, Notion, Slack).

Cierra el hueco de la conexión OAuth: los tokens se guardaban cifrados
(Settings → Connections) pero ninguna tool los usaba, así que conectar un
proveedor no daba capacidad real al agente. Estas tools llaman a los clientes
atómicos de `tools/clients/` con el token auto-refrescado del usuario.

GitHub → rol CTO. Notion y Slack → compartidas (documentar/avisar es
transversal). Las acciones con impacto externo (crear repo, publicar en Slack)
pasan por el flujo de confirmación destructiva.
"""
import json
from typing import Optional

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from app.core.credentials import credentials_service
from app.core.logger import checkpoint_logger as logger
from app.core.tool_context import get_current_user_id, requires_confirmation
from app.infrastructure.tools.clients import github_client, notion_client, slack_client
from app.infrastructure.tools.registry import register_role_tool, register_shared_tool


# ============================================================
# HELPERS
# ============================================================


def _missing_user_error(tool_name: str) -> str:
    return json.dumps(
        {
            "error": "user_context_missing",
            "tool": tool_name,
            "hint": "Esta herramienta requiere un usuario autenticado.",
        },
        ensure_ascii=False,
    )


def _not_connected_error(provider: str, tool_name: str) -> str:
    return json.dumps(
        {
            "error": f"{provider}_not_connected",
            "tool": tool_name,
            "hint": (
                f"El usuario no tiene {provider.capitalize()} conectado. "
                f"Pídele que lo conecte en Settings → Connections → {provider.capitalize()}."
            ),
        },
        ensure_ascii=False,
    )


def _confirmation_required_error(tool_name: str, action_summary: str) -> str:
    return json.dumps(
        {
            "error": "confirmation_required",
            "tool": tool_name,
            "action": action_summary,
            "hint": (
                "Esta acción requiere confirmación del usuario. Pregúntale si desea "
                "continuar y, si acepta, vuelve a llamar la tool con confirmed=true."
            ),
        },
        ensure_ascii=False,
    )


def _api_error(provider: str, tool_name: str, exc: Exception) -> str:
    logger.warning(f"{tool_name} falló: {exc}")
    return json.dumps(
        {
            "error": f"{provider}_api_error",
            "tool": tool_name,
            "detail": str(exc)[:300],
        },
        ensure_ascii=False,
    )


async def _get_token(provider: str, tool_name: str) -> tuple[Optional[str], Optional[str]]:
    """Devuelve (token, error_json). Solo uno de los dos es no-None."""
    user_id = get_current_user_id()
    if not user_id:
        return None, _missing_user_error(tool_name)
    token = await credentials_service.get_token(user_id, provider)
    if not token:
        return None, _not_connected_error(provider, tool_name)
    return token, None


# ============================================================
# INPUT SCHEMAS
# ============================================================


class GithubCreateRepoInput(BaseModel):
    name: str = Field(description="Nombre del repositorio a crear")
    private: bool = Field(True, description="True para repositorio privado")
    description: str = Field("", description="Descripción corta del repositorio")
    confirmed: bool = Field(
        False, description="True solo si el usuario ya confirmó explícitamente la acción"
    )


class GithubCreateIssueInput(BaseModel):
    owner: str = Field(description="Usuario u organización dueña del repositorio")
    repo: str = Field(description="Nombre del repositorio")
    title: str = Field(description="Título del issue")
    body: str = Field("", description="Descripción del issue en markdown")


class GithubCommentPrInput(BaseModel):
    owner: str = Field(description="Usuario u organización dueña del repositorio")
    repo: str = Field(description="Nombre del repositorio")
    pr_number: int = Field(description="Número del Pull Request")
    body: str = Field(description="Contenido del comentario en markdown")


class SlackPostMessageInput(BaseModel):
    channel: str = Field(description="Canal destino (ID o #nombre)")
    text: str = Field(description="Texto del mensaje")
    confirmed: bool = Field(
        False, description="True solo si el usuario ya confirmó explícitamente la acción"
    )


class SlackListChannelsInput(BaseModel):
    pass


class NotionCreatePageInput(BaseModel):
    parent_id: str = Field(description="ID de la página o base de datos padre en Notion")
    title: str = Field(description="Título de la nueva página")
    content: str = Field("", description="Contenido inicial de la página (texto plano)")


class NotionUpdatePageInput(BaseModel):
    page_id: str = Field(description="ID de la página de Notion a actualizar")
    content: str = Field(description="Contenido a añadir a la página (texto plano)")


# ============================================================
# GITHUB (rol CTO)
# ============================================================


async def _github_create_repo(
    name: str, private: bool = True, description: str = "", confirmed: bool = False
) -> str:
    if requires_confirmation("github_create_repo") and not confirmed:
        visibility = "privado" if private else "público"
        return _confirmation_required_error(
            "github_create_repo", f"Crear repositorio {visibility} '{name}' en GitHub"
        )
    token, err = await _get_token("github", "github_create_repo")
    if err:
        return err
    try:
        result = await github_client.create_repo(token, name, private, description)
    except Exception as e:
        return _api_error("github", "github_create_repo", e)
    return json.dumps(result, ensure_ascii=False)


async def _github_create_issue(owner: str, repo: str, title: str, body: str = "") -> str:
    token, err = await _get_token("github", "github_create_issue")
    if err:
        return err
    try:
        result = await github_client.create_issue(token, owner, repo, title, body)
    except Exception as e:
        return _api_error("github", "github_create_issue", e)
    return json.dumps(result, ensure_ascii=False)


async def _github_comment_pr(owner: str, repo: str, pr_number: int, body: str) -> str:
    token, err = await _get_token("github", "github_comment_pr")
    if err:
        return err
    try:
        result = await github_client.create_pr_comment(token, owner, repo, pr_number, body)
    except Exception as e:
        return _api_error("github", "github_comment_pr", e)
    return json.dumps(result, ensure_ascii=False)


# ============================================================
# SLACK (compartida)
# ============================================================


async def _slack_post_message(channel: str, text: str, confirmed: bool = False) -> str:
    if requires_confirmation("slack_post_message") and not confirmed:
        preview = text[:120] + ("..." if len(text) > 120 else "")
        return _confirmation_required_error(
            "slack_post_message", f"Publicar en Slack #{channel}: '{preview}'"
        )
    token, err = await _get_token("slack", "slack_post_message")
    if err:
        return err
    try:
        result = await slack_client.post_message(token, channel, text)
    except Exception as e:
        return _api_error("slack", "slack_post_message", e)
    return json.dumps(result, ensure_ascii=False)


async def _slack_list_channels() -> str:
    token, err = await _get_token("slack", "slack_list_channels")
    if err:
        return err
    try:
        result = await slack_client.list_channels(token)
    except Exception as e:
        return _api_error("slack", "slack_list_channels", e)
    return json.dumps(result, ensure_ascii=False)


# ============================================================
# NOTION (compartida)
# ============================================================


async def _notion_create_page(parent_id: str, title: str, content: str = "") -> str:
    token, err = await _get_token("notion", "notion_create_page")
    if err:
        return err
    try:
        result = await notion_client.create_page(token, parent_id, title, content)
    except Exception as e:
        return _api_error("notion", "notion_create_page", e)
    return json.dumps(result, ensure_ascii=False)


async def _notion_update_page(page_id: str, content: str) -> str:
    token, err = await _get_token("notion", "notion_update_page")
    if err:
        return err
    try:
        result = await notion_client.update_page(token, page_id, content)
    except Exception as e:
        return _api_error("notion", "notion_update_page", e)
    return json.dumps(result, ensure_ascii=False)


# ============================================================
# REGISTRO
# ============================================================

register_role_tool(
    "CTO",
    StructuredTool.from_function(
        coroutine=_github_create_repo,
        name="github_create_repo",
        description="Crea un repositorio en la cuenta de GitHub del usuario (requiere GitHub conectado en Settings → Connections).",
        args_schema=GithubCreateRepoInput,
    ),
)

register_role_tool(
    "CTO",
    StructuredTool.from_function(
        coroutine=_github_create_issue,
        name="github_create_issue",
        description="Crea un issue en un repositorio de GitHub del usuario.",
        args_schema=GithubCreateIssueInput,
    ),
)

register_role_tool(
    "CTO",
    StructuredTool.from_function(
        coroutine=_github_comment_pr,
        name="github_comment_pr",
        description="Comenta en un Pull Request de GitHub.",
        args_schema=GithubCommentPrInput,
    ),
)

register_shared_tool(
    StructuredTool.from_function(
        coroutine=_slack_post_message,
        name="slack_post_message",
        description="Publica un mensaje en un canal de Slack del workspace del usuario (requiere Slack conectado).",
        args_schema=SlackPostMessageInput,
    )
)

register_shared_tool(
    StructuredTool.from_function(
        coroutine=_slack_list_channels,
        name="slack_list_channels",
        description="Lista los canales públicos del workspace de Slack del usuario. Solo lectura.",
        args_schema=SlackListChannelsInput,
    )
)

register_shared_tool(
    StructuredTool.from_function(
        coroutine=_notion_create_page,
        name="notion_create_page",
        description="Crea una página en el workspace de Notion del usuario, bajo la página o base de datos indicada.",
        args_schema=NotionCreatePageInput,
    )
)

register_shared_tool(
    StructuredTool.from_function(
        coroutine=_notion_update_page,
        name="notion_update_page",
        description="Añade contenido a una página existente de Notion del usuario.",
        args_schema=NotionUpdatePageInput,
    )
)
