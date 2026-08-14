"""Clasificación del resultado de una herramienta en sus tres estados.

Un único punto de decisión: `_classify_tool_output`. Que sea uno solo es lo que
garantiza TRI-001 —ningún par de estados puede compartir evento—, así que estos
tests son también la prueba de que no hay una segunda heurística en paralelo.
"""
import json

from app.presentation.api.v1.stream import _classify_tool_output


def _clasifica(payload) -> tuple[str, str, str]:
    return _classify_tool_output(json.dumps(payload, ensure_ascii=False))


# --- Éxito: sin clave `error` ---

def test_payload_sin_error_es_resultado():
    estado, mensaje, _ = _clasifica({"ok": True, "events": []})

    assert estado == "result"
    assert mensaje == ""


def test_texto_que_no_es_json_es_resultado():
    estado, _, _ = _classify_tool_output("42 eventos encontrados")

    assert estado == "result"


# --- Fallo: `error` presente y distinto de confirmation_required ---

def test_error_booleano_sigue_siendo_fallo():
    estado, mensaje, _ = _clasifica({"error": True, "message": "n8n devolvió 502"})

    assert estado == "error"
    assert mensaje == "n8n devolvió 502"


def test_error_en_string_es_fallo_con_su_hint():
    estado, mensaje, _ = _clasifica({
        "error": "linkedin_not_configured",
        "hint": "Conecta LinkedIn en Settings → Connections.",
    })

    assert estado == "error"
    assert mensaje == "Conecta LinkedIn en Settings → Connections."


def test_error_en_string_sin_hint_cae_al_codigo_de_error():
    estado, mensaje, _ = _clasifica({"error": "notion_api_error"})

    assert estado == "error"
    assert mensaje == "notion_api_error"


def test_error_vacio_no_es_fallo():
    # `{"error": null}` y `{"error": ""}` son payloads de éxito mal formados,
    # no fallos: pintarlos en rojo sería la mentira inversa.
    assert _clasifica({"error": None, "ok": True})[0] == "result"
    assert _clasifica({"error": ""})[0] == "result"


# --- Confirmación: estado propio, ni éxito ni fallo ---

def test_confirmation_required_es_su_propio_estado():
    estado, resumen, _ = _clasifica({
        "error": "confirmation_required",
        "tool": "whatsapp_send_message",
        "action_summary": "Enviar «llego tarde» a +34600111222",
    })

    assert estado == "confirmation"
    assert resumen == "Enviar «llego tarde» a +34600111222"


def test_confirmation_sin_resumen_no_se_queda_sin_texto():
    estado, resumen, _ = _clasifica({"error": "confirmation_required", "hint": "¿Confirmas?"})

    assert estado == "confirmation"
    assert resumen == "¿Confirmas?"


def test_los_tres_estados_no_comparten_evento():
    estados = {
        _clasifica({"ok": True})[0],
        _clasifica({"error": "notion_api_error"})[0],
        _clasifica({"error": "confirmation_required", "action_summary": "S"})[0],
    }

    assert estados == {"result", "error", "confirmation"}


# --- TER-002 / TER-003: el remedio viaja con el fallo ---
#
# El vocabulario es cerrado y de tres valores porque la tarjeta tiene tres afordancias:
# reintentar, enlazar a Conexiones, o nada. Un booleano «reintentable» no distingue las
# dos últimas, que es justo la decisión que hay que tomar.
#
# La regla es una lista de NO reintentables, nunca al revés: el campo `error` no siempre
# contiene un código —hay tools que meten ahí una frase humana— y con la lista invertida
# cualquier código nuevo perdería el botón sin que nadie lo hubiera decidido.

def test_ter_003_el_fallo_transitorio_de_n8n_conserva_el_reintento():
    estado, mensaje, remedio = _clasifica({"error": True, "message": "n8n devolvió 502"})

    assert estado == "error"
    assert mensaje == "n8n devolvió 502"
    assert remedio == "retry"


def test_ter_002_falta_de_credencial_enlaza_a_conexiones():
    estado, mensaje, remedio = _clasifica({
        "error": "linkedin_not_configured",
        "hint": "Conecta LinkedIn en Settings → Connections.",
    })

    assert estado == "error"
    assert mensaje == "Conecta LinkedIn en Settings → Connections."
    assert remedio == "connect"


def test_ter_002_falta_de_oauth_tambien_enlaza_a_conexiones():
    estado, _, remedio = _clasifica({"error": "github_not_connected"})

    assert estado == "error"
    assert remedio == "connect"


def test_ter_002_contacto_no_autorizado_enlaza_a_contactos():
    """QA-1: sí hay algo que hacer, y hasta ahora la tarjeta no lo ofrecía.

    `none` significa «no hay acción posible», y aquí la hay y es concreta:
    dar de alta el contacto en Ajustes → Contactos. Clasificarlo como `none`
    dejaba al usuario con un mensaje que nombra una pantalla y ningún modo de
    llegar a ella.
    """
    estado, _, remedio = _clasifica({"error": "contact_not_authorized"})

    assert estado == "error"
    assert remedio == "whitelist"


def test_ter_002_la_falta_de_contexto_sigue_sin_ofrecer_nada():
    """El otro código de `_CODIGOS_SIN_ACCION` no se mueve: ahí no hay remedio."""
    estado, _, remedio = _clasifica({"error": "user_context_missing"})

    assert estado == "error"
    assert remedio == "none"


def test_ter_002_falta_de_contexto_de_usuario_no_ofrece_nada():
    estado, _, remedio = _clasifica({"error": "user_context_missing"})

    assert estado == "error"
    assert remedio == "none"


def test_ter_003_un_codigo_que_nadie_ha_visto_conserva_el_boton():
    """El defecto es `retry`: lo desconocido conserva la conducta de hoy."""
    estado, _, remedio = _clasifica({"error": "algo_que_nadie_ha_visto"})

    assert estado == "error"
    assert remedio == "retry"


def test_ter_003_un_error_de_api_del_remoto_es_reintentable():
    estado, _, remedio = _clasifica({"error": "notion_api_error"})

    assert estado == "error"
    assert remedio == "retry"


def test_ter_003_el_campo_error_con_una_frase_humana_cae_al_defecto():
    """`error` no siempre es un código: aquí es copy. Cae a `retry`, que es lo correcto."""
    estado, mensaje, remedio = _clasifica({"error": "Debes proporcionar task_id o assigned_to"})

    assert estado == "error"
    assert mensaje == "Debes proporcionar task_id o assigned_to"
    assert remedio == "retry"


def test_ter_002_el_remedio_solo_toma_los_valores_del_vocabulario():
    """El vocabulario es cerrado: cuatro afordancias, cuatro valores.

    `whitelist` entra con QA-1 porque la tarjeta gana un cuarto destino —Ajustes
    → Contactos— que no es ninguno de los otros tres.
    """
    remedios = {
        _clasifica({"error": True, "message": "M"})[2],
        _clasifica({"error": "whatsapp_not_configured"})[2],
        _clasifica({"error": "slack_not_connected"})[2],
        _clasifica({"error": "contact_not_authorized"})[2],
        _clasifica({"error": "user_context_missing"})[2],
        _clasifica({"error": "cualquier_cosa"})[2],
    }

    assert remedios == {"retry", "connect", "none", "whitelist"}


def test_ter_002_el_exito_y_la_confirmacion_no_inventan_remedio():
    """El remedio sólo tiene sentido dentro del estado «fallo»."""
    assert _clasifica({"ok": True})[2] == ""
    assert _clasifica({"error": "confirmation_required", "action_summary": "S"})[2] == ""
