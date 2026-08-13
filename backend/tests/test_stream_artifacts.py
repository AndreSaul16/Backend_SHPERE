"""El artefacto que sale por el stream: cierre garantizado y contrato.

`generate_chat_events` es un generador asíncrono; estos tests lo conducen con un
orquestador falso que emite exactamente los trozos que emitiría el modelo, y leen
los eventos SSE resultantes. Nada de red, nada de Mongo, nada de LangGraph: sólo
la máquina de estados del artefacto (`is_inside_artifact` / `artifact_buffer`).
"""
import json
from unittest.mock import patch

import pytest

from app.presentation.api.v1 import stream as stream_mod


# --- Utillaje: un orquestador falso que emite los trozos del modelo -----------


class _Trozo:
    """Lo mínimo que `generate_chat_events` mira de un chunk: `.content`."""

    def __init__(self, content: str):
        self.content = content
        self.additional_kwargs = {}


class _OrquestadorFalso:
    """Sustituye a `orchestrator_app`: emite `on_chat_model_stream` y ya."""

    def __init__(self, trozos, lanza: BaseException | None = None):
        self._trozos = list(trozos)
        self._lanza = lanza

    def astream_events(self, *_args, **_kwargs):
        trozos, lanza = self._trozos, self._lanza

        async def _gen():
            for t in trozos:
                yield {"event": "on_chat_model_stream", "data": {"chunk": _Trozo(t)}}
            if lanza is not None:
                raise lanza

        return _gen()


def _generador(trozos, lanza=None):
    """`generate_chat_events` con el orquestador normal sustituido."""
    orq = _OrquestadorFalso(trozos, lanza)
    parche = patch.object(stream_mod, "orchestrator_app", orq)
    parche.start()
    try:
        return stream_mod.generate_chat_events(
            query="da igual",
            session_id="s1",
            user_id="u1",
        ), parche
    except Exception:
        parche.stop()
        raise


async def _eventos(trozos, lanza=None) -> list[dict]:
    """Recoge los eventos SSE de un turno completo, ya parseados.

    `[DONE]` se representa como `{"type": "[DONE]"}` para poder aserirlo en la
    misma lista que el resto.
    """
    gen, parche = _generador(trozos, lanza)
    try:
        salida = []
        async for linea in gen:
            salida.append(_parse(linea))
        return salida
    finally:
        parche.stop()


def _parse(linea: str) -> dict:
    payload = linea[len("data: "):].strip()
    if payload == "[DONE]":
        return {"type": "[DONE]"}
    return json.loads(payload)


def _tipos(eventos) -> list[str]:
    return [e["type"] for e in eventos]


# --- ART-001 · el artefacto que el modelo no cierra, se cierra igual ---------


async def test_art001_artefacto_sin_etiqueta_de_cierre_se_cierra():
    eventos = await _eventos([
        '<sphere_artifact title="Acta" type="markdown">',
        "contenido del acta",
    ])

    assert "artifact_close" in _tipos(eventos), (
        f"no se emitió artifact_close: {_tipos(eventos)}"
    )


async def test_art002_el_cierre_forzado_dice_que_está_truncado():
    eventos = await _eventos([
        '<sphere_artifact title="Acta" type="markdown">',
        "contenido del acta",
    ])

    cierres = [e for e in eventos if e["type"] == "artifact_close"]
    assert len(cierres) == 1
    assert cierres[0]["truncated"] is True
    assert cierres[0]["reason"] == "stream_ended"


async def test_art002b_el_resto_retenido_no_se_descarta():
    # El último trozo termina en un prefijo de la etiqueta de cierre, así que
    # `artifact_buffer` se queda retenido esperando el resto que nunca llega.
    # Ese texto es contenido del usuario: se emite antes de cerrar.
    eventos = await _eventos([
        '<sphere_artifact title="Acta" type="markdown">',
        "linea uno\nlinea dos</",
    ])

    trozos = [e["content"] for e in eventos if e["type"] == "artifact_chunk"]
    assert "".join(trozos) == "linea uno\nlinea dos</"


# --- ART-003 · el turno siguiente no escribe encima del anterior -------------


async def test_art003_cada_apertura_tiene_su_cierre_antes_de_la_siguiente():
    """Invariante puro de SSE: entre dos `artifact_open` hay un `artifact_close`.

    Es lo que impide que el cliente, que enruta los `artifact_chunk` al artefacto
    que tenga abierto, siga apuntando al del turno anterior.
    """
    turno1 = await _eventos([
        '<sphere_artifact title="Primero" type="markdown">',
        "contenido del primero",
    ])
    turno2 = await _eventos([
        '<sphere_artifact title="Segundo" type="markdown">',
        "contenido del segundo</sphere_artifact>",
    ])

    abierto = False
    for tipo in _tipos(turno1 + turno2):
        if tipo == "artifact_open":
            assert not abierto, "se abrió un artefacto con otro todavía abierto"
            abierto = True
        elif tipo == "artifact_close":
            abierto = False
    assert not abierto, "el último artefacto quedó abierto"


async def test_art003b_el_turno_termina_con_el_canal_de_artefacto_vacio():
    """Al acabar el turno, el cliente no puede quedarse apuntando a un artefacto.

    La regla del cliente (`frontend/src/store/chat/streamHandlers.ts`) es:
    `artifact_open` fija `streamingArtifactBySession`, `artifact_chunk` se
    concatena a lo que ese puntero diga, y `artifact_close` lo pone a `null`.
    Sin cierre, el puntero sobrevive al turno apuntando a un artefacto muerto.
    """
    eventos = await _eventos([
        '<sphere_artifact title="Primero" type="markdown">',
        "contenido del primero",
    ])

    destino: str | None = None
    for e in eventos:
        if e["type"] == "artifact_open":
            destino = e["title"]
        elif e["type"] == "artifact_close":
            destino = None

    assert destino is None, (
        f"el turno acabó con el artefacto {destino!r} todavía abierto en el cliente"
    )


# --- ART-004 · si la inferencia lanza, primero se cierra y luego se avisa ----


async def test_art004_el_cierre_va_antes_del_error():
    eventos = await _eventos(
        ['<sphere_artifact title="Acta" type="markdown">', "a medias"],
        lanza=RuntimeError("la inferencia se cayó"),
    )

    relevantes = [t for t in _tipos(eventos) if t in ("artifact_close", "error")]
    assert relevantes == ["artifact_close", "error"]


# --- ART-005 · el cliente se desconecta: no se emite nada -------------------


async def test_art005_desconexion_con_artefacto_abierto_no_emite_nada():
    """`aclose()` inyecta `GeneratorExit` con el artefacto abierto.

    Un `yield` después de `GeneratorExit` produce
    `RuntimeError: async generator ignored GeneratorExit`. Este test es lo que
    prohíbe cerrar el artefacto desde un `finally` alrededor del bucle.
    """
    gen, parche = _generador([
        '<sphere_artifact title="Acta" type="markdown">',
        "contenido a medias",
        "mas contenido",
    ])
    try:
        vistos = []
        async for linea in gen:
            vistos.append(_parse(linea))
            if vistos[-1]["type"] == "artifact_chunk":
                break

        await gen.aclose()  # no debe lanzar RuntimeError

        assert _tipos(vistos) == ["artifact_open", "artifact_chunk"]
        with pytest.raises(StopAsyncIteration):
            await gen.__anext__()
    finally:
        parche.stop()
