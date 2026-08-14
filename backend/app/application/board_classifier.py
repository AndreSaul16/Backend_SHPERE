"""
Clasificador de mensajes para Board Meeting.
Determina si un mensaje es trivial (1 iteración) o complejo (2 iteraciones).
"""

import os
from pathlib import Path
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage
from dotenv import load_dotenv

from app.core.logger import checkpoint_logger as logger
# `llm_models` es un módulo de constantes: no importa nada ni lee el entorno, así que no
# necesita ir después de load_dotenv(). Estaba abajo por costumbre, no por dependencia.
from app.core.llm_models import DEEPSEEK_FAST

# Cargar entorno
env_path = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(dotenv_path=env_path)

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")

# Modelo rápido para clasificación (no necesita reasoning)
classifier_llm = ChatOpenAI(
    model=DEEPSEEK_FAST,
    openai_api_key=DEEPSEEK_API_KEY,
    openai_api_base=DEEPSEEK_BASE_URL,
    temperature=0,
    streaming=False,
)

CLASSIFIER_PROMPT = """
Eres un clasificador de mensajes para una junta directiva de IA.

Tu ÚNICA función es determinar si un mensaje del usuario es TRIVIAL o COMPLEJO.

REGLAS:
- TRIVIAL: Saludos, preguntas simples, consultas que no requieren análisis profundo.
  Ejemplos: "Hola", "¿Cómo están?", "¿Qué hora es?", "Gracias"

- COMPLEJO: Preguntas estratégicas, análisis de negocio, decisiones que requieren
  múltiples perspectivas (técnica, financiera, de marketing).
  Ejemplos: "Quiero lanzar un producto de IA para pymes el próximo mes",
  "¿Deberíamos expandirnos a Europa?", "Necesito un plan para reducir costos"

RESPONDE SOLO CON UNA PALABRA: TRIVIAL o COMPLEJO

Mensaje del usuario: {query}
Clasificación:"""


async def classify_board_message(query: str) -> str:
    """
    Clasifica un mensaje como trivial o complejo.

    Args:
        query: Mensaje del usuario

    Returns:
        "trivial" o "complex"
    """
    try:
        prompt = CLASSIFIER_PROMPT.format(query=query)
        response = await classifier_llm.ainvoke([HumanMessage(content=prompt)])
        decision = response.content.strip().upper()

        if "COMPLEJO" in decision or "COMPLEX" in decision:
            logger.info(f"Board classifier: COMPLEJO - '{query[:50]}...'")
            return "complex"
        else:
            logger.info(f"Board classifier: TRIVIAL - '{query[:50]}...'")
            return "trivial"

    except Exception as e:
        logger.warning(f"Board classifier error, defaulting to trivial: {e}")
        return "trivial"
