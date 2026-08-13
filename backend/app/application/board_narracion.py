"""Termómetro de narración falsa en la junta. No es un guardarraíl.

`junta-honesta` mata la causa determinista de que un director narre acciones que
no ocurren: su identidad ya no le anuncia herramientas en modo junta. No mata la
posibilidad — eso es una propiedad de la salida de un LLM y no hay forma de
afirmarla en un test.

Este módulo existe para poder contestar con un NÚMERO, dentro de dos semanas, a
«¿ha muerto la narración falsa?», en lugar de con una opinión.

QUÉ MIDE
    Que en la misma respuesta aparezcan (a) el nombre de una herramienta del rol
    y (b) un verbo de acción consumada. Co-ocurrencia, nada más.

QUÉ NO MIDE
    Si el director narró de verdad, si el dato que dio era falso, ni ninguna
    propiedad semántica. NO atribuye el verbo a la herramienta: informa de que
    ambos están en el mismo texto.

FALSOS POSITIVOS, ACEPTADOS POR ESCRITO
    El condicional legítimo («habría que mirar la agenda») y la cita del nombre
    de una herramienta en una propuesta. Distinguirlos exige entender la frase,
    y entenderla no es lo que se está construyendo aquí. Un termómetro con
    ruido sigue sirviendo para ver una tendencia; una puerta con ruido, no. Por
    eso esto es lo primero y no lo segundo.

POR QUÉ NO PUEDE CONVERTIRSE EN UNA DEFENSA — es estructural, no una promesa:
    - Devuelve `list[str]`, NUNCA texto: quien llama no tiene con qué reescribir
      la respuesta del director aunque quiera.
    - No importa nada del grafo: ni `state`, ni `messages`, ni el orquestador.
    - Sus llamadas van envueltas en `try/except` y el resultado del nodo se
      retorna sin tocar.
    - Escribe en el log del debate, no en el estado ni en el SSE. El usuario no
      lo ve.
"""
import re

from app.infrastructure.tools.registry import get_tools_for_role

# Acción consumada: el director dice que YA hizo algo. Perífrasis con "he" y
# pretéritos de una palabra. Deliberadamente corta y literal: una lista que
# intente cubrir todas las formas del español acabaría marcando cualquier
# respuesta, y un termómetro que siempre marca fiebre no mide nada.
_VERBOS_CONSUMADOS = re.compile(
    r"he\s+(?:consultado|revisado|enviado|publicado|agendado|ejecutado)"
    r"|consult[ée]|revis[ée]|envi[ée]|publiqu[ée]|agend[ée]|ejecut[ée]",
    re.IGNORECASE,
)


def herramientas_nombradas(texto: str, rol: str) -> list[str]:
    """Nombres de herramientas DEL ROL que aparecen en el texto.

    El vocabulario sale de `get_tools_for_role`, nunca de una lista escrita a
    mano: mover una tool de rol o registrar una nueva se refleja aquí solo.
    Un rol desconocido (`DEVIL`, un agente a medida) recibe únicamente las
    compartidas, que es lo que el registry le daría de verdad.
    """
    if not texto:
        return []

    encontrados = []
    for tool in get_tools_for_role(rol):
        if re.search(rf"\b{re.escape(tool.name)}\b", texto):
            encontrados.append(tool.name)
    return sorted(set(encontrados))


def narracion_sospechosa(texto: str, rol: str) -> list[str]:
    """Co-ocurrencias de `nombre_de_herramienta|verbo_consumado` en el texto.

    Formato: `["get_stock_data|he consultado", ...]`, ordenado y sin repetidos.

    Devuelve `[]` si falta cualquiera de las dos mitades. No lanza: un rol sin
    herramientas o un texto vacío son casos normales, no errores.
    """
    nombres = herramientas_nombradas(texto, rol)
    if not nombres:
        return []

    verbos = sorted({
        " ".join(m.group(0).lower().split())
        for m in _VERBOS_CONSUMADOS.finditer(texto)
    })
    if not verbos:
        return []

    return sorted(f"{nombre}|{verbo}" for nombre in nombres for verbo in verbos)
