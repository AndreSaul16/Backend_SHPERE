"""Clasificación del resultado de una herramienta en sus tres estados.

Un único punto de decisión: `_classify_tool_output`. Que sea uno solo es lo que
garantiza TRI-001 —ningún par de estados puede compartir evento—, así que estos
tests son también la prueba de que no hay una segunda heurística en paralelo.
"""
import json

from app.presentation.api.v1.stream import _classify_tool_output


def _clasifica(payload) -> tuple[str, str]:
    return _classify_tool_output(json.dumps(payload, ensure_ascii=False))


# --- Éxito: sin clave `error` ---

def test_payload_sin_error_es_resultado():
    estado, mensaje = _clasifica({"ok": True, "events": []})

    assert estado == "result"
    assert mensaje == ""


def test_texto_que_no_es_json_es_resultado():
    estado, _ = _classify_tool_output("42 eventos encontrados")

    assert estado == "result"


# --- Fallo: `error` presente y distinto de confirmation_required ---

def test_error_booleano_sigue_siendo_fallo():
    estado, mensaje = _clasifica({"error": True, "message": "n8n devolvió 502"})

    assert estado == "error"
    assert mensaje == "n8n devolvió 502"


def test_error_en_string_es_fallo_con_su_hint():
    estado, mensaje = _clasifica({
        "error": "linkedin_not_configured",
        "hint": "Conecta LinkedIn en Settings → Connections.",
    })

    assert estado == "error"
    assert mensaje == "Conecta LinkedIn en Settings → Connections."


def test_error_en_string_sin_hint_cae_al_codigo_de_error():
    estado, mensaje = _clasifica({"error": "notion_api_error"})

    assert estado == "error"
    assert mensaje == "notion_api_error"


def test_error_vacio_no_es_fallo():
    # `{"error": null}` y `{"error": ""}` son payloads de éxito mal formados,
    # no fallos: pintarlos en rojo sería la mentira inversa.
    assert _clasifica({"error": None, "ok": True})[0] == "result"
    assert _clasifica({"error": ""})[0] == "result"


# --- Confirmación: estado propio, ni éxito ni fallo ---

def test_confirmation_required_es_su_propio_estado():
    estado, resumen = _clasifica({
        "error": "confirmation_required",
        "tool": "whatsapp_send_message",
        "action_summary": "Enviar «llego tarde» a +34600111222",
    })

    assert estado == "confirmation"
    assert resumen == "Enviar «llego tarde» a +34600111222"


def test_confirmation_sin_resumen_no_se_queda_sin_texto():
    estado, resumen = _clasifica({"error": "confirmation_required", "hint": "¿Confirmas?"})

    assert estado == "confirmation"
    assert resumen == "¿Confirmas?"


def test_los_tres_estados_no_comparten_evento():
    estados = {
        _clasifica({"ok": True})[0],
        _clasifica({"error": "notion_api_error"})[0],
        _clasifica({"error": "confirmation_required", "action_summary": "S"})[0],
    }

    assert estados == {"result", "error", "confirmation"}
