"""Contrato de exportación de actas → Notion/GitHub (F2).

Sin Mongo real ni httpx real: monkeypatch de credentials_service, la colección
de usuarios y los clientes atómicos.
"""
import pytest
from fastapi import HTTPException

from app.presentation.api.v1 import exports
from app.presentation.api.v1.exports import (
    export_to_notion,
    export_github_issues,
    NotionExportRequest,
    GithubIssuesRequest,
    GithubIssue,
)

USER = {"firebase_uid": "u1", "email": "u1@test.com"}


class FakeUsersCol:
    """Colección de usuarios en memoria para los tests."""

    def __init__(self, doc=None):
        self.doc = doc or {}
        self.updates = []

    async def find_one(self, query, projection=None):
        return dict(self.doc)

    async def update_one(self, query, update):
        self.updates.append(update)
        self.doc.update(update.get("$set", {}))


@pytest.fixture
def patch_token(monkeypatch):
    def _set(token):
        async def fake_get_token(user_id, provider):
            return token
        monkeypatch.setattr(exports.credentials_service, "get_token", fake_get_token)
    return _set


# --- NOTION ---


async def test_notion_sin_token_devuelve_400_con_hint(patch_token, monkeypatch):
    patch_token(None)
    with pytest.raises(HTTPException) as exc:
        await export_to_notion(NotionExportRequest(title="Acta"), user=USER)
    assert exc.value.status_code == 400
    assert "Notion" in exc.value.detail
    assert "Settings" in exc.value.detail


async def test_notion_usa_parent_existente(patch_token, monkeypatch):
    patch_token("tok-notion")
    col = FakeUsersCol({"notion_parent_page_id": "page-123"})
    monkeypatch.setattr(exports, "get_users_collection", lambda: col)

    called = {}

    async def fake_create_page(token, parent_id, title, content):
        called.update(token=token, parent_id=parent_id, title=title)
        return {"url": "https://notion.so/x", "id": "new-1"}

    monkeypatch.setattr(exports.notion_client, "create_page", fake_create_page)

    result = await export_to_notion(
        NotionExportRequest(title="Acta de la Junta", content="# Acta"), user=USER
    )
    assert result["url"] == "https://notion.so/x"
    assert called["parent_id"] == "page-123"
    # No debe re-buscar ni re-persistir si ya hay parent.
    assert col.updates == []


async def test_notion_busca_y_persiste_parent_default(patch_token, monkeypatch):
    patch_token("tok-notion")
    col = FakeUsersCol({})  # sin notion_parent_page_id
    monkeypatch.setattr(exports, "get_users_collection", lambda: col)

    async def fake_search(token):
        return "found-page-9"

    async def fake_create_page(token, parent_id, title, content):
        return {"url": "https://notion.so/y", "id": "new-2"}

    monkeypatch.setattr(exports.notion_client, "search_first_page", fake_search)
    monkeypatch.setattr(exports.notion_client, "create_page", fake_create_page)

    result = await export_to_notion(NotionExportRequest(title="Acta"), user=USER)
    assert result["id"] == "new-2"
    # Debe haber persistido el parent encontrado.
    assert col.doc.get("notion_parent_page_id") == "found-page-9"


async def test_notion_parent_cacheado_invalido_reintenta_y_reescribe(patch_token, monkeypatch):
    # El parent cacheado ya no es accesible: create_page falla la 1ª vez, se
    # invalida el cache, search encuentra otra página y el reintento crea OK.
    patch_token("tok-notion")
    col = FakeUsersCol({"notion_parent_page_id": "page-borrada"})
    monkeypatch.setattr(exports, "get_users_collection", lambda: col)

    attempts = {"n": 0}

    async def fake_create_page(token, parent_id, title, content):
        attempts["n"] += 1
        if parent_id == "page-borrada":
            raise RuntimeError("parent no accesible")
        return {"url": "https://notion.so/z", "id": "new-3"}

    async def fake_search(token):
        return "page-nueva"

    monkeypatch.setattr(exports.notion_client, "create_page", fake_create_page)
    monkeypatch.setattr(exports.notion_client, "search_first_page", fake_search)

    result = await export_to_notion(NotionExportRequest(title="Acta"), user=USER)
    assert result["id"] == "new-3"
    assert attempts["n"] == 2
    assert col.doc.get("notion_parent_page_id") == "page-nueva"


async def test_notion_sin_paginas_accesibles_400(patch_token, monkeypatch):
    patch_token("tok-notion")
    col = FakeUsersCol({})
    monkeypatch.setattr(exports, "get_users_collection", lambda: col)

    async def fake_search(token):
        return None

    monkeypatch.setattr(exports.notion_client, "search_first_page", fake_search)

    with pytest.raises(HTTPException) as exc:
        await export_to_notion(NotionExportRequest(title="Acta"), user=USER)
    assert exc.value.status_code == 400


# --- GITHUB ---


async def test_github_sin_token_400_con_hint(patch_token):
    patch_token(None)
    req = GithubIssuesRequest(owner="o", repo="r", issues=[GithubIssue(title="T1")])
    with pytest.raises(HTTPException) as exc:
        await export_github_issues(req, user=USER)
    assert exc.value.status_code == 400
    assert "GitHub" in exc.value.detail


async def test_github_crea_todos_los_issues(patch_token, monkeypatch):
    patch_token("tok-gh")
    urls = iter(["https://gh/1", "https://gh/2"])

    async def fake_create_issue(token, owner, repo, title, body):
        return {"url": next(urls), "number": 1}

    monkeypatch.setattr(exports.github_client, "create_issue", fake_create_issue)

    req = GithubIssuesRequest(
        owner="o",
        repo="r",
        issues=[GithubIssue(title="T1"), GithubIssue(title="T2", body="b")],
    )
    result = await export_github_issues(req, user=USER)
    assert len(result["created"]) == 2
    assert result["created"][0]["url"] == "https://gh/1"
    assert result["errors"] == []


async def test_github_todos_fallan_502(patch_token, monkeypatch):
    patch_token("tok-gh")

    async def fake_create_issue(token, owner, repo, title, body):
        raise RuntimeError("boom")

    monkeypatch.setattr(exports.github_client, "create_issue", fake_create_issue)

    req = GithubIssuesRequest(owner="o", repo="r", issues=[GithubIssue(title="T1")])
    with pytest.raises(HTTPException) as exc:
        await export_github_issues(req, user=USER)
    assert exc.value.status_code == 502
