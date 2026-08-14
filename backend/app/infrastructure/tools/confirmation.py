"""Gate de confirmación aplicado al REGISTRAR la herramienta.

── Por qué aquí y no dentro de cada tool ───────────────────────────────────
El fallo que esto cierra es de los que no se ven: cuatro herramientas estaban
declaradas como destructivas en `DESTRUCTIVE_TOOLS` y ninguna consultaba la
preferencia del usuario. Borraban un evento de calendario o mandaban un
WhatsApp sin preguntar. Un decorador por función habría exigido acordarse en
las nueve —y olvidarse es exactamente la forma del bug—, así que la
comprobación se aplica en `register_shared_tool` / `register_role_tool`: entrar
al catálogo y tener gate son la misma operación.

── Qué NO toca ────────────────────────────────────────────────────────────
Las 5 que ya lo consultan (linkedin, instagram, schedule_post,
github_create_repo, slack_post_message) declaran `confirmed` en su esquema y se
devuelven intactas: envolverlas cambiaría sus resúmenes en castellano por uno
genérico y pondría en riesgo lo que hoy funciona.

Tampoco se toca `dynamic_tool_node`: si el corte ocurriera allí no habría
`on_tool_start`/`on_tool_end`, y el usuario no vería la tarjeta que tiene que
confirmar.
"""
from typing import Callable, Optional

from langchain_core.tools import BaseTool, StructuredTool
from pydantic import Field, create_model

from app.core import contacts_service
from app.core.logger import checkpoint_logger as logger
from app.core.tool_context import (
    DESTRUCTIVE_TOOLS,
    get_current_user_id,
    requires_confirmation,
)

import json


def _confirmation_required_error(tool_name: str, action_summary: str) -> str:
    """Error estructurado que el agente traduce en una pregunta al usuario.

    El usuario acepta en la conversación y el agente reinvoca con
    `confirmed=True`; no hay modal ni evento nuevo que inventar.
    """
    return json.dumps(
        {
            "error": "confirmation_required",
            "tool": tool_name,
            "action_summary": action_summary,
            "hint": (
                f"Esta acción tiene impacto externo y requiere confirmación "
                f"explícita del usuario. Muestra al usuario: '{action_summary}'. "
                f"Si el usuario confirma, llama al tool de nuevo con confirmed=True."
            ),
        },
        ensure_ascii=False,
    )


def _recorta(valor, maximo: int = 80) -> str:
    texto = str(valor)
    return texto if len(texto) <= maximo else f"{texto[:maximo]}…"


# Resúmenes legibles de las 4 que estrenan gate. Se componen SOLO con los
# argumentos: el identificador técnico de la herramienta no se le enseña al
# usuario (TRI-004).
CONFIRMATION_SUMMARIES: dict[str, Callable[[dict], str]] = {
    "calendar_create_event": lambda a: (
        f"Crear el evento «{_recorta(a.get('title', 'sin título'))}» "
        f"el {_recorta(a.get('start_time', 'sin fecha'), 40)}"
    ),
    "calendar_delete_event": lambda a: (
        f"Eliminar definitivamente el evento {_recorta(a.get('event_id', ''), 40)} "
        "del calendario"
    ),
    "whatsapp_send_message": lambda a: (
        f"Enviar un WhatsApp a {_recorta(a.get('to', ''), 40)}: "
        f"«{_recorta(a.get('message', ''))}»"
    ),
    "whatsapp_send_notification": lambda a: (
        f"Enviar una notificación al grupo {_recorta(a.get('group', ''), 40)}: "
        f"«{_recorta(a.get('message', ''))}»"
    ),
}


def _resumen(tool_name: str, argumentos: dict) -> str:
    plantilla = CONFIRMATION_SUMMARIES.get(tool_name)
    if plantilla:
        return plantilla(argumentos)
    # Sin plantilla, el resumen se compone con los argumentos y nada más.
    if not argumentos:
        return "Ejecutar una acción con impacto externo"
    detalle = ", ".join(f"{k}: {_recorta(v, 60)}" for k, v in argumentos.items())
    return f"Ejecutar una acción con impacto externo — {detalle}"


# ── Autorización antes que confirmación ────────────────────────────────────
#
# Herramientas que YA comprueban la whitelist DENTRO de su implementación, con
# el argumento por donde entra el destinatario y el tipo con el que lo
# consultan. Es un espejo de `shared_tools.py`, no una fuente nueva: este mapa
# ADELANTA una comprobación que ya existe y NO se la inventa a ninguna tool que
# hoy no la haga. Añadir aquí una tool sin comprobación propia sería inventarle
# una autorización que nadie decidió.
TOOL_RECIPIENT_ARGS: dict[str, tuple[str, Optional[str]]] = {
    "calendar_create_event": ("attendees", "email"),
    "whatsapp_send_message": ("to", "phone"),
    "whatsapp_send_notification": ("group", None),
}


async def _error_si_el_destinatario_no_esta_autorizado(
    tool_name: str, argumentos: dict
) -> Optional[str]:
    """El mismo error que daría la tool, decidido ANTES de preguntar nada.

    Devuelve `None` cuando no hay nada que objetar —tool sin destinatario,
    argumento ausente, o contacto autorizado— y el gate sigue su curso.
    """
    entrada = TOOL_RECIPIENT_ARGS.get(tool_name)
    if entrada is None:
        return None

    argumento, contact_type = entrada
    destinatarios = argumentos.get(argumento)
    if not destinatarios:
        return None
    if isinstance(destinatarios, str):
        destinatarios = [destinatarios]

    # El user_id viaja por contextvar, no por los argumentos: el esquema de la
    # tool es visible al LLM y el tenant no se le enseña ni se le deja elegir.
    user_id = get_current_user_id()
    if not user_id:
        # Sin usuario no se puede decidir nada. La tool tiene su propia
        # respuesta para este caso (`user_context_missing`) y se la deja dar.
        return None

    for destinatario in destinatarios:
        if await contacts_service.is_authorized(
            user_id, tool_name, destinatario, contact_type
        ):
            continue

        logger.warning(
            f"Blocked {tool_name} por contacto no autorizado (antes de "
            f"confirmar): {destinatario} (user={user_id})"
        )
        # Import diferido a propósito: `shared_tools` importa el registry y el
        # registry importa este módulo, así que a nivel de módulo sería un
        # ciclo. En tiempo de llamada todo está cargado. El error se toma de
        # allí para que haya UNA sola redacción del fallo, no dos que se
        # desincronizan.
        from app.infrastructure.tools.shared_tools import (
            _unauthorized_contact_error,
        )

        return _unauthorized_contact_error(tool_name, destinatario)

    return None


def apply_confirmation_gate(tool: BaseTool) -> BaseTool:
    """Devuelve la tool con gate si es destructiva y aún no lo tiene.

    Idempotente y sin efectos: una tool no destructiva, o una que ya declara
    `confirmed`, se devuelve tal cual (identidad, no copia).
    """
    if tool.name not in DESTRUCTIVE_TOOLS:
        return tool

    schema = getattr(tool, "args_schema", None)
    if schema is None or not hasattr(schema, "model_fields"):
        return tool
    if "confirmed" in schema.model_fields:
        return tool

    original = tool.coroutine
    if original is None:
        return tool

    nombre = tool.name
    schema_confirmable = create_model(
        f"{schema.__name__}Confirmable",
        __base__=schema,
        confirmed=(
            bool,
            Field(
                False,
                description=(
                    "Ponlo a True SOLO después de que el usuario haya confirmado "
                    "explícitamente esta acción en la conversación."
                ),
            ),
        ),
    )

    async def _con_gate(**kwargs) -> str:
        # `confirmed` se saca ANTES de llamar a la original: la función de
        # negocio no sabe nada de este parámetro y no debe recibirlo.
        confirmado = kwargs.pop("confirmed", False)
        if requires_confirmation(nombre) and not confirmado:
            # La autorización se decide ANTES de pedir permiso. Preguntar por
            # algo que la whitelist va a rechazar de todas formas le gasta el
            # turno al usuario y le enseña una acción que no va a ocurrir: eso
            # es lo que vio el QA. Si el destinatario no está autorizado se
            # devuelve el error de la whitelist y no se pregunta jamás.
            #
            # La comprobación DENTRO de la tool se queda: esto adelanta la
            # respuesta, no la sustituye, y por los caminos que no piden
            # confirmación (`never`, o ya confirmado) la única que actúa es
            # aquélla.
            no_autorizado = await _error_si_el_destinatario_no_esta_autorizado(
                nombre, kwargs
            )
            if no_autorizado is not None:
                return no_autorizado
            return _confirmation_required_error(nombre, _resumen(nombre, kwargs))
        return await original(**kwargs)

    return StructuredTool.from_function(
        coroutine=_con_gate,
        name=nombre,
        description=tool.description,
        args_schema=schema_confirmable,
    )
