"""Pydantic models para SPHERE Backend.

Este paquete existe para re-exportar: los nombres de abajo no se usan aquí, se ofrecen.
`__all__` es lo que los convierte en contrato en vez de en imports muertos — sin él, el
arreglo «obvio» del F401 es borrarlos y romper todo `from app.domain.models import X`.
"""
from app.domain.models.session import (
    SessionType, VisualConfig, ContextFile, SessionBase,
    CreateSessionRequest, UpdateSessionRequest, PinRequest, RatingRequest
)
from app.domain.models.agent import (
    AgentIdentity, BrainConfig, CustomAgentCreate,
    CustomAgentUpdate, CustomAgentResponse, ALLOWED_MODELS
)

__all__ = [
    # app.domain.models.session
    "SessionType",
    "VisualConfig",
    "ContextFile",
    "SessionBase",
    "CreateSessionRequest",
    "UpdateSessionRequest",
    "PinRequest",
    "RatingRequest",
    # app.domain.models.agent
    "AgentIdentity",
    "BrainConfig",
    "CustomAgentCreate",
    "CustomAgentUpdate",
    "CustomAgentResponse",
    "ALLOWED_MODELS",
]
