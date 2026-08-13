"""Contrato del artefacto: qué tipo se admite, cuánto ocupa y si el contenido
encaja con lo declarado.

Fuente ÚNICA de la lista de tipos. De aquí se derivan el texto del prompt que
lee el modelo (`orchestrator.AGENT_PROMPT_TEMPLATE`) y la validación que hace el
stream, para que no vuelva a haber una lista escrita a mano en cada sitio.

Vive en `application/` y no en `presentation/`: quien construye el prompt es
`orchestrator.py`, que es de esta capa. Si el contrato viviera en presentación,
el prompt importaría hacia arriba y se rompería la dirección de capas. Además es
lo que hace estas funciones probables sin levantar el stream: son puras, sin
FastAPI, sin SSE y sin base de datos.

Lo que este módulo NO hace, y es deliberado (ver AC-007 de la spec):

- no comprueba que el código compile ni parsee, en ningún lenguaje;
- no comprueba hechos, cifras ni citas;
- no juzga el markdown: cualquier texto es markdown válido, así que comprobarlo
  sería fingir una garantía;
- no reintenta nada. En streaming no se puede reintentar lo ya emitido.
"""

from typing import Optional

# Alias -> tipo canónico. El dict (y no un Enum) es justo lo que permite
# normalizar sin adivinar: admite las variantes que alguien decidió admitir, y
# ni una más.
ARTIFACT_TYPES: dict[str, str] = {
    "code": "code",
    "markdown": "markdown",
    "mermaid": "mermaid",
    "csv": "csv",
}

# 256 KB de contenido de artefacto. Escala: la pregunta del usuario está acotada
# a 10.000 caracteres, un acta real ronda 4-15 KB y un artefacto de código
# grande ~50 KB. Es ~10x el mayor artefacto legítimo observado y queda muy por
# debajo de lo que atasca al resaltador de sintaxis del navegador, que tokeniza
# línea a línea en el hilo principal.
#
# Este número vive AQUÍ y en ningún otro sitio: moverlo tiene que ser un diff de
# una línea.
ARTIFACT_MAX_BYTES: int = 262144

# Separadores que hacen de un texto una tabla. Mismo orden de prioridad que usa
# el visor (`frontend/src/components/artifacts/DataGrid.tsx`).
_SEPARADORES_CSV = ("|", "\t", ";", ",")

# Palabras con las que empieza un diagrama de Mermaid. Lista cerrada: si el
# modelo escribe prosa antes del diagrama, eso es exactamente el fallo que se
# quiere ver.
_INICIOS_MERMAID = (
    "graph",
    "flowchart",
    "sequencediagram",
    "classdiagram",
    "statediagram",
    "erdiagram",
    "journey",
    "gantt",
    "pie",
    "gitgraph",
    "mindmap",
    "timeline",
    "quadrantchart",
    "requirementdiagram",
    "sankey-beta",
    "xychart-beta",
    "block-beta",
    "architecture-beta",
    "packet-beta",
    "c4context",
    "kanban",
    "radar-beta",
)


def normalize_type(raw: Optional[str]) -> tuple[str, str]:
    """Normaliza el tipo declarado por el modelo.

    Devuelve `(tipo_efectivo, type_status)` donde `type_status` es `"ok"` o
    `"unknown"`.

    Se aplica SÓLO: recorte de espacios, minúsculas y los alias del dict.

    **Corregir un tipo por parecido está prohibido**, y no por gusto: una
    corrección por distancia de edición acertaría el 90 % de las veces y el 10 %
    restante pintaría el documento bajo un tipo que no es —con más confianza que
    antes, porque ya nadie avisaría—. Es el mismo defecto que este módulo
    arregla, sólo que disfrazado de ayuda. O se normaliza, o se declara
    desconocido; no hay tercera vía.

    Un `type` ausente o vacío cae a `code` con veredicto `ok`: no es una
    declaración equivocada del modelo, es el default histórico de la etiqueta.
    """
    if not raw:
        return "code", "ok"

    clave = raw.strip().lower()
    canonico = ARTIFACT_TYPES.get(clave)
    if canonico is None:
        return "code", "unknown"
    return canonico, "ok"


def check_content(tipo: str, contenido: str) -> str:
    """Juzga si el contenido es compatible con el tipo declarado.

    Devuelve `"ok"`, `"mismatch"` o `"unchecked"`. Un `mismatch` NUNCA modifica,
    repara ni oculta el contenido: sólo lo etiqueta.

    `markdown` y `code` devuelven siempre `"unchecked"`, y eso es una decisión,
    no un olvido: no hay forma de que un texto no sea markdown, y comprobar que
    un código compila es otro producto.
    """
    cuerpo = (contenido or "").strip()
    if not cuerpo:
        # Nada que contrastar. Un artefacto vacío no es incoherente con su tipo.
        return "unchecked"

    if tipo == "csv":
        primera = cuerpo.splitlines()[0]
        hay_separador = any(sep in primera for sep in _SEPARADORES_CSV)
        return "ok" if hay_separador else "mismatch"

    if tipo == "mermaid":
        primera = cuerpo.splitlines()[0].strip().lower()
        empieza_por_diagrama = primera.startswith(_INICIOS_MERMAID)
        return "ok" if empieza_por_diagrama else "mismatch"

    if tipo == "svg":
        return "ok" if "<svg" in cuerpo else "mismatch"

    return "unchecked"


def recortar_a_presupuesto(texto: str, ya_emitido: int) -> tuple[str, int, bool]:
    """Recorta un trozo de artefacto a lo que quepa en el presupuesto.

    Devuelve `(texto_a_emitir, bytes_consumidos, presupuesto_agotado)`.

    El recorte se hace en bytes y se descarta un carácter partido por la mitad:
    emitir medio carácter multibyte le llegaría al navegador como basura, y el
    corte tiene que verse limpio porque es visible para el usuario.
    """
    restante = ARTIFACT_MAX_BYTES - ya_emitido
    if restante <= 0:
        return "", 0, True

    crudo = texto.encode("utf-8")
    if len(crudo) <= restante:
        return texto, len(crudo), False

    return crudo[:restante].decode("utf-8", errors="ignore"), restante, True


def prompt_type_list() -> str:
    """La lista blanca en el formato que lee el modelo: `code|markdown|…`.

    Es la mitad de la guarda contra la desincronización: el prompt no puede
    ofrecer un tipo que el sistema no acepte porque no hay dónde escribirlo. La
    otra mitad es el test AC-001, que cruza esto con los dos mapas del cliente.
    """
    return "|".join(dict.fromkeys(ARTIFACT_TYPES.values()))
