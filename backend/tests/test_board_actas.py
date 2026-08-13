"""Memoria ejecutiva del board (F8): guardado tolerante de actas e inyección
de contexto solo cuando existen actas previas. Mocks, sin Mongo real.

Aislamiento: el load SIEMPRE filtra por user_id Y session_id.
"""
import pytest

from app.application import board_v2 as bv


class FakeActasCol:
    """Colección en memoria con lo justo: insertar, leer ordenado y reemplazar.

    `find_one_and_replace` respeta `sort` y `upsert` porque el orden ES la regla
    de A7: «la más reciente» tiene que ser una decisión, no una casualidad.
    """

    def __init__(self, docs=None, fail_insert=False, fail_find=False):
        self.docs = docs or []
        self.inserted = []
        self.fail_insert = fail_insert
        self.fail_find = fail_find
        self.last_query = None
        self.last_sort = None

    def _casan(self, doc, query):
        return all(doc.get(k) == v for k, v in query.items())

    def _ordenados(self, query, sort):
        casan = [d for d in self.docs if self._casan(d, query)]
        if sort:
            campo, sentido = sort[0]
            casan.sort(key=lambda d: d.get(campo), reverse=sentido < 0)
        return casan

    async def insert_one(self, doc):
        if self.fail_insert:
            raise RuntimeError("mongo down")
        self.inserted.append(doc)
        self.docs.append(doc)

    async def find_one(self, query, sort=None):
        if self.fail_find:
            raise RuntimeError("mongo down")
        casan = self._ordenados(query, sort)
        return casan[0] if casan else None

    async def find_one_and_replace(self, query, reemplazo, sort=None, upsert=False):
        if self.fail_insert:
            raise RuntimeError("mongo down")
        self.last_query = query
        self.last_sort = sort
        casan = self._ordenados(query, sort)
        if casan:
            anterior = casan[0]
            self.docs[self.docs.index(anterior)] = reemplazo
            return anterior
        if upsert:
            self.docs.append(reemplazo)
        return None

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


# --- BA-001/002/003 · una junta, un acta -----------------------------------
#
# `_save_acta` hacía `insert_one` incondicional. Regenerar un debate tres veces
# dejaba TRES actas, y como el CEO recibe «las 2 últimas de esta junta» como
# contexto, el debate siguiente arrancaba citando borradores descartados como si
# fueran conclusiones firmes de la junta.


def _acta(texto: str) -> str:
    return f'Resumen: {texto}\n<sphere_artifact type="markdown" title="Acta de la Junta"># {texto}</sphere_artifact>'


async def _col(monkeypatch, docs=None, **kw):
    col = FakeActasCol(docs=docs, **kw)
    monkeypatch.setattr(bv, "get_board_actas_collection", lambda: col)
    return col


async def test_ba001_regenerar_dos_veces_deja_un_acta(monkeypatch):
    col = await _col(monkeypatch)

    await bv._save_acta("u1", "s1", _acta("v1"))
    await bv._save_acta("u1", "s1", _acta("v2"), regenerate=True)
    await bv._save_acta("u1", "s1", _acta("v3"), regenerate=True)

    assert len(col.docs) == 1


async def test_ba001b_el_acta_superviviente_es_la_ultima(monkeypatch):
    col = await _col(monkeypatch)

    await bv._save_acta("u1", "s1", _acta("v1"))
    await bv._save_acta("u1", "s1", _acta("v2"), regenerate=True)
    await bv._save_acta("u1", "s1", _acta("v3"), regenerate=True)

    assert "v3" in col.docs[0]["acta_md"]
    assert "v1" not in col.docs[0]["acta_md"]


async def test_ba001c_un_debate_nuevo_no_pisa_al_anterior(monkeypatch):
    """Caracterización: impide que el arreglo convierta TODO en upsert."""
    col = await _col(monkeypatch)

    await bv._save_acta("u1", "s1", _acta("debate uno"))
    await bv._save_acta("u1", "s1", _acta("debate dos"))

    assert len(col.docs) == 2
    assert any("debate uno" in d["acta_md"] for d in col.docs)


async def test_ba001d_created_at_se_conserva_y_updated_at_aparece(monkeypatch):
    col = await _col(monkeypatch)

    await bv._save_acta("u1", "s1", _acta("v1"))
    nacimiento = col.docs[0]["created_at"]

    await bv._save_acta("u1", "s1", _acta("v2"), regenerate=True)

    assert col.docs[0]["created_at"] == nacimiento
    assert col.docs[0]["updated_at"] >= nacimiento


async def test_ba001e_regenerar_no_toca_otras_sesiones_ni_otros_usuarios(monkeypatch):
    col = await _col(monkeypatch)

    await bv._save_acta("u1", "s1", _acta("de u1 en s1"))
    await bv._save_acta("u1", "s2", _acta("de u1 en s2"))
    await bv._save_acta("u2", "s1", _acta("de u2 en s1"))

    await bv._save_acta("u1", "s1", _acta("regenerada"), regenerate=True)

    assert len(col.docs) == 3
    assert any("de u1 en s2" in d["acta_md"] for d in col.docs)
    assert any("de u2 en s1" in d["acta_md"] for d in col.docs)


async def test_ba002_el_debate_siguiente_no_cita_borradores(monkeypatch):
    col = await _col(monkeypatch)

    await bv._save_acta("u1", "s1", _acta("borrador v1"))
    await bv._save_acta("u1", "s1", _acta("borrador v2"), regenerate=True)
    await bv._save_acta("u1", "s1", _acta("acta vigente"), regenerate=True)

    ctx = await bv._load_prior_actas_context("u1", "s1")

    assert "acta vigente" in ctx
    assert "borrador v1" not in ctx
    assert "borrador v2" not in ctx


async def test_ba003_limite_declarado_regenerar_desde_un_turno_antiguo(monkeypatch):
    """El límite conocido, fijado por un test para que no se descubra en producción.

    La regla identifica el debate a reemplazar como «el acta más reciente de la
    sesión». Si el usuario regenera desde un turno de junta que NO es el último,
    el acta que se reemplaza es la del debate posterior y la del debate
    intermedio queda huérfana. Cerrarlo del todo exige sellar un identificador
    de debate en el acta y en el checkpoint, y eso no es de este cambio.
    """
    col = await _col(monkeypatch)

    await bv._save_acta("u1", "s1", _acta("debate uno"))
    await bv._save_acta("u1", "s1", _acta("debate dos"))

    # El usuario regenera el PRIMERO de los dos.
    await bv._save_acta("u1", "s1", _acta("debate uno, otra vez"), regenerate=True)

    textos = [d["acta_md"] for d in col.docs]
    assert any("debate uno, otra vez" in t for t in textos)
    # El acta del debate dos ha sido la reemplazada...
    assert not any("debate dos" in t for t in textos)
    # ...y la del debate uno se queda huérfana, sin borrarse.
    assert any(t.strip() == "# debate uno" for t in textos)
