"""Tools OAuth (GitHub/Notion/Slack): registro, gating de conexión y confirmación.

Cierra el hueco detectado en la auditoría 2026-07-12: los tokens OAuth se
guardaban pero ninguna tool los consumía.
"""
import json

import pytest

import app.infrastructure.tools.oauth_tools as oauth_tools
from app.core.tool_context import (
    DESTRUCTIVE_TOOLS,
    _current_confirmation_level,
    _current_user_id,
)


@pytest.fixture(autouse=True)
def _user_context():
    """Simula un request autenticado con confirmación destructive_only."""
    t1 = _current_user_id.set("u_test")
    t2 = _current_confirmation_level.set("destructive_only")
    yield
    _current_user_id.reset(t1)
    _current_confirmation_level.reset(t2)


def _mock_token(monkeypatch, token):
    async def fake_get_token(user_id, provider):
        return token

    monkeypatch.setattr(oauth_tools.credentials_service, "get_token", fake_get_token)


# --- Registro ---

def test_tools_github_registradas_en_cto():
    from app.infrastructure.tools.registry import ROLE_TOOLS, load_all_tools

    load_all_tools()
    names = {t.name for t in ROLE_TOOLS["CTO"]}
    assert {"github_create_repo", "github_create_issue", "github_comment_pr"} <= names


def test_tools_slack_notion_compartidas():
    from app.infrastructure.tools.registry import SHARED_TOOLS, load_all_tools

    load_all_tools()
    names = {t.name for t in SHARED_TOOLS}
    assert {
        "slack_post_message",
        "slack_list_channels",
        "notion_create_page",
        "notion_update_page",
    } <= names


def test_destructive_tools_actualizado():
    # github_delete_repo no existe como tool; slack_post_message tiene impacto externo.
    assert "github_delete_repo" not in DESTRUCTIVE_TOOLS
    assert "slack_post_message" in DESTRUCTIVE_TOOLS
    assert "github_create_repo" in DESTRUCTIVE_TOOLS


# --- Gating de conexión ---

async def test_sin_token_devuelve_not_connected(monkeypatch):
    _mock_token(monkeypatch, None)
    result = json.loads(await oauth_tools._github_create_issue("o", "r", "título"))
    assert result["error"] == "github_not_connected"
    assert "Settings" in result["hint"]


async def test_sin_usuario_devuelve_missing_context(monkeypatch):
    _current_user_id.set(None)
    result = json.loads(await oauth_tools._slack_list_channels())
    assert result["error"] == "missing_user_context"


# --- Confirmación destructiva ---

async def test_crear_repo_sin_confirmar_pide_confirmacion(monkeypatch):
    _mock_token(monkeypatch, "tok")
    result = json.loads(await oauth_tools._github_create_repo("mi-repo"))
    assert result["error"] == "confirmation_required"


async def test_crear_repo_confirmado_llama_al_cliente(monkeypatch):
    _mock_token(monkeypatch, "tok")
    called = {}

    async def fake_create_repo(token, name, private, description):
        called.update(token=token, name=name)
        return {"url": "https://github.com/u/mi-repo", "name": "u/mi-repo"}

    monkeypatch.setattr(oauth_tools.github_client, "create_repo", fake_create_repo)
    result = json.loads(await oauth_tools._github_create_repo("mi-repo", confirmed=True))
    assert called == {"token": "tok", "name": "mi-repo"}
    assert result["name"] == "u/mi-repo"


async def test_slack_post_sin_confirmar_pide_confirmacion(monkeypatch):
    _mock_token(monkeypatch, "tok")
    result = json.loads(await oauth_tools._slack_post_message("#general", "hola"))
    assert result["error"] == "confirmation_required"


async def test_error_de_api_se_reporta_sin_romper(monkeypatch):
    _mock_token(monkeypatch, "tok")

    async def boom(token, parent_id, title, content):
        raise ValueError("Notion 400")

    monkeypatch.setattr(oauth_tools.notion_client, "create_page", boom)
    result = json.loads(await oauth_tools._notion_create_page("p1", "Doc"))
    assert result["error"] == "notion_api_error"
    assert "Notion 400" in result["detail"]
