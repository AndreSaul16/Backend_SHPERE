"""Memoria ejecutiva del board (F8): guardado tolerante de actas e inyección
de contexto solo cuando existen actas previas. Mocks, sin Mongo real.

Aislamiento: el load SIEMPRE filtra por user_id Y session_id.
"""
import pytest

from app.application import board_v2 as bv


class FakeActasCol:
    def __init__(self, docs=None, fail_insert=False, fail_find=False):
        self.docs = docs or []
        self.inserted = []
        self.fail_insert = fail_insert
        self.fail_find = fail_find
        self.last_query = None

    async def insert_one(self, doc):
        if self.fail_insert:
            raise RuntimeError("mongo down")
        self.inserted.append(doc)

    def find(self, query):
        self.last_query = query
        if self.fail_find:
            raise RuntimeError("mongo down")
        outer = self

        class _Cursor:
            def sort(self, *a, **k):
                return self
            def limit(self, *a, **k):
                return self
            def __aiter__(self):
                async def gen():
                    for d in outer.docs:
                        yield d
                return gen()

        return _Cursor()


# --- _save_acta ---

ACTA_CONTENT = (
    "Resumen ejecutivo: adelante con el plan.\n"
    '<sphere_artifact type="markdown" title="Acta de la Junta"># Acta\n## Decisión\nGO</sphere_artifact>'
)


async def test_save_acta_extrae_summary_y_acta_md(monkeypatch):
    col = FakeActasCol()
    monkeypatch.setattr(bv, "get_board_actas_collection", lambda: col)

    await bv._save_acta("u1", "s1", ACTA_CONTENT)

    assert len(col.inserted) == 1
    doc = col.inserted[0]
    assert doc["user_id"] == "u1"
    assert doc["session_id"] == "s1"
    assert "# Acta" in doc["acta_md"]
    assert "<sphere_artifact" not in doc["summary"]
    assert "Resumen ejecutivo" in doc["summary"]
    assert len(doc["summary"]) <= 500


async def test_save_acta_tolerante_a_fallo(monkeypatch):
    col = FakeActasCol(fail_insert=True)
    monkeypatch.setattr(bv, "get_board_actas_collection", lambda: col)
    # No debe lanzar aunque el insert falle.
    await bv._save_acta("u1", "s1", ACTA_CONTENT)


async def test_save_acta_sin_ids_no_inserta(monkeypatch):
    col = FakeActasCol()
    monkeypatch.setattr(bv, "get_board_actas_collection", lambda: col)
    await bv._save_acta(None, "s1", ACTA_CONTENT)
    await bv._save_acta("u1", None, ACTA_CONTENT)
    await bv._save_acta("u1", "s1", "")
    assert col.inserted == []


# --- _load_prior_actas_context ---


async def test_load_context_vacio_si_no_hay_actas(monkeypatch):
    col = FakeActasCol(docs=[])
    monkeypatch.setattr(bv, "get_board_actas_collection", lambda: col)
    ctx = await bv._load_prior_actas_context("u1", "s1")
    assert ctx == ""


async def test_load_context_incluye_actas_y_filtra_por_user_y_session(monkeypatch):
    col = FakeActasCol(docs=[{"summary": "Decidimos subir precios"}, {"summary": "Contratamos CTO"}])
    monkeypatch.setattr(bv, "get_board_actas_collection", lambda: col)

    ctx = await bv._load_prior_actas_context("u1", "s1")
    assert "[ACTAS ANTERIORES DE ESTA JUNTA]" in ctx
    assert "Decidimos subir precios" in ctx
    assert "Contratamos CTO" in ctx
    # Aislamiento: la query filtra por ambos.
    assert col.last_query == {"user_id": "u1", "session_id": "s1"}


async def test_load_context_truncado(monkeypatch):
    col = FakeActasCol(docs=[{"summary": "x" * 5000}])
    monkeypatch.setattr(bv, "get_board_actas_collection", lambda: col)
    ctx = await bv._load_prior_actas_context("u1", "s1", max_chars=1500)
    assert len(ctx) <= 1500


async def test_load_context_tolerante_a_fallo(monkeypatch):
    col = FakeActasCol(fail_find=True)
    monkeypatch.setattr(bv, "get_board_actas_collection", lambda: col)
    ctx = await bv._load_prior_actas_context("u1", "s1")
    assert ctx == ""


async def test_load_context_sin_ids(monkeypatch):
    ctx = await bv._load_prior_actas_context(None, None)
    assert ctx == ""


# --- AD-002: la etiqueta que emite la plantilla del acta ---
#
# El nombre del atributo tiene que estar fijado por un test EN CADA LADO. Este
# es el de backend; el de frontend es
# `tests/store/loadSessionJunta.test.ts::AD-001`, que afirma sobre el mismo
# literal sin normalizarlo ni reescribirlo. Cambiar la plantilla de un lado sin
# el otro rompe una suite en vez de degradar el acta en silencio: durante 844
# tests en verde, el lector buscó `artifact_type=`, un atributo que no escribe
# nadie, y el acta recuperada volvía como bloque de código.


def test_plantilla_del_acta_emite_type_markdown():
    assert 'type="markdown"' in bv.SYNTHESIS_ADDITION


def test_plantilla_del_acta_usa_la_etiqueta_completa_del_contrato():
    # El literal EXACTO que el frontend recupera del historial.
    assert '<sphere_artifact type="markdown" title="Acta de la Junta">' in bv.SYNTHESIS_ADDITION
    # Y el nombre inventado no aparece por ningún lado.
    assert "artifact_type=" not in bv.SYNTHESIS_ADDITION
