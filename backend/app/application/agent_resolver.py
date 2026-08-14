"""
Servicio de resolución de configuración de agentes con overlay pattern.
Combina el prompt base del sistema con overrides del usuario.
"""
from typing import Optional
from app.infrastructure.database import get_custom_agents_collection, get_user_agent_overrides_collection
from app.application.orchestrator import DEFAULT_CORE_PROMPTS, CORE_ROLES
from app.core.user_context import build_user_context_block
from app.core.llm_models import DEEPSEEK_REASONING, normalize_model


class ResolvedAgent:
    """Configuración resuelta de un agente (base + overrides del usuario)."""
    def __init__(
        self,
        system_prompt: str,
        temperature: float = 0.3,
        model: str = DEEPSEEK_REASONING,
    ):
        self.system_prompt = system_prompt
        self.temperature = temperature
        self.model = model


async def resolve_agent_config(
    user_id: str,
    agent_role: str,
    user: Optional[dict] = None,
) -> ResolvedAgent:
    """
    Resuelve la configuración final de un agente:
    1. Lee el prompt base (core o custom)
   2. Aplica override del usuario si existe
   3. Prepend USER_CONTEXT si el usuario tiene perfil
    
    Returns:
        ResolvedAgent con system_prompt, temperature y model finales.
    """
    overrides_col = get_user_agent_overrides_collection()
    override = await overrides_col.find_one(
        {"user_id": user_id, "agent_role": agent_role}
    )

    # Determinar prompt base y config
    if agent_role in CORE_ROLES:
        base_prompt = DEFAULT_CORE_PROMPTS.get(agent_role, DEFAULT_CORE_PROMPTS["system"])
        base_temperature = 0.3
        base_model = DEEPSEEK_REASONING
    else:
        # Custom agent
        agents_col = get_custom_agents_collection()
        agent = await agents_col.find_one({"agent_id": agent_role})
        if agent:
            brain = agent.get("brain_config", {})
            base_prompt = brain.get("system_prompt", DEFAULT_CORE_PROMPTS["system"])
            base_temperature = brain.get("temperature", 0.3)
            base_model = normalize_model(brain.get("model"))
        else:
            base_prompt = DEFAULT_CORE_PROMPTS["system"]
            base_temperature = 0.3
            base_model = DEEPSEEK_REASONING

    # Aplicar overrides del usuario
    final_prompt = base_prompt
    final_temperature = base_temperature
    final_model = base_model

    if override:
        if override.get("system_prompt_addition"):
            final_prompt = base_prompt + "\n\n" + override["system_prompt_addition"]
        if override.get("temperature_override") is not None:
            final_temperature = override["temperature_override"]
        if override.get("model_override"):
            final_model = override["model_override"]

    # Prepend USER_CONTEXT si hay datos del usuario
    if user:
        user_context = build_user_context_block(user)
        if user_context:
            final_prompt = f"{user_context}\n\n{final_prompt}"

    return ResolvedAgent(
        system_prompt=final_prompt,
        temperature=final_temperature,
        model=final_model,
    )
