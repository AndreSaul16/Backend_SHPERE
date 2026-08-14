"""
Endpoint SSE para streaming de tokens en tiempo real.
Multi-tenant: user_id se extrae del JWT y se inyecta en el grafo.
Distributed lock previene concurrencia en el mismo thread.

Soporta dos modos:
1. Normal: Un solo agente responde (flujo actual)
2. Board Meeting: Todos los agentes discuten secuencialmente (CEO→CTO→CFO→CMO→CEO conclusión)

Modelo de cobro: 1 crédito por POST a /stream, cobrado AQUÍ antes del grafo.
El orchestrator respeta la bandera already_charged para no volver a cobrar.
"""

import json
import re
from typing import Optional, Any, Literal
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from app.application.artifact_contract import (
    ARTIFACT_MAX_BYTES,
    check_content,
    normalize_type,
    recortar_a_presupuesto,
)
from app.application.orchestrator import app as orchestrator_app
from app.application.orchestrator import board_app as board_orchestrator_app
from app.application.board_v2 import (
    board_v2_app,
    BOARD_NODE_ROLES_V2,
    BOARD_NODE_PHASES_V2,
)
from app.core.auth import get_current_user
from app.core.tenant import require_owner
from app.core.distributed_lock import DistributedLock
from app.core.error_handling import safe_error_response
from app.core.logger import stream_logger as logger

router = APIRouter()


CONFIRMATION_REQUIRED = "confirmation_required"

ToolOutcome = Literal["result", "error", "confirmation"]

# Vocabulario cerrado de remedios: la tarjeta tiene exactamente tres afordancias.
ToolRemedy = Literal["retry", "connect", "none"]

# Por defecto se reintenta: lo desconocido conserva la conducta de hoy y sólo lo
# probadamente imposible pierde el botón.
DEFAULT_REMEDY: ToolRemedy = "retry"

# El remedio sólo tiene sentido dentro del estado «fallo». En éxito y en confirmación no
# aplica, y decir "retry" ahí sería afirmar algo falso sobre algo que no falló.
NO_REMEDY = ""

# Códigos que NO se pueden reintentar. Es deliberadamente una lista de NO reintentables y
# no al revés: el campo `error` no siempre contiene un código —hay tools que meten ahí una
# frase humana—, así que con la lista invertida cualquier código nuevo perdería el botón
# sin que nadie lo hubiera decidido.
_SUFIJOS_DE_CONEXION = ("_not_configured", "_not_connected")
_CODIGOS_SIN_ACCION = frozenset({"contact_not_authorized", "user_context_missing"})


def _remedio_para(error) -> ToolRemedy:
    """Qué puede hacer el usuario ante este fallo.

    `connect`: falta una credencial o un OAuth — reintentar no puede funcionar jamás,
    pero conectar sí. `none`: hay que editar una whitelist o rehacer la sesión, y el
    propio `hint` ya dice dónde. `retry`: todo lo demás.
    """
    if not isinstance(error, str):
        return DEFAULT_REMEDY
    if error in _CODIGOS_SIN_ACCION:
        return "none"
    if error.endswith(_SUFIJOS_DE_CONEXION):
        return "connect"
    return DEFAULT_REMEDY


def _classify_tool_output(raw_output: str) -> tuple[ToolOutcome, str, str]:
    """Clasifica el resultado de una tool en uno y solo uno de tres estados.

    Éxito, fallo o pendiente de confirmación. Es el ÚNICO punto de decisión:
    ningún par de estados puede compartir evento porque nadie más clasifica.

    Los errores reales llegan casi siempre como string —`{"error":
    "linkedin_not_configured"}`—, no como `{"error": true}`; tratar solo el
    booleano como fallo pintaba en verde toda la familia de credenciales
    ausentes. `confirmation_required` no es ni una cosa ni la otra: es una
    pregunta al usuario, y ni la ✗ roja ni el ✓ verde la describen.

    Devuelve `(estado, texto, remedio)`, donde el texto es el mensaje de fallo o el
    resumen de la acción pendiente, y queda vacío en caso de éxito. El remedio es lo
    que el usuario puede hacer al respecto y sólo se calcula para los fallos: se decide
    AQUÍ, con el código del error en la mano, porque éste es el único punto de
    clasificación (TRI-001) y porque el mensaje que ve el usuario es copy en castellano,
    no un dato sobre el que se pueda decidir nada.
    """
    if not raw_output or '"error"' not in raw_output:
        return "result", "", NO_REMEDY
    try:
        # El output puede venir envuelto (ToolMessage repr); intentar el JSON directo
        parsed = json.loads(raw_output)
    except (json.JSONDecodeError, TypeError):
        return "result", "", NO_REMEDY
    if not isinstance(parsed, dict):
        return "result", "", NO_REMEDY

    error = parsed.get("error")
    if not error:
        return "result", "", NO_REMEDY

    if error == CONFIRMATION_REQUIRED:
        resumen = (
            parsed.get("action_summary")
            or parsed.get("hint")
            or "Acción pendiente de tu confirmación."
        )
        return "confirmation", str(resumen), NO_REMEDY

    mensaje = parsed.get("message") or parsed.get("hint")
    if not mensaje:
        mensaje = "La herramienta falló." if error is True else error
    return "error", str(mensaje), _remedio_para(error)


async def _safe_refund(credit_manager, charge_ctx, user_id: str, reason: str) -> None:
    """Reembolsa créditos garantizando que un fallo del refund NO deje al usuario
    sin sus créditos en silencio (A3). Si el refund lanza, registramos la deuda en
    la colección `pending_refunds` para reintentarla luego y poder compensar.
    """
    if not (credit_manager and charge_ctx):
        return
    try:
        await credit_manager.arefund(charge_ctx, reason=reason)
        logger.info(f"♻️ Crédito reembolsado ({reason}): {user_id}")
    except Exception as refund_error:
        logger.error(f"Refund falló ({reason}) para {user_id}: {refund_error}")
        try:
            from datetime import datetime, timezone
            from app.infrastructure.database import db
            from app.core.config import settings as _settings

            db.get_sync_client()[_settings.DB_NAME]["pending_refunds"].insert_one({
                "user_id": user_id,
                "reason": reason,
                "charge_ctx": str(charge_ctx),
                "error": str(refund_error),
                "resolved": False,
                "created_at": datetime.now(timezone.utc),
            })
            logger.critical(
                f"Refund pendiente registrado para {user_id} (reason={reason}). "
                "Revisar colección pending_refunds para compensar."
            )
        except Exception as persist_error:
            # Último recurso: log CRITICAL para no perder el rastro.
            logger.critical(
                f"NO se pudo registrar pending_refund para {user_id} "
                f"(reason={reason}): {persist_error}. Crédito potencialmente perdido."
            )


class StreamRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=10_000)
    session_id: str
    target_role: Optional[str] = None
    regenerate: bool = False  # True cuando el frontend regenera un mensaje del board


# Regex para validar y parsear la etiqueta de apertura
OPEN_TAG_PATTERN = re.compile(r"<sphere_artifact\s+([^>]+)>")


def _cierre_forzado(artifact_buffer: str, razon: str) -> list[str]:
    """Eventos SSE que cierran un artefacto que el modelo dejó abierto.

    DEVUELVE la lista, no la emite. Ésa es la clave: emitir desde aquí obligaría
    a que la función fuese un generador y a llamarla desde un solo sitio. Al
    devolver, los dos únicos puntos donde un `yield` es legal —el final del
    camino normal y la rama `except Exception`— pueden usarla igual.

    Lo que NO se hace nunca es llamarla desde un `finally` alrededor del bucle:
    en un generador asíncrono el `finally` también corre cuando el cliente se
    desconecta, y un `yield` después de `GeneratorExit` produce
    `RuntimeError: async generator ignored GeneratorExit`.

    El resto retenido en `artifact_buffer` se emite antes de cerrar: es contenido
    del artefacto que quedó esperando una etiqueta de cierre que nunca llegó, y
    descartarlo es perder texto que el usuario ya había pagado.
    """
    eventos: list[str] = []
    if artifact_buffer:
        eventos.append(
            f"data: {json.dumps({'type': 'artifact_chunk', 'content': artifact_buffer})}\n\n"
        )
    cierre: dict[str, Any] = {
        "type": "artifact_close",
        "truncated": True,
        "reason": razon,
        # Un contenido incompleto no es un contenido incoherente: lo truncado no
        # se juzga, se declara sin juzgar.
        "content_status": "unchecked",
    }
    if razon == "size_limit":
        cierre["limit_bytes"] = ARTIFACT_MAX_BYTES
    eventos.append(f"data: {json.dumps(cierre)}\n\n")
    return eventos


async def generate_chat_events(
    query: str,
    session_id: str,
    user_id: str,
    target_role: Optional[str] = None,
    board_mode: bool = False,
    board_iterations: Optional[int] = None,
    regenerate: bool = False,
    already_charged: bool = False,
    charge_ctx = None,
    credit_manager = None,
    lock: Optional["DistributedLock"] = None,
    board_v2: bool = False,
    board_devil: bool = False,
):
    """Generador asíncrono con aislamiento multi-tenant.

    Args:
        query: Mensaje del usuario
        session_id: ID de la sesión
        user_id: ID del usuario (Firebase UID)
        target_role: Rol objetivo (None para grupo, "CEO"/"CTO"/etc para directo)
        board_mode: True si el usuario tiene Board Meeting activado
        regenerate: True si el frontend está regenerando (no crear mensaje nuevo, saltar agentes ya respondidos)
        already_charged: True si el crédito ya fue cobrado en el endpoint
        charge_ctx: Contexto del cobro para refund en caso de error
        credit_manager: Instancia del CreditManager para refund
    """
    # Estado del artefacto en curso. Vive FUERA del `try` a propósito: la rama
    # `except Exception` necesita saber si quedó un artefacto abierto para
    # cerrarlo antes de avisar del fallo, y un fallo temprano (antes del bucle)
    # dejaría estos nombres sin definir.
    artifact_buffer = ""
    is_inside_artifact = False
    artifact_type_actual = "code"  # tipo ya normalizado del artefacto en curso
    artifact_visto = ""            # lo emitido, para juzgar coherencia al cerrar
    artifact_bytes = 0             # bytes ya emitidos de este artefacto
    artifact_cortado = False       # True tras agotar el presupuesto: ya se cerró
    try:
        mode_str = "BOARD MEETING" if board_mode else "NORMAL"
        logger.info(
            f"Iniciando stream [{mode_str}] para sesión: {session_id} | User: {user_id} | Query: '{query[:50]}...'"
        )

        # thread_id multi-tenant: user_id:session_id
        thread_id = f"{user_id}:{session_id}"
        config = {"configurable": {"thread_id": thread_id, "checkpoint_ns": ""}}

        from langchain_core.messages import HumanMessage

        new_message = HumanMessage(content=query)

        # Estado inicial base sin board_agents_done — cuando es regeneración,
        # LangGraph usa el valor del checkpoint (agentes que ya respondieron).
        initial_state: dict[str, Any] = {
            "query": query,
            "messages": [new_message],
            "target_role": target_role,
            "user_id": user_id,
            "session_id": session_id,
            "already_charged": already_charged,
            "board_mode": board_mode,
            "board_iteration": 0,
            "board_max_iterations": board_iterations or 1,
            "board_iterations_pref": board_iterations,
            "board_regenerate": regenerate,
            "board_devil": board_devil,
        }
        # Solo inicializar board_agents_done en un board meeting NUEVO.
        # En regeneración, el checkpoint ya tiene la lista correcta y la usamos
        # para saltar agentes que ya respondieron.
        if not regenerate:
            initial_state["board_agents_done"] = []

        # Choose the right orchestrator: V2 (debate paralelo) > legacy board > normal.
        if board_mode and board_v2:
            active_orchestrator = board_v2_app
        elif board_mode:
            active_orchestrator = board_orchestrator_app
        else:
            active_orchestrator = orchestrator_app

        buffer = ""
        current_board_agent = None  # Track which agent is speaking in board mode
        announced_board_nodes: set = set()  # Dedup de board_agent por NODO (no por rol)
        partial_refund_done = False  # Refund parcial del triage emitido una sola vez
        # Nodos del board legacy → rol que habla. Incluye "conclusion" (CEO),
        # que el filtro antiguo ('board' in node_name) NO detectaba (bug).
        BOARD_NODE_ROLES_LEGACY = {
            "ceo_board": "CEO",
            "cto_board": "CTO",
            "cfo_board": "CFO",
            "cmo_board": "CMO",
            "conclusion": "CEO",
        }
        # Mapa unificado nodo→rol según el grafo activo.
        BOARD_NODE_ROLES = BOARD_NODE_ROLES_V2 if board_v2 else BOARD_NODE_ROLES_LEGACY
        # Nodos cuyo cierre indica conclusión/síntesis (is_conclusion=True).
        CONCLUSION_NODES = {"synthesis"} if board_v2 else {"conclusion"}

        def _node_role(node_name: str) -> Optional[str]:
            return BOARD_NODE_ROLES.get(node_name)
        # Token cap tracking: accumulate tokens from on_chat_model_end events
        # to call aadjust_after_completion after the stream completes.
        total_tokens_in = 0
        total_tokens_out = 0

        # Señal de inicio para la UI: ¿es un Board Meeting? Si la UI NO recibe
        # 'board_start', el board no se activó (diagnóstico claro). Además da el
        # "X entró al grupo" estilo WhatsApp.
        # En regeneración NO emitimos board_start: los agentes ya están en el chat
        # y solo estamos regenerando la conclusión (o el último agente).
        if board_mode and not regenerate:
            try:
                yield f"data: {json.dumps({'type': 'board_start', 'agents': ['CEO', 'CTO', 'CFO', 'CMO'], 'iterations': board_iterations or 'auto'})}\n\n"
            except Exception as exc:
                logger.debug(f"No se pudo emitir board_start: {exc}")

        async for event in active_orchestrator.astream_events(
            initial_state, config=config, version="v1"
        ):
            kind = event["event"]

            # --- A0. INICIO DE NODO BOARD: marcar quién EMPIEZA a hablar ---
            # Usamos on_chain_start para que el marcador del agente llegue ANTES de
            # sus tokens. FIX bug duplicado: dedup por NOMBRE DE NODO (no por rol).
            # Antes la "excepción conclusión" hacía que el cierre de synthesis/conclusion
            # se anunciara dos veces (on_chain_start + fallback on_chain_end).
            if kind == "on_chain_start":
                try:
                    node_name = event.get("name", "")
                    role = _node_role(node_name)
                    if role and node_name not in announced_board_nodes:
                        announced_board_nodes.add(node_name)
                        is_conclusion = node_name in CONCLUSION_NODES
                        phase = BOARD_NODE_PHASES_V2.get(node_name) if board_v2 else None
                        current_board_agent = role
                        logger.debug(f"Board: {role} empieza a hablar ({node_name})")
                        payload = {"type": "board_agent", "role": role, "is_conclusion": is_conclusion}
                        if phase:
                            payload["phase"] = phase
                        yield f"data: {json.dumps(payload)}\n\n"
                        if phase:
                            yield f"data: {json.dumps({'type': 'board_phase', 'phase': phase})}\n\n"
                except Exception as exc:
                    logger.debug(f"on_chain_start board marker falló: {exc}")

            # --- A. DETECCIÓN DE ROL (Router / fallback board) + EVENTOS V2 ---
            if kind == "on_chain_end":
                node_name = event.get("name", "")

                # Normal mode: router detects agent
                if node_name == "router":
                    output = event.get("data", {}).get("output")
                    if output and "next_agent" in output:
                        role = output["next_agent"]
                        logger.debug(f"Router detectó agente: {role}")
                        yield f"data: {json.dumps({'type': 'meta', 'role': role})}\n\n"

                # Fallback: si no llegó on_chain_start del nodo board, marcarlo al
                # cerrar. Dedup por NOMBRE DE NODO garantiza una sola emisión.
                board_role = _node_role(node_name)
                if board_role and node_name not in announced_board_nodes:
                    announced_board_nodes.add(node_name)
                    is_board_conclusion = node_name in CONCLUSION_NODES
                    phase = BOARD_NODE_PHASES_V2.get(node_name) if board_v2 else None
                    current_board_agent = board_role
                    payload = {"type": "board_agent", "role": board_role, "is_conclusion": is_board_conclusion}
                    if phase:
                        payload["phase"] = phase
                    yield f"data: {json.dumps(payload)}\n\n"

                # --- Eventos exclusivos de Board V2 ---
                if board_v2:
                    output = event.get("data", {}).get("output") or {}
                    # board_plan tras el triage (+ refund parcial si baja a 2 directores)
                    if node_name == "triage" and not partial_refund_done:
                        partial_refund_done = True
                        participants = output.get("board_participants") or ["CTO", "CFO", "CMO"]
                        from app.application.credit_manager import BOARD_MEETING_COST, BOARD_REDUCED_COST
                        cost = BOARD_REDUCED_COST if len(participants) <= 2 else BOARD_MEETING_COST
                        if cost < BOARD_MEETING_COST and already_charged and charge_ctx and credit_manager is not None and not regenerate:
                            try:
                                await credit_manager.apartial_refund(charge_ctx, BOARD_MEETING_COST - cost)
                            except Exception as exc:
                                logger.error(f"Partial refund board falló: {exc}")
                        yield f"data: {json.dumps({'type': 'board_plan', 'participants': participants, 'cost': cost})}\n\n"
                    # board_vote tras cada director (analysis/rebuttal)
                    if isinstance(output, dict) and output.get("board_votes"):
                        for vrole, vdata in output["board_votes"].items():
                            if vrole == "__RESET__" or not isinstance(vdata, dict):
                                continue
                            yield f"data: {json.dumps({'type': 'board_vote', 'role': vrole, 'vote': vdata.get('decision'), 'confidence': vdata.get('confidence')})}\n\n"
                    # board_consensus tras el gate
                    if node_name in ("consensus_gate", "rebuttal_join"):
                        from app.application.board_v2 import _tally
                        # El tally se calcula leyendo el estado acumulado vía aget_state.
                        try:
                            snap = await active_orchestrator.aget_state(config)
                            valores = snap.values or {}
                            tally = _tally(
                                valores.get("board_votes", {}), valores.get("board_participants")
                            )
                            # Campos aditivos: un cliente que sólo lea unanimous/tally sigue funcionando.
                            # El early-exit se LEE del recuento; aquí sólo se matiza cuándo se anuncia.
                            consensus_payload = {
                                "type": "board_consensus",
                                "unanimous": tally["unanimous"],
                                "tally": tally["counts"],
                                "expected": tally["expected"],
                                "total_decisivos": tally["total_decisivos"],
                                "outcome": tally["outcome"],
                                "winner": tally["winner"],
                                "early_exit": tally["early_exit"] and node_name == "consensus_gate",
                            }
                            yield f"data: {json.dumps(consensus_payload)}\n\n"
                        except Exception as exc:
                            logger.debug(f"board_consensus snapshot falló: {exc}")
                    # board_intervention: si el gate/join/síntesis inyectó una intervención
                    if node_name in ("consensus_gate", "rebuttal_join", "synthesis") and isinstance(output, dict):
                        for m in output.get("messages", []) or []:
                            content = getattr(m, "content", "")
                            if isinstance(content, str) and content.startswith("[INTERVENCIÓN DEL FUNDADOR"):
                                yield f"data: {json.dumps({'type': 'board_intervention', 'text': content})}\n\n"

            # --- A2. CHAT MODEL END — acumular tokens para ajuste post-stream ---
            if kind == "on_chat_model_end":
                output = event.get("data", {}).get("output")
                if output:
                    usage = getattr(output, "usage_metadata", None)
                    if usage:
                        tokens_in = int(usage.get("input_tokens", 0) or 0)
                        tokens_out = int(usage.get("output_tokens", 0) or 0)
                        total_tokens_in += tokens_in
                        total_tokens_out += tokens_out

            # --- B. TOOL EXECUTION EVENTS ---
            if kind == "on_tool_start":
                tool_name = event.get("name", "unknown_tool")
                tool_input = event.get("data", {}).get("input", {})
                logger.info(f"🔧 Tool start: {tool_name}")
                yield f"data: {json.dumps({'type': 'tool_start', 'tool_name': tool_name, 'args': tool_input})}\n\n"

            if kind == "on_tool_end":
                tool_name = event.get("name", "unknown_tool")
                raw_output = event.get("data", {}).get("output", "")
                if not isinstance(raw_output, str):
                    raw_output = getattr(raw_output, "content", None) or str(raw_output)
                tool_output = raw_output[:500]
                estado, texto, remedio = _classify_tool_output(raw_output)
                if estado == "error":
                    logger.warning(f"⚠️ Tool error: {tool_name}: {texto[:200]}")
                    yield f"data: {json.dumps({'type': 'tool_error', 'tool_name': tool_name, 'error': texto[:300], 'remedy': remedio})}\n\n"
                elif estado == "confirmation":
                    logger.info(f"⏸️ Tool pendiente de confirmación: {tool_name}")
                    yield f"data: {json.dumps({'type': 'tool_confirmation', 'tool_name': tool_name, 'summary': texto[:300]})}\n\n"
                else:
                    logger.info(f"✅ Tool end: {tool_name}")
                    yield f"data: {json.dumps({'type': 'tool_result', 'tool_name': tool_name, 'result': tool_output})}\n\n"

            if kind == "on_tool_error":
                tool_name = event.get("name", "unknown_tool")
                exc = event.get("data", {}).get("error")
                logger.warning(f"⚠️ Tool raised: {tool_name}: {exc}")
                # Excepción cruda: no hay código que clasificar, así que cae al defecto.
                yield f"data: {json.dumps({'type': 'tool_error', 'tool_name': tool_name, 'error': str(exc)[:300], 'remedy': DEFAULT_REMEDY})}\n\n"

            # --- C. STREAMING DE TOKENS ---
            if kind == "on_chat_model_stream":
                chunk = event.get("data", {}).get("chunk")
                if chunk is None:
                    continue

                # En board mode (esp. V2 con nodos en paralelo) el rol que habla se
                # deriva del nodo LangGraph que emite este token concreto. Así los
                # tokens de cto/cfo/cmo que llegan intercalados se etiquetan bien.
                if board_mode:
                    node_now = (event.get("metadata") or {}).get("langgraph_node")
                    role_now = _node_role(node_now) if node_now else None
                    if role_now:
                        current_board_agent = role_now

                # --- C0. RAZONAMIENTO (chain-of-thought de modelos reasoning) ---
                # DeepSeek (deepseek-v4-pro) emite el razonamiento en
                # additional_kwargs.reasoning_content, SEPARADO de content. Mientras
                # el modelo "piensa", content viene vacío y antes lo descartábamos.
                # Lo capturamos y lo emitimos como evento 'thinking' para la UI.
                try:
                    ak = getattr(chunk, "additional_kwargs", None)
                    reasoning_piece = (
                        (ak.get("reasoning_content") or ak.get("reasoning"))
                        if isinstance(ak, dict)
                        else None
                    )
                    if reasoning_piece:
                        yield f"data: {json.dumps({'type': 'thinking', 'role': current_board_agent, 'content': reasoning_piece})}\n\n"
                        continue
                except Exception as exc:
                    logger.debug(f"No se pudo extraer reasoning_content: {exc}")

                if hasattr(chunk, "content"):
                    content = chunk.content
                    if not content:
                        continue

                    if is_inside_artifact:
                        artifact_buffer += content

                        if "</sphere_artifact>" in artifact_buffer:
                            logger.debug("🔒 Cierre de artefacto detectado")
                            artifact_content, chat_residue = artifact_buffer.split(
                                "</sphere_artifact>", 1
                            )

                            # Si el artefacto ya se cortó por presupuesto, su
                            # cierre ya viajó: aquí sólo se recoge la mesa y se
                            # devuelve el turno al chat.
                            if not artifact_cortado:
                                trozo, nuevos, agotado = recortar_a_presupuesto(
                                    artifact_content, artifact_bytes
                                )
                                artifact_bytes += nuevos
                                if trozo:
                                    artifact_visto += trozo
                                    yield f"data: {json.dumps({'type': 'artifact_chunk', 'content': trozo})}\n\n"

                                if agotado:
                                    for evento in _cierre_forzado("", "size_limit"):
                                        yield evento
                                else:
                                    yield f"data: {json.dumps({'type': 'artifact_close', 'content_status': check_content(artifact_type_actual, artifact_visto)})}\n\n"

                            is_inside_artifact = False
                            artifact_cortado = False
                            artifact_buffer = ""
                            artifact_visto = ""
                            artifact_bytes = 0

                            if chat_residue:
                                yield f"data: {json.dumps({'type': 'token', 'content': chat_residue, 'role': current_board_agent})}\n\n"

                            buffer = ""
                        elif artifact_cortado:
                            # Presupuesto agotado: se sigue leyendo para no
                            # perder el cierre, pero no se emite ni un byte más
                            # y no se acumula (un modelo en bucle escribiría
                            # megas). Se conserva sólo la cola que podría
                            # contener el principio de la etiqueta de cierre.
                            artifact_buffer = artifact_buffer[-len("</sphere_artifact>"):]
                        else:
                            close_prefixes = [
                                "<",
                                "</",
                                "</s",
                                "</sp",
                                "</sph",
                                "</sphe",
                                "</spher",
                                "</sphere",
                                "</sphere_",
                                "</sphere_a",
                                "</sphere_ar",
                                "</sphere_art",
                                "</sphere_arti",
                                "</sphere_artif",
                                "</sphere_artifa",
                                "</sphere_artifac",
                                "</sphere_artifact",
                            ]

                            if not any(
                                artifact_buffer.endswith(p) for p in close_prefixes
                            ):
                                if "<sphere_artifact" in artifact_buffer:
                                    artifact_buffer = re.sub(
                                        r"<sphere_artifact[^>]*>", "", artifact_buffer
                                    )

                                if artifact_buffer:
                                    trozo, nuevos, agotado = recortar_a_presupuesto(
                                        artifact_buffer, artifact_bytes
                                    )
                                    artifact_bytes += nuevos
                                    artifact_buffer = ""
                                    if trozo:
                                        artifact_visto += trozo
                                        yield f"data: {json.dumps({'type': 'artifact_chunk', 'content': trozo})}\n\n"

                                    if agotado:
                                        # El artefacto se corta aquí, pero el
                                        # turno NO: matar el stream reabriría la
                                        # ruta de reembolso por un caso que no
                                        # la necesita y perdería texto útil.
                                        logger.warning(
                                            f"✂️ Artefacto cortado en {ARTIFACT_MAX_BYTES} bytes "
                                            f"(sesión {session_id})"
                                        )
                                        for evento in _cierre_forzado("", "size_limit"):
                                            yield evento
                                        artifact_cortado = True

                    else:
                        buffer += content
                        if "<sphere_artifact" in buffer:
                            tag_start = buffer.find("<sphere_artifact")
                            tag_section = buffer[tag_start:]
                            if ">" in tag_section:
                                match = OPEN_TAG_PATTERN.search(buffer)
                                if match:
                                    attrs_str = match.group(1)
                                    title_match = re.search(
                                        r'title="([^"]+)"', attrs_str
                                    )
                                    type_match = re.search(r'type="([^"]+)"', attrs_str)
                                    lang_match = re.search(
                                        r'language="([^"]*)"', attrs_str
                                    )

                                    title = (
                                        title_match.group(1)
                                        if title_match
                                        else "untitled"
                                    )
                                    # El tipo se contrasta con la lista blanca
                                    # ANTES de emitir un solo byte de contenido:
                                    # es el único momento en que todavía se
                                    # puede etiquetar sin haber enseñado nada.
                                    declared_type = (
                                        type_match.group(1) if type_match else None
                                    )
                                    artifact_type, type_status = normalize_type(
                                        declared_type
                                    )
                                    language = lang_match.group(1) if lang_match else ""

                                    logger.info(
                                        f"📦 Abriendo artefacto: '{title}' ({artifact_type})"
                                    )
                                    if type_status == "unknown":
                                        logger.warning(
                                            f"❓ Tipo de artefacto no reconocido: "
                                            f"{declared_type!r} → se abre como código"
                                        )

                                    pre_tag = buffer[:tag_start]
                                    if pre_tag.strip():
                                        yield f"data: {json.dumps({'type': 'token', 'content': pre_tag, 'role': current_board_agent})}\n\n"

                                    apertura: dict[str, Any] = {
                                        "type": "artifact_open",
                                        "title": title,
                                        "artifact_type": artifact_type,
                                        "language": language,
                                        "type_status": type_status,
                                    }
                                    if type_status != "ok":
                                        # El literal que escribió el modelo se
                                        # conserva tal cual: es lo que el usuario
                                        # tiene que leer para entender el aviso.
                                        apertura["declared_type"] = declared_type
                                    yield f"data: {json.dumps(apertura)}\n\n"

                                    is_inside_artifact = True
                                    artifact_type_actual = artifact_type
                                    artifact_visto = ""
                                    artifact_bytes = 0
                                    artifact_cortado = False
                                    tag_end = tag_section.find(">")
                                    residue = tag_section[tag_end + 1 :]
                                    if residue:
                                        trozo, nuevos, _ = recortar_a_presupuesto(
                                            residue, artifact_bytes
                                        )
                                        artifact_bytes += nuevos
                                        if trozo:
                                            artifact_visto += trozo
                                            yield f"data: {json.dumps({'type': 'artifact_chunk', 'content': trozo})}\n\n"

                                    buffer = ""
                        else:
                            partial_tags = [
                                "<s",
                                "<sp",
                                "<sph",
                                "<sphe",
                                "<spher",
                                "<sphere",
                                "<sphere_",
                                "<sphere_a",
                                "<sphere_ar",
                                "<sphere_art",
                                "<sphere_arti",
                                "<sphere_artif",
                                "<sphere_artifa",
                                "<sphere_artifac",
                                "<sphere_artifact",
                            ]

                            if not any(buffer.endswith(p) for p in partial_tags):
                                yield f"data: {json.dumps({'type': 'token', 'content': buffer, 'role': current_board_agent})}\n\n"
                                buffer = ""

        # El modelo terminó de hablar con un artefacto todavía abierto: se vuelca
        # lo retenido y se cierra. Sin esto el canal del artefacto se queda
        # abierto en el cliente y el resto de `artifact_buffer` se pierde.
        # El modelo terminó de hablar con un artefacto todavía abierto: se vuelca
        # lo retenido y se cierra. Sin esto el canal del artefacto se queda
        # abierto en el cliente y el resto de `artifact_buffer` se pierde.
        # Si ya se cortó por presupuesto, su cierre viajó hace rato: cerrar otra
        # vez le daría al cliente dos cierres para una sola apertura.
        if is_inside_artifact:
            if not artifact_cortado:
                for evento in _cierre_forzado(artifact_buffer, "stream_ended"):
                    yield evento
            is_inside_artifact = False
            artifact_cortado = False
            artifact_buffer = ""

        if buffer.strip():
            yield f"data: {json.dumps({'type': 'token', 'content': buffer, 'role': current_board_agent})}\n\n"

        # Token cap adjustment: si el stream cobró (already_charged=True) y
        # la inferencia superó el cap de 4k tokens, cobrar mensaje extra.
        # Esto es SEPARADO del charge inicial — siempre debe ejecutarse.
        if already_charged and charge_ctx and credit_manager is not None and (total_tokens_in + total_tokens_out) > 0:
            from app.core.llm_models import pricing_for, DEEPSEEK_REASONING
            _price = pricing_for(DEEPSEEK_REASONING)
            cost_actual = (total_tokens_in * _price["input"] + total_tokens_out * _price["output"]) / 1_000_000
            try:
                await credit_manager.aadjust_after_completion(
                    charge_ctx, total_tokens_in, total_tokens_out, cost_actual
                )
                logger.debug(
                    f"Post-stream adjustment: {total_tokens_in}+{total_tokens_out} tokens "
                    f"para user {user_id}"
                )
            except Exception as e:
                logger.error(f"Error en post-stream adjustment para {user_id}: {e}")

        yield "data: [DONE]\n\n"
        logger.info(f"Stream finalizado para sesión: {session_id}")

    except GeneratorExit:
        logger.info(f"🛑 Cliente desconectado (Stop Generation): {session_id}")
        # Aquí NO se cierra el artefacto aunque quede abierto: un `yield` tras
        # `GeneratorExit` da `RuntimeError: async generator ignored GeneratorExit`,
        # y el cliente ya no escucha — `stopGeneration` limpia el canal en el
        # navegador (`frontend/src/store/chat/messagesSlice.ts`).
        if already_charged:
            await _safe_refund(credit_manager, charge_ctx, user_id, "client_disconnected")
        return
    except Exception as e:
        # Refund on error: si ya cobramos el crédito, devolverlo (sin perderlo en
        # silencio si el propio refund falla — ver _safe_refund).
        if already_charged:
            await _safe_refund(credit_manager, charge_ctx, user_id, "inference_failed")
        # El artefacto se cierra ANTES de pintar el fallo: si el aviso llegara
        # primero, el panel se quedaría con el artefacto "en curso" para siempre.
        if is_inside_artifact:
            if not artifact_cortado:
                for evento in _cierre_forzado(artifact_buffer, "stream_ended"):
                    yield evento
            is_inside_artifact = False
            artifact_cortado = False
            artifact_buffer = ""
        error = safe_error_response(e)
        yield f"data: {json.dumps({'type': 'error', 'message': error['message']})}\n\n"
        yield "data: [DONE]\n\n"
    finally:
        if lock is not None:
            await lock.release()


@router.post("/")
async def chat_stream_endpoint(
    request: StreamRequest,
    user: dict = Depends(get_current_user),
):
    """Endpoint SSE para streaming de respuestas. Multi-tenant con distributed lock.
    
    Cobro de crédito: 1 crédito por POST, aquí ANTES del grafo.
    El orchestrator recibe already_charged=True y no vuelve a cobrar.
    """
    try:
        user_id = user["firebase_uid"]

        # Per-plan rate limit: se resuelve AQUÍ después de saber el plan del usuario.
        # Rate limit por usuario (in-memory por proceso, ver app/core/rate_limit.py).
        from app.core.plan_limits import RATE_LIMIT_CHAT_BY_PLAN
        from app.core.rate_limit import chat_rate_limiter

        plan_id = (user.get("subscription") or {}).get("plan_id", "free")
        times, seconds = RATE_LIMIT_CHAT_BY_PLAN.get(plan_id, RATE_LIMIT_CHAT_BY_PLAN["free"])
        if not chat_rate_limiter.try_acquire(user_id, times, seconds):
            raise HTTPException(
                status_code=429,
                detail={
                    "error": "rate_limit_exceeded",
                    "message": f"Rate limit exceeded. Tu plan ({plan_id}) permite {times} requests por {seconds}s.",
                },
            )

        # Email verification gate — debe ir ANTES del credit check.
        # Es un gate de autorización más fundamental que el billing.
        subscription = user.get("subscription") or {}
        if subscription.get("status") == "email_unverified":
            raise HTTPException(
                status_code=403,
                detail={
                    "error": "email_unverified",
                    "message": "Verifica tu email antes de usar SPHERE.",
                },
            )

        # ── 1. Resolver sesión + target_role + board_mode ANTES de cobrar ──
        # Cobramos el coste correcto (board meeting = 5 créditos) y evitamos cobrar
        # si la sesión no es del usuario o el agente custom fue eliminado (422).
        from app.infrastructure.database import (
            get_sessions_collection,
            get_custom_agents_collection,
            get_users_collection,
        )

        sessions_collection = get_sessions_collection()
        session_doc = await sessions_collection.find_one(
            {"session_id": request.session_id}
        )
        require_owner(session_doc, user_id, "Sesión")

        final_target_role = request.target_role
        board_mode = False
        board_iterations = None
        board_devil = False

        if not final_target_role and session_doc:
            # Detección ROBUSTA de sesión de grupo: no dependemos solo de `type`,
            # porque sesiones antiguas pueden no tenerlo (→ default "direct" y el
            # board nunca se disparaba). También la inferimos por base_agent_id
            # ('group-chat'/'system') o por tener >1 miembro.
            session_type = session_doc.get("type", "direct")
            session_members = session_doc.get("members") or []
            session_base = session_doc.get("base_agent_id")
            is_group = (
                session_type == "group"
                or session_base in ("group-chat", "system")
                or len(session_members) > 1
            )
            if is_group:
                final_target_role = None
                logger.info(
                    f"Sesión GROUP detectada (type={session_type}, base={session_base}, "
                    f"members={len(session_members)}): clasificará router/board"
                )

                # Board meeting habilitado para este usuario?
                users_col = get_users_collection()
                user_doc = await users_col.find_one(
                    {"firebase_uid": user_id},
                    {"board_meeting_enabled": 1, "board_iterations": 1, "board_devils_advocate": 1},
                )
                if user_doc and user_doc.get("board_meeting_enabled", False):
                    board_mode = True
                    board_devil = bool(user_doc.get("board_devils_advocate", False))
                    # Honrar la preferencia explícita del usuario (1 o 2); si no está
                    # seteada, el classifier decide automáticamente.
                    pref = user_doc.get("board_iterations")
                    if isinstance(pref, int) and pref >= 1:
                        board_iterations = min(pref, 2)
                    logger.info(
                        f"✅ Board Meeting ACTIVADO para user {user_id} "
                        f"(iteraciones={board_iterations or 'auto'}, devil={board_devil})"
                    )
                else:
                    enabled_val = user_doc.get("board_meeting_enabled") if user_doc else "sin-doc-usuario"
                    logger.info(
                        f"⚠️ Sesión GROUP pero Board Meeting DESACTIVADO para {user_id} "
                        f"(board_meeting_enabled={enabled_val}) → responde un solo agente"
                    )
            else:
                agent_ref_type = session_doc.get("agent_ref_type", "core")
                base_agent_id = session_doc.get("base_agent_id", "CEO")

                if agent_ref_type == "custom":
                    agents_col = get_custom_agents_collection()
                    agent = await agents_col.find_one({"agent_id": base_agent_id})
                    if not agent:
                        raise HTTPException(
                            status_code=422,
                            detail="El agente asignado a esta sesión fue eliminado. Crea una nueva sesión.",
                        )

                final_target_role = base_agent_id
                logger.debug(
                    f"Sesión DIRECT ({agent_ref_type}): target_role={final_target_role}"
                )

        # ── 2. Pre-check + cobro del coste correcto (1 normal, 5 board meeting) ──
        from app.application.credit_manager import (
            CreditManager,
            InsufficientCreditsError,
            BOARD_MEETING_COST,
        )
        from app.core.config import settings as app_settings
        from app.infrastructure.database import db

        required = BOARD_MEETING_COST if board_mode else 1
        wallet = user.get("wallet") or {}
        total_balance = (
            wallet.get("pro_messages_balance", 0)
            + wallet.get("topup_messages_balance", 0)
        )
        if total_balance < required:
            msg = (
                f"Un board meeting cuesta {BOARD_MEETING_COST} mensajes y no te quedan "
                "suficientes. Sube de plan o compra un top-up."
                if board_mode
                else "Has agotado tus mensajes. Sube de plan o compra un top-up."
            )
            raise HTTPException(
                status_code=402,
                detail={"error": "insufficient_credits", "message": msg},
            )

        # ── 3. Distributed lock ANTES de cobrar (A12) ──
        # Si cobramos primero y el lock falla, entramos en un ciclo cobro→refund que
        # solo es seguro si el refund nunca falla. Tomando el lock antes, los envíos
        # concurrentes a la misma sesión se serializan y solo el ganador cobra: no hay
        # nada que reembolsar en el caso 409.
        lock = DistributedLock(
            f"checkpoint:{user_id}:{request.session_id}", ttl_seconds=60
        )
        acquired = await lock.acquire()
        if not acquired:
            raise HTTPException(
                status_code=409,
                detail="Tu mensaje anterior aún se está procesando. Espera un momento.",
            )

        # ── 4. Cobro del crédito (ya con el lock en mano) ──
        charge_ctx = None
        credit_manager = None
        try:
            credit_manager = CreditManager(db.get_sync_client()[app_settings.DB_NAME])
            charge_ctx = await credit_manager.areserve_and_charge(
                user_id, "stream", "deepseek-v4-pro", is_board=board_mode
            )
            already_charged = True
        except InsufficientCreditsError:
            await lock.release()
            raise HTTPException(
                status_code=402,
                detail={
                    "error": "insufficient_credits",
                    "message": "Has agotado tus mensajes.",
                },
            )
        except Exception as e:
            await lock.release()
            logger.error(f"Error inesperado al cobrar crédito: {e}")
            raise HTTPException(status_code=500, detail="Error interno al procesar créditos")

        try:
            return StreamingResponse(
                generate_chat_events(
                    request.query,
                    request.session_id,
                    user_id,
                    final_target_role,
                    board_mode,
                    board_iterations=board_iterations,
                    regenerate=request.regenerate,
                    already_charged=already_charged,
                    charge_ctx=charge_ctx,
                    credit_manager=credit_manager,
                    lock=lock,
                    board_v2=(board_mode and app_settings.BOARD_V2_ENABLED),
                    board_devil=board_devil,
                ),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "X-Accel-Buffering": "no",
                },
            )
        except Exception:
            # Falla ANTES de crear el StreamingResponse: liberar lock y reembolsar.
            await lock.release()
            await _safe_refund(credit_manager, charge_ctx, user_id, "stream_setup_failed")
            raise

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"🔥 Error iniciando stream: {e}")
        raise HTTPException(status_code=500, detail="Error interno del servidor")


class InterveneRequest(BaseModel):
    session_id: str
    text: str = Field(..., min_length=1, max_length=1000)


_interventions_index_ready = False


@router.post("/intervene")
async def board_intervene_endpoint(
    request: InterveneRequest,
    user: dict = Depends(get_current_user),
):
    """Encola una intervención del usuario en un debate de board EN CURSO. El grafo V2
    la inyecta como mensaje del fundador antes de la siguiente fase (réplicas o síntesis).
    Sin coste de créditos."""
    global _interventions_index_ready
    user_id = user["firebase_uid"]

    from app.infrastructure.database import get_sessions_collection, db
    from datetime import datetime, timezone

    session_doc = await get_sessions_collection().find_one({"session_id": request.session_id})
    require_owner(session_doc, user_id, "Sesión")

    # Debe haber un debate en curso (lock activo). Si Redis no está disponible,
    # aceptamos best-effort (la intervención se consumirá solo si hay debate).
    try:
        from app.infrastructure.redis_client import _redis_client
        if _redis_client is not None:
            lock_key = f"lock:checkpoint:{user_id}:{request.session_id}"
            exists = await _redis_client.exists(lock_key) if hasattr(_redis_client, "exists") else None
            if exists == 0:
                raise HTTPException(
                    status_code=409,
                    detail="No hay un debate en curso en esta sesión para intervenir.",
                )
    except HTTPException:
        raise
    except Exception as exc:
        logger.debug(f"No se pudo verificar lock para intervención: {exc}")

    col = db.get_async_db()["board_interventions"]
    if not _interventions_index_ready:
        try:
            await col.create_index("created_at", expireAfterSeconds=600)
            await col.create_index([("user_id", 1), ("session_id", 1), ("consumed", 1)])
            _interventions_index_ready = True
        except Exception as exc:
            logger.debug(f"No se pudo crear índice board_interventions: {exc}")

    await col.insert_one({
        "user_id": user_id,
        "session_id": request.session_id,
        "text": request.text.strip(),
        "consumed": False,
        "created_at": datetime.now(timezone.utc),
    })
    logger.info(f"💬 Intervención encolada para {user_id}:{request.session_id}")
    return {"ok": True, "message": "Tu intervención entrará antes de la siguiente fase del debate."}
